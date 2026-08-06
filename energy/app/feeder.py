#!/usr/bin/env python3
"""Energy feeder — delivery only.

With state operators, sinks, and ingress in the runtime, the graph does the
whole job (validate -> join -> derive PUE -> persist metrics). This process
is reduced to what legitimately lives outside the platform: the device twin.
It generates readings and POSTs them to the graph's ingress. No state, no
derivation, no persistence here.

  python3 feeder.py --once     one tick, print the graph's derived output
  python3 feeder.py            run forever
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "sim"))

from site_sim import Sim, load_scenario, SITE_JSON  # noqa: E402

IDENTITY = "http://localhost:5001"
RUNTIME = "http://localhost:5006"
EMAIL = "gap-probe@symbia.test"
PASSWORD = "GapProbe!2026x"
GRAPH_FILE = HERE.parent / "graphs" / "energy-pipeline.graph.json"

_token: str | None = None


def api(base: str, path: str, body: dict | None = None) -> dict:
    req = urllib.request.Request(f"{base}{path}",
                                 method="POST" if body is not None else "GET")
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
        raise RuntimeError(f"{base}{path} -> {e.code}: {e.read()[:200].decode(errors='replace')}") from None


def login() -> None:
    global _token
    req = urllib.request.Request(f"{IDENTITY}/api/auth/login", method="POST")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(
        req, data=json.dumps({"email": EMAIL, "password": PASSWORD}).encode(), timeout=10
    ) as r:
        _token = json.loads(r.read())["token"]


def ensure_pipeline() -> None:
    """Load + execute the graph if no running instance exists (until the
    runtime hydrates graphs from the catalog on boot, someone must)."""
    try:
        api(RUNTIME, "/api/ingress/energy-pipeline", body={"probe": True})
        return  # a running execution answered
    except RuntimeError:
        pass
    definition = json.loads(GRAPH_FILE.read_text())
    loaded = api(RUNTIME, "/api/graphs", body=definition)
    graph_id = loaded.get("id") or loaded.get("graphId")
    started = api(RUNTIME, f"/api/graphs/{graph_id}/execute", body={})
    print(f"[feeder] loaded energy-pipeline (graph {graph_id}, "
          f"execution {started['executionId']})", flush=True)


def run(once: bool, scenario_path: str | None, tick_s: float) -> int:
    login()
    ensure_pipeline()
    site = json.loads(Path(SITE_JSON).read_text())
    sim = Sim(site, load_scenario(scenario_path))
    t = 9.5 * 3600.0
    while True:
        _state, readings = sim.tick(t, tick_s)
        t += tick_s
        # One batch delivery per tick: the ingress fans the array out in-graph.
        resp = api(RUNTIME, "/api/ingress/energy-pipeline", body=readings)
        delivered = resp.get("delivered", 0)
        last = (resp.get("outputs") or {}).get("sink:out") or {}
        pue = ((last.get("value") or {}).get("result")
               if isinstance(last.get("value"), dict) else None)
        print(json.dumps({"delivered": delivered,
                          "pue": None if pue is None else round(float(pue), 4),
                          "lane": last.get("lane")}), flush=True)
        if once:
            print(f"[verify] graph-derived PUE: {pue} (lane={last.get('lane')})")
            return 0
        time.sleep(tick_s)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--scenario", default=None)
    ap.add_argument("--tick", type=float, default=2.0)
    args = ap.parse_args()
    sys.exit(run(args.once, args.scenario, args.tick))
