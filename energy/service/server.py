#!/usr/bin/env python3
"""
Symbia Energy service — ingest + derive + board API.

Runs on :5010. Subscribes to the same MQTT ingress a real site publishes to,
stamps every reading against the point model, derives PUE / headroom / balance
using the refusal-first primitives in derive.py, and serves the Board.

    python3 server.py

WHY A SERVICE AND NOT ONLY GRAPH NODES
--------------------------------------
MQTT subscription is long-lived and stateful; the runtime's component model is
request/response. The DERIVE semantics — the part the product's claim rests on
— live in derive.py as pure functions so they can be ported to TypeScript
components verbatim, the same way graph.py was lifted from the runtime and
then supplied the execution model back. Nothing here special-cases the
simulator: it consumes MQTT, and a real site publishes MQTT.
"""
from __future__ import annotations

import json
import sys
import threading
from collections import deque
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import derive  # noqa: E402
import sinks   # noqa: E402

HERE = Path(__file__).parent
SITE_JSON = HERE.parent / "model" / "site.json"
PORT = 5010
MQTT_HOST, MQTT_PORT, PREFIX = "127.0.0.1", 1883, "symbia"

# dev/local standard: JSONL only. Greptime/Influx/Elastic arrive later behind
# the Sink interface in sinks.py, not by changing anything on the ingest path.
SINK_KIND = "jsonl"
SINK_DIR = HERE.parent / "data"

SITE = json.loads(SITE_JSON.read_text())
POINTS = {p["id"]: p for p in SITE["points"]}
S = SITE["site"]

# live state
READINGS: dict[str, dict] = {}
HISTORY: dict[str, deque] = {}
SIM_STATE = {"value": "unknown", "ts": None}
LOCK = threading.Lock()

RACKS = [p["id"] for p in SITE["points"]
         if p["equip"] == "rack_pdu" and p["role"] == "meter"]
MECH_BRANCHES = [p["id"] for p in SITE["points"]
                 if p.get("balance_group") == "mech_root"
                 and p.get("balance_role") == "branch"]
CHILLERS = [p["id"] for p in SITE["points"]
            if p["equip"] == "chiller" and p["role"] == "status"]

PUE_NUM = f"{S}.elec.utility.main.kw"
PUE_DEN = f"{S}.it.main.kw"


def topic_to_point(topic: str) -> str | None:
    parts = topic.split("/")
    if len(parts) < 3 or parts[0] != PREFIX:
        return None
    return ".".join(parts[1:])


# ------------------------------------------------------------------- ingest
def on_message(_c, _u, msg):
    t = msg.topic
    if t == f"{PREFIX}/STATE/sim":
        with LOCK:
            SIM_STATE["value"] = msg.payload.decode()
            SIM_STATE["ts"] = datetime.now(timezone.utc).isoformat()
        return

    pid = topic_to_point(t)
    if not pid:
        return
    try:
        body = json.loads(msg.payload.decode())
    except Exception:
        return

    if pid not in POINTS:
        # An unmapped point is a FINDING, not noise. Silent discard is how
        # site models rot.
        with LOCK:
            READINGS.setdefault("__unmapped__", {"points": set()})
            READINGS["__unmapped__"]["points"].add(pid)
        return

    p = POINTS[pid]
    reading = {"point": pid, "value": body.get("v"), "unit": p["unit"],
               "ts": body.get("ts"), "method": "measured", "lane": "canonical",
               "source": p.get("source", "")}
    # Persist the STAMPED reading, not the raw one: quality and age are part
    # of the record. Storing value+ts only would mean recomputing quality
    # later against a point model that may have changed, which is how a
    # record stops being a record.
    SINK.write([derive.stamp_quality(reading, p)])
    with LOCK:
        READINGS[pid] = reading
        if isinstance(body.get("v"), (int, float)):
            h = HISTORY.setdefault(pid, deque(maxlen=120))
            h.append((datetime.fromisoformat(
                str(body["ts"]).replace("Z", "+00:00")).timestamp(),
                float(body["v"])))


def stamped(pid: str) -> dict | None:
    """Current reading with quality/age applied. A point we have never heard
    from is `missing`, not absent — the difference between 'no data' and 'not
    asked' has to survive to the screen."""
    r = READINGS.get(pid)
    p = POINTS.get(pid)
    if p is None:
        return None
    if r is None:
        return {"point": pid, "value": None, "unit": p["unit"],
                "ts": None, "method": "measured", "lane": "canonical",
                "quality": "missing", "age_s": None,
                "uncomputable_reason": "no reading received since service start"}
    return derive.stamp_quality(r, p)


