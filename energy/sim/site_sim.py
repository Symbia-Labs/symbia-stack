#!/usr/bin/env python3
"""
Symbia Energy — site simulator.

Publishes to MQTT exactly as a real site would. THERE IS NO DEMO PATH: the
simulator writes to the same ingress the field writes to, because a special
demo path is how demos start lying.

    python3 site_sim.py --scenario ../scenarios/nominal.yaml
    python3 site_sim.py --scenario ../scenarios/meter-death.yaml --speed 60
    python3 site_sim.py --scenario ../scenarios/meter-death.yaml --stdout

--stdout runs with no broker at all and prints truth-vs-reported, which is how
the scenarios double as a regression suite.

TRUTH LEDGER
------------
Every tick the simulator records what was TRUE alongside what it PUBLISHED.
Scenarios assert on the gap. That is what makes this a test rig rather than a
data faucet: we can prove the platform noticed, instead of hoping it did.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from electrical import Electrical, weather          # noqa: E402
from faults import from_scenario                    # noqa: E402
from workload import Workload, default_schedule     # noqa: E402

HERE = Path(__file__).parent
SITE_JSON = HERE.parent / "model" / "site.json"


def load_scenario(path: str | None) -> dict:
    if not path:
        return {"name": "nominal", "faults": []}
    p = Path(path)
    text = p.read_text()
    if p.suffix in (".yaml", ".yml"):
        try:
            import yaml
            return yaml.safe_load(text)
        except ImportError:
            print("pyyaml not installed; use a .json scenario or pip install pyyaml",
                  file=sys.stderr)
            raise
    return json.loads(text)


class Sim:
    def __init__(self, site: dict, scenario: dict):
        self.site = site
        self.scenario = scenario
        self.points = {p["id"]: p for p in site["points"]}
        topo = site["topology"]
        self.pods = topo["pods"]
        self.rack_design_kw = topo["rack_design_kw"]
        self.it_design_kw = topo["it_design_kw"]

        self.racks = [p["id"] for p in site["points"]
                      if p["equip"] == "rack_pdu" and p["role"] == "meter"]
        self.pod_of = {r: int(self.points[r]["instance"].split("r")[0][1:])
                       for r in self.racks}

        self.workload = Workload(
            racks=self.racks, rack_design_kw=self.rack_design_kw,
            jobs=default_schedule(self.racks))
        self.elec = Electrical(
            it_design_kw=self.it_design_kw, pods=self.pods,
            ups_rating_kw=self.it_design_kw * 0.75)
        self.faults = from_scenario(scenario)
        self.ups_mode = {"a1": "double_conversion", "b1": "double_conversion"}
        self.energy_kwh = 0.0

    # ------------------------------------------------------------------ tick
    def tick(self, t: float, dt: float) -> tuple[dict, list[dict]]:
        """Returns (truth, published). published is a list of {point, value}."""
        dry, wet = weather(t)
        rack_kw = self.workload.rack_kw(t)
        s = self.elec.solve(rack_kw, self.pod_of, self.ups_mode, dry)
        self.energy_kwh += s["utility_kw"] * (dt / 3600.0)

        raw: dict[str, object] = {}
        site = self.site["site"]

        raw[f"{site}.elec.utility.main.kw"] = round(s["utility_kw"], 2)
        raw[f"{site}.elec.utility.main.kwh"] = round(self.energy_kwh, 3)
        raw[f"{site}.elec.utility.main.pf"] = 0.98
        for t_i in (1, 2):
            raw[f"{site}.elec.transformer.t{t_i}.in_kw"] = round(s["transformer_in_kw"][t_i], 2)
            raw[f"{site}.elec.transformer.t{t_i}.out_kw"] = round(s["transformer_out_kw"][t_i], 2)
            raw[f"{site}.elec.transformer.t{t_i}.temp"] = round(
                45 + 22 * (s["transformer_in_kw"][t_i] / (self.it_design_kw * 1.1)), 2)
        for u in ("a1", "b1"):
            raw[f"{site}.elec.ups.{u}.input_kw"] = round(s["ups_in_kw"][u], 2)
            raw[f"{site}.elec.ups.{u}.output_kw"] = round(s["ups_out_kw"][u], 2)
            raw[f"{site}.elec.ups.{u}.mode"] = self.ups_mode[u]
            raw[f"{site}.elec.ups.{u}.battery_pct"] = 100.0
        for p, kw in s["busway_kw"].items():
            raw[f"{site}.elec.busway.p{p}.kw"] = round(kw, 2)
        for r, kw in rack_kw.items():
            raw[r] = round(kw, 3)
        raw[f"{site}.it.main.kw"] = round(s["it_total_kw"], 2)

        m = s["mech"]
        # chillers: CH-3 is standby and draws nothing unless a scenario says so
        raw[f"{site}.mech.chiller.ch1.kw"] = round(m["chillers"] * 0.52, 2)
        raw[f"{site}.mech.chiller.ch2.kw"] = round(m["chillers"] * 0.48, 2)
        raw[f"{site}.mech.chiller.ch3.kw"] = 0.0
        for c, st in ((1, "running"), (2, "running"), (3, "off")):
            raw[f"{site}.mech.chiller.ch{c}.status"] = st
            raw[f"{site}.mech.chiller.ch{c}.chw_supply_temp"] = 44.0
            raw[f"{site}.mech.chiller.ch{c}.chw_return_temp"] = 44.0 + 12.0
        raw[f"{site}.mech.chiller.chw_supply_sp"] = 44.0
        for d in range(1, 5):
            raw[f"{site}.mech.cdu.c{d}.kw"] = round(m["cdus"] / 4.0, 2)
            raw[f"{site}.mech.cdu.c{d}.supply_temp"] = 68.0
            raw[f"{site}.mech.cdu.c{d}.return_temp"] = 68.0 + 14.0
            raw[f"{site}.mech.cdu.c{d}.flow"] = round(s["it_total_kw"] * 0.06, 1)
            raw[f"{site}.mech.cdu.c{d}.supply_temp_sp"] = 68.0
        raw[f"{site}.mech.crah.h1.kw"] = round(m["crah"] * 0.5, 2)
        raw[f"{site}.mech.crah.h2.kw"] = round(m["crah"] * 0.5, 2)
        raw[f"{site}.mech.dry_cooler.dc1.kw"] = round(m["dry_cooler"], 2)
        raw[f"{site}.mech.total.kw"] = round(m["total"], 2)

        raw[f"{site}.env.weather.dry_bulb"] = dry
        raw[f"{site}.env.weather.wet_bulb"] = wet
        raw[f"{site}.grid.signal.price"] = round(38 + 30 * max(0.0, (t / 3600 % 24 - 14) / 6), 2)
        raw[f"{site}.grid.signal.carbon_intensity"] = round(
            310 + 90 * ((t / 3600 % 24 - 12) / 12) ** 2, 1)
        raw[f"{site}.grid.signal.dr_event"] = "none"
        raw[f"{site}.grid.command.shed_enable"] = False

        published = []
        for pid, val in raw.items():
            ok, out = self.faults.apply(pid, val, t)
            if ok:
                published.append({"point": pid, "value": out})

        truth = {
            "t": t, "it_kw": s["it_total_kw"], "utility_kw": s["utility_kw"],
            "mech_kw": m["total"], "true_pue": s["true_pue"],
            "dry_bulb": dry, "raw": raw,
        }
        return truth, published


# ---------------------------------------------------------------- publishing
class Publisher:
    def __init__(self, host: str, port: int, prefix: str, enabled: bool):
        self.enabled = enabled
        self.prefix = prefix
        self.client = None
        if not enabled:
            return
        import paho.mqtt.client as mqtt
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2,
                                  client_id="symbia-energy-sim")
        # Sparkplug-shaped birth/death: an LWT is how "missing" becomes a
        # positive signal rather than an absence someone has to infer.
        self.client.will_set(f"{prefix}/STATE/sim", "OFFLINE", qos=1, retain=True)
        self.client.connect(host, port, keepalive=30)
        self.client.loop_start()
        self.client.publish(f"{prefix}/STATE/sim", "ONLINE", qos=1, retain=True)

    def send(self, pid: str, value, ts: str) -> None:
        if not self.enabled:
            return
        topic = f"{self.prefix}/{pid.replace('.', '/')}"
        self.client.publish(topic, json.dumps({"v": value, "ts": ts}), qos=0)

    def close(self) -> None:
        if self.enabled and self.client:
            self.client.publish(f"{self.prefix}/STATE/sim", "OFFLINE", qos=1, retain=True)
            self.client.loop_stop()
            self.client.disconnect()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--scenario")
    ap.add_argument("--site", default=str(SITE_JSON))
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=1883)
    ap.add_argument("--prefix", default="symbia")
    ap.add_argument("--speed", type=float, default=1.0, help="sim seconds per real second")
    ap.add_argument("--tick", type=float, default=1.0)
    ap.add_argument("--start-hour", type=float, default=9.5)
    ap.add_argument("--duration-s", type=float, default=0, help="0 = run forever")
    ap.add_argument("--stdout", action="store_true", help="no broker; print truth vs reported")
    a = ap.parse_args()

    site = json.loads(Path(a.site).read_text())
    scenario = load_scenario(a.scenario)
    sim = Sim(site, scenario)
    pub = Publisher(a.host, a.port, a.prefix, enabled=not a.stdout)

    print(f"[sim] scenario={scenario.get('name')} points={len(sim.points)} "
          f"racks={len(sim.racks)} speed={a.speed}x "
          f"{'stdout' if a.stdout else f'mqtt://{a.host}:{a.port}/{a.prefix}'}")
    if scenario.get("faults"):
        for f in scenario["faults"]:
            print(f"[sim]   fault: {f['kind']} on {f['points']} at t={f['start_s']}s")

    t = a.start_hour * 3600.0
    t_end = t + a.duration_s if a.duration_s else None
    last_report = 0.0
    try:
        while t_end is None or t < t_end:
            truth, published = sim.tick(t, a.tick)
            now = datetime.now(timezone.utc).isoformat()
            for item in published:
                pub.send(item["point"], item["value"], now)

            if t - last_report >= 60 or a.stdout:
                pubmap = {i["point"]: i["value"] for i in published}
                it_rep = pubmap.get(f"{site['site']}.it.main.kw")
                ut_rep = pubmap.get(f"{site['site']}.elec.utility.main.kw")
                rep_pue = (ut_rep / it_rep) if (it_rep and ut_rep) else None
                flags = sim.faults.active_descriptions(t)
                print(f"t={t/3600:6.2f}h  IT true={truth['it_kw']:8.1f} "
                      f"rep={it_rep if it_rep is not None else 'ABSENT':>8}  "
                      f"PUE true={truth['true_pue']:.4f} "
                      f"rep={f'{rep_pue:.4f}' if rep_pue else 'UNCOMPUTABLE':>12}"
                      + (f"   [{', '.join(flags)}]" if flags else ""))
                last_report = t

            t += a.tick
            if not a.stdout:
                time.sleep(a.tick / max(0.001, a.speed))
            elif a.speed >= 1000:
                pass
            else:
                time.sleep(a.tick / max(0.001, a.speed))
    except KeyboardInterrupt:
        print("\n[sim] stopped")
    finally:
        pub.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
