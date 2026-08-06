#!/usr/bin/env python3
"""Energy pipeline — the platform-honest version.

Simulator -> Runtime ingest graph -> Runtime PUE graph (exact arithmetic,
canonical lane) -> Logging metrics.

No MQTT broker, no unregistered service, no hand-edited proxy. Every hop is a
platform API the 2026-08-06 gap sweep verified:

  sim.tick()                          (in-process; energy/sim, no broker)
  POST /api/graphs                    (runtime: load graph definitions)
  POST /api/graphs/{id}/execute       (runtime: start executions)
  POST /api/executions/{id}/inject    (runtime: readings in, outputs+trace back)
  POST /api/metrics + /metrics/ingest (logging: persist derived series)

Usage:
  python3 pipeline.py --once          one tick, print verification detail
  python3 pipeline.py                 run forever (2s ticks)
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "sim"))

from site_sim import Sim, load_scenario, SITE_JSON  # noqa: E402

IDENTITY = "http://localhost:5001"
RUNTIME = "http://localhost:5006"
LOGGING = "http://localhost:5002"
EMAIL = "gap-probe@symbia.test"
PASSWORD = "GapProbe!2026x"
PUE_NUM = "dc1.elec.utility.main.kw"
PUE_DEN = "dc1.it.main.kw"


_token: str | None = None


def api(base: str, path: str, body: dict | None = None, method: str | None = None) -> dict:
    global _token
    if _token is None and base != IDENTITY:
        _login()
    m = method or ("POST" if body is not None else "GET")
    req = urllib.request.Request(f"{base}{path}", method=m)
    req.add_header("Accept", "application/json")
    if _token:
        req.add_header("Authorization", f"Bearer {_token}")
    data = None
    if body is not None:
        req.add_header("Content-Type", "application/json")
        data = json.dumps(body).encode()
    try:
        with urllib.request.urlopen(req, data=data, timeout=15) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        detail = e.read()[:300].decode(errors="replace")
        raise RuntimeError(f"{m} {base}{path} -> {e.code}: {detail}") from None


def _login() -> None:
    global _token
    req = urllib.request.Request(f"{IDENTITY}/api/auth/login", method="POST")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(
        req, data=json.dumps({"email": EMAIL, "password": PASSWORD}).encode(), timeout=10
    ) as r:
        _token = json.loads(r.read())["token"]


def load_graphs() -> dict[str, str]:
    """Load both graph definitions into the runtime; return name -> executionId."""
    execs: dict[str, str] = {}
    for fname in ("energy-ingest.graph.json", "energy-pue.graph.json"):
        definition = json.loads((HERE.parent / "graphs" / fname).read_text())
        loaded = api(RUNTIME, "/api/graphs", body=definition)
        graph_id = loaded.get("id") or loaded.get("graphId") or definition["name"]
        started = api(RUNTIME, f"/api/graphs/{graph_id}/execute", body={})
        execs[definition["name"]] = started["executionId"]
        print(f"[pipeline] loaded {definition['name']} (graph {graph_id}, "
              f"execution {started['executionId']})")
    return execs


def inject(execution_id: str, value: dict) -> dict:
    return api(RUNTIME, f"/api/executions/{execution_id}/inject",
               body={"nodeId": "entry", "port": "in", "value": value})


def ensure_metrics() -> dict[str, str]:
    """Create (or reuse) gauge metrics for the derived series; name -> metricId."""
    wanted = {
        "energy.facility_kw": "Total facility power at the utility main (kW)",
        "energy.it_kw": "IT load power (kW)",
        "energy.pue": "Power Usage Effectiveness (facility kW / IT kW)",
    }
    existing = api(LOGGING, "/api/metrics")
    rows = existing if isinstance(existing, list) else existing.get("data", existing.get("metrics", []))
    by_name = {m.get("name"): m.get("id") for m in rows if isinstance(m, dict)}
    ids: dict[str, str] = {}
    for name, description in wanted.items():
        if by_name.get(name):
            ids[name] = by_name[name]
        else:
            created = api(LOGGING, "/api/metrics", body={
                "name": name, "metricType": "gauge",
                "unit": "ratio" if name.endswith("pue") else "kW",
                "description": description, "labels": ["site"],
            })
            ids[name] = created.get("id") or created.get("metric", {}).get("id")
        print(f"[pipeline] metric {name} -> {ids[name]}")
    return ids


def run(once: bool, scenario_path: str | None, tick_s: float) -> int:
    site = json.loads(Path(SITE_JSON).read_text())
    scenario = load_scenario(scenario_path)
    sim = Sim(site, scenario)
    execs = load_graphs()
    metric_ids = ensure_metrics()

    t = 9.5 * 3600.0  # sim clock: start mid-morning like the recorded runs
    while True:
        state, readings = sim.tick(t, tick_s)
        t += tick_s

        latest: dict[str, float] = {}
        ingested = rejected = 0
        for reading in readings:
            result = inject(execs["energy-ingest"], reading)
            if result.get("outputs"):
                ingested += 1
            else:
                rejected += 1
            value = reading.get("value")
            if isinstance(value, (int, float)):
                latest[reading["point"]] = float(value)

        line = {"ts": datetime.now(timezone.utc).isoformat(), "ingested": ingested,
                "rejected": rejected}

        facility, it = latest.get(PUE_NUM), latest.get(PUE_DEN)
        if facility is not None and it is not None:
            derived = inject(execs["energy-pue"],
                             {"facility_kw": facility, "it_kw": it})
            sink = (derived.get("outputs") or {}).get("sink:out") or {}
            payload = sink.get("value") if isinstance(sink.get("value"), dict) else {}
            pue = payload.get("result")
            lane = sink.get("lane")
            line.update({"facility_kw": round(facility, 2), "it_kw": round(it, 2),
                         "pue": pue if pue is None else round(float(pue), 4),
                         "lane": lane, "hops": derived.get("hops")})
            if isinstance(pue, (int, float)):
                # NOTE: the Logging openapi spec claims per-point metricIds in one
                # batch; the implementation wants {metricId, dataPoints} per metric
                # (spec/impl mismatch found 2026-08-06 — recorded in the gap list).
                now = datetime.now(timezone.utc).isoformat()
                for name, value in (("energy.facility_kw", facility),
                                    ("energy.it_kw", it),
                                    ("energy.pue", float(pue))):
                    api(LOGGING, "/api/metrics/ingest", body={
                        "metricId": metric_ids[name],
                        "dataPoints": [{"timestamp": now, "value": value,
                                        "labels": {"site": "dc1"}}],
                    })

        print(json.dumps(line), flush=True)
        if once:
            expected = None if not (facility and it) else facility / it
            print(f"[verify] expected PUE {expected} — graph returned {line.get('pue')}"
                  f" (lane={line.get('lane')})")
            return 0
        time.sleep(tick_s)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--scenario", default=None)
    ap.add_argument("--tick", type=float, default=2.0)
    args = ap.parse_args()
    sys.exit(run(args.once, args.scenario, args.tick))