# ------------------------------------------------------------------- board
def build_board() -> dict:
    with LOCK:
        num = stamped(PUE_NUM)
        den = stamped(PUE_DEN)
        rack_readings = [stamped(r) for r in RACKS]
        mech_readings = [stamped(m) for m in MECH_BRANCHES]
        mech_total = stamped(f"{S}.mech.total.kw")
        chiller_status = [stamped(c) for c in CHILLERS]
        hist = list(HISTORY.get(PUE_DEN, []))
        unmapped = sorted(READINGS.get("__unmapped__", {}).get("points", set()))
        sim = dict(SIM_STATE)

    pue = derive.ratio(num, den, PUE_NUM, PUE_DEN, label="PUE")
    rack_roll = derive.rollup([r for r in rack_readings if r], RACKS)
    mech_roll = derive.rollup([r for r in mech_readings if r], MECH_BRANCHES)

    # IT main is separately metered AND derivable from racks — that is what
    # makes the balance check independent rather than self-confirming.
    balance_it = derive.energy_balance(
        den, [r for r in rack_readings if r], PUE_DEN, tolerance_pct=3.0)
    balance_mech = derive.energy_balance(
        mech_total, [r for r in mech_readings if r],
        f"{S}.mech.total.kw", tolerance_pct=2.0)

    # A meter can be alive, fresh, and lying. dc1.it.main.kw reporting 0 while
    # 160 racks report 4 MW is quality:good by every freshness test — and
    # wrong. When an independent check disputes a point, that dispute belongs
    # ON the point, not only in a panel further down the page. This is the
    # "two sources disagree and the UI shows the emptier one" failure, caught
    # here rather than shipped.
    if den is not None and balance_it.get("status") == "breach":
        den = {**den, "disputed_by": "energy_balance",
               "disputed_reason": balance_it.get("reason")}
    if mech_total is not None and balance_mech.get("status") == "breach":
        mech_total = {**mech_total, "disputed_by": "energy_balance",
                      "disputed_reason": balance_mech.get("reason")}

    chillers_running = sum(1 for c in chiller_status
                           if c and c.get("value") == "running")
    util_pt = POINTS[PUE_NUM]
    head = derive.capacity(num, util_pt.get("rating"), None)

    dpdt = derive.rate(hist[-20:]) if len(hist) >= 2 else None

    return {
        "site": S,
        "served_at": datetime.now(timezone.utc).isoformat(),
        "sim_state": sim,
        "points_known": len(POINTS),
        "points_reporting": sum(
            1 for pid in POINTS
            if (stamped(pid) or {}).get("quality") in ("good", "stale")),
        "unmapped_points": unmapped,
        "sink": SINK.stats(),
        "tiles": {
            "pue": pue,
            "it_load": den,
            "utility": num,
            "mech_total": mech_total,
            "rack_rollup": rack_roll,
            "mech_rollup": mech_roll,
            "headroom": head,
            "dpdt": dpdt,
        },
        "balance": {"it": balance_it, "mech": balance_mech},
        "redundancy": {
            "chillers": {"available": chillers_running, "total": len(CHILLERS),
                         "rule": "N+1",
                         "degraded": chillers_running < len(CHILLERS) - 1},
        },
    }


# --------------------------------------------------------------------- http
def make_app():
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

    class H(BaseHTTPRequestHandler):
        def _json(self, code, obj):
            b = json.dumps(obj, default=str).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(b)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(b)

        def do_GET(self):
            path = self.path.split("?")[0]
            if path == "/health":
                return self._json(200, {"status": "ok", "service": "energy",
                                        "points": len(POINTS)})
            if path == "/api/energy/board":
                return self._json(200, build_board())
            if path == "/api/energy/points":
                return self._json(200, {"points": [
                    {**POINTS[p], "reading": stamped(p)} for p in POINTS]})
            if path.startswith("/api/energy/point/"):
                pid = path.rsplit("/", 1)[-1]
                if pid not in POINTS:
                    return self._json(404, {"error": f"unknown point {pid}"})
                return self._json(200, {"point": POINTS[pid],
                                        "reading": stamped(pid),
                                        "history": list(HISTORY.get(pid, []))[-60:]})
            if path == "/docs/llms.txt":
                return self._json(200, {"endpoints": [
                    "GET /health", "GET /api/energy/board",
                    "GET /api/energy/points", "GET /api/energy/point/{id}"]})
            return self._json(404, {"error": "not found"})

        def log_message(self, *_):
            pass

    return ThreadingHTTPServer(("0.0.0.0", PORT), H)


SINK: sinks.Sink = sinks.NullSink()


def main() -> int:
    global SINK
    import paho.mqtt.client as mqtt
    SINK = sinks.build_sink(SINK_KIND, SINK_DIR)
    c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="symbia-energy-svc")
    c.on_message = on_message
    c.connect(MQTT_HOST, MQTT_PORT, keepalive=30)
    c.subscribe(f"{PREFIX}/#")
    c.loop_start()

    print(f"[energy] {len(POINTS)} points, {len(RACKS)} racks")
    print(f"[energy] mqtt {MQTT_HOST}:{MQTT_PORT}/{PREFIX}/#")
    print(f"[energy] http :{PORT}  /api/energy/board")
    srv = make_app()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n[energy] stopped")
    finally:
        c.loop_stop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
