#!/usr/bin/env python3
"""
Symbia Energy — synthetic site model generator.

Emits a point model that validates against schema/point.schema.json.

WHY SYNTHETIC, AND WHAT THAT COSTS
----------------------------------
Brian chose synthetic-now over a real tag export. The risk that buys is
modelling a data center that could not exist. Two guards against it:

  1. Every point is generated from a TOPOLOGY, not a list. Racks feed busways
     feed UPS feed transformers feed the utility. If the topology is wrong the
     energy-balance check fails immediately and visibly, because that check
     reconciles each parent against the sum of its declared children.

  2. Nothing downstream may special-case a synthetic point. The graphs consume
     the schema, not this file. Swapping in a real export means replacing
     site.json — no graph, component or panel changes.

Site defaults are chosen to be plausible and legible for an AI DC. They are
NOT claims about any real facility. Every one is a CLI flag.

    python3 build_site.py --out site.json
    python3 build_site.py --pods 8 --racks-per-pod 60 --out big-site.json
"""
import argparse
import json
import sys
from pathlib import Path

SITE = "dc1"


def P(pid, name, system, equip, role, kind, unit, max_age_s, **kw):
    """Build one point. max_age_s is positional-required on purpose: there is
    no sane default for 'how long does this value stay true', and defaulting it
    is how stale readings start rendering as current."""
    p = {
        "id": pid, "name": name, "system": system, "equip": equip,
        "role": role, "kind": kind, "unit": unit, "max_age_s": max_age_s,
    }
    p.update({k: v for k, v in kw.items() if v is not None})
    return p


def build(pods: int, racks_per_pod: int, rack_kw: float) -> dict:
    pts: list[dict] = []
    it_design = pods * racks_per_pod * rack_kw

    # ---------------------------------------------------------------- utility
    # The parent of the whole electrical balance group. Its value should equal
    # the sum of the transformer inputs, within meter tolerance. When it does
    # not, something is wrong and the tool must say so rather than pick one.
    pts += [
        P(f"{SITE}.elec.utility.main.kw", "Utility main power", "elec", "utility",
          "meter", "number", "kW", 10,
          rating=round(it_design * 1.9, 1), source="mqtt:dc1/elec/utility/main/kw",
          balance_group="elec_root", balance_role="parent",
          tags=["power", "utility", "main"]),
        P(f"{SITE}.elec.utility.main.kwh", "Utility main energy", "elec", "utility",
          "meter", "number", "kWh", 60, source="mqtt:dc1/elec/utility/main/kwh",
          tags=["energy", "utility"]),
        P(f"{SITE}.elec.utility.main.pf", "Utility power factor", "elec", "utility",
          "meter", "number", "none", 30, source="mqtt:dc1/elec/utility/main/pf"),
    ]

    # ----------------------------------------------------------- transformers
    for t in (1, 2):
        pts += [
            P(f"{SITE}.elec.transformer.t{t}.in_kw", f"Transformer T{t} input",
              "elec", "transformer", "meter", "number", "kW", 10, instance=f"t{t}",
              rating=round(it_design * 1.1, 1),
              fedBy=[f"{SITE}.elec.utility.main.kw"],
              balance_group="elec_root", balance_role="branch",
              redundancy_group="transformers", redundancy_rule="2N",
              source=f"mqtt:dc1/elec/transformer/t{t}/in_kw"),
            P(f"{SITE}.elec.transformer.t{t}.out_kw", f"Transformer T{t} output",
              "elec", "transformer", "meter", "number", "kW", 10, instance=f"t{t}",
              fedBy=[f"{SITE}.elec.transformer.t{t}.in_kw"],
              source=f"mqtt:dc1/elec/transformer/t{t}/out_kw"),
            P(f"{SITE}.elec.transformer.t{t}.temp", f"Transformer T{t} winding temp",
              "elec", "transformer", "sensor", "number", "degC", 30, instance=f"t{t}",
              source=f"mqtt:dc1/elec/transformer/t{t}/temp"),
        ]

    # -------------------------------------------------------------------- UPS
    # 2N: either UPS alone must carry the load. Preflight refuses writes when
    # this group is degraded.
    for u in ("a1", "b1"):
        pts += [
            P(f"{SITE}.elec.ups.{u}.input_kw", f"UPS {u.upper()} input", "elec", "ups",
              "meter", "number", "kW", 10, instance=u,
              fedBy=[f"{SITE}.elec.transformer.t{1 if u.startswith('a') else 2}.out_kw"],
              source=f"mqtt:dc1/elec/ups/{u}/input_kw"),
            P(f"{SITE}.elec.ups.{u}.output_kw", f"UPS {u.upper()} output", "elec", "ups",
              "meter", "number", "kW", 10, instance=u,
              rating=round(it_design * 0.75, 1),
              redundancy_group="ups", redundancy_rule="2N",
              fedBy=[f"{SITE}.elec.ups.{u}.input_kw"],
              balance_group="ups_out", balance_role="parent",
              source=f"mqtt:dc1/elec/ups/{u}/output_kw"),
            P(f"{SITE}.elec.ups.{u}.mode", f"UPS {u.upper()} mode", "elec", "ups",
              "status", "enum", "none", 15, instance=u,
              enum_values=["double_conversion", "eco", "bypass", "battery"],
              redundancy_group="ups",
              source=f"mqtt:dc1/elec/ups/{u}/mode"),
            P(f"{SITE}.elec.ups.{u}.battery_pct", f"UPS {u.upper()} battery", "elec", "ups",
              "meter", "number", "pct", 30, instance=u,
              source=f"mqtt:dc1/elec/ups/{u}/battery_pct"),
            # The only electrical WRITE in v0. gated: needs human approval.
            P(f"{SITE}.elec.ups.{u}.mode_sp", f"UPS {u.upper()} mode setpoint",
              "elec", "ups", "setpoint", "enum", "none", 60, instance=u,
              enum_values=["double_conversion", "eco"],
              write_class="gated", write_rate_limit_per_s=0.002,
              source=f"mqtt:dc1/elec/ups/{u}/mode_sp"),
        ]

    # ---------------------------------------------------------- pods / busways
    for pod in range(1, pods + 1):
        bw = f"{SITE}.elec.busway.p{pod}.kw"
        pts.append(
            P(bw, f"Busway pod {pod}", "elec", "busway", "meter", "number", "kW", 5,
              instance=f"p{pod}", rating=round(racks_per_pod * rack_kw * 1.25, 1),
              fedBy=[f"{SITE}.elec.ups.a1.output_kw", f"{SITE}.elec.ups.b1.output_kw"],
              balance_group=f"busway_p{pod}", balance_role="parent",
              source=f"mqtt:dc1/elec/busway/p{pod}/kw"))
        for r in range(1, racks_per_pod + 1):
            rid = f"{SITE}.it.rack.p{pod}r{r:02d}.kw"
            pts.append(
                P(rid, f"Rack P{pod}R{r:02d}", "it", "rack_pdu", "meter", "number",
                  "kW", 5, instance=f"p{pod}r{r:02d}", rating=rack_kw * 1.2,
                  fedBy=[bw], balance_group=f"busway_p{pod}", balance_role="branch",
                  source=f"mqtt:dc1/it/rack/p{pod}r{r:02d}/kw",
                  tags=["it_load", f"pod{pod}"]))

    # IT main is separately METERED as well as derivable from racks. That is
    # deliberate: it gives the PUE numerator an independent check, and it is
    # the point the demo kills in Act 2.
    pts.append(
        P(f"{SITE}.it.main.kw", "IT total load", "it", "busway", "meter", "number",
          "kW", 10, rating=round(it_design * 1.2, 1),
          source="mqtt:dc1/it/main/kw", tags=["it_load", "pue_input"]))

    # ------------------------------------------------------------- mechanical
    for c in (1, 2, 3):
        standby = c == 3
        pts += [
            P(f"{SITE}.mech.chiller.ch{c}.kw", f"Chiller CH-{c} power", "mech", "chiller",
              "meter", "number", "kW", 10, instance=f"ch{c}",
              rating=round(it_design * 0.22, 1),
              redundancy_group="chillers", redundancy_rule="N+1",
              balance_group="mech_root", balance_role="branch",
              source=f"mqtt:dc1/mech/chiller/ch{c}/kw",
              tags=["mech_load"] + (["standby"] if standby else [])),
            P(f"{SITE}.mech.chiller.ch{c}.status", f"Chiller CH-{c} status", "mech",
              "chiller", "status", "enum", "none", 15, instance=f"ch{c}",
              enum_values=["running", "off", "fault", "maintenance"],
              redundancy_group="chillers",
              source=f"mqtt:dc1/mech/chiller/ch{c}/status"),
            P(f"{SITE}.mech.chiller.ch{c}.chw_supply_temp", f"CH-{c} CHW supply",
              "mech", "chiller", "sensor", "number", "degF", 15, instance=f"ch{c}",
              source=f"mqtt:dc1/mech/chiller/ch{c}/chw_supply_temp"),
            P(f"{SITE}.mech.chiller.ch{c}.chw_return_temp", f"CH-{c} CHW return",
              "mech", "chiller", "sensor", "number", "degF", 15, instance=f"ch{c}",
              source=f"mqtt:dc1/mech/chiller/ch{c}/chw_return_temp"),
        ]
    pts.append(
        P(f"{SITE}.mech.chiller.chw_supply_sp", "CHW supply setpoint", "mech", "chiller",
          "setpoint", "number", "degF", 60, write_class="gated",
          write_min=42.0, write_max=52.0, write_rate_limit_per_s=0.0033,
          source="mqtt:dc1/mech/chiller/chw_supply_sp",
          tags=["control", "thermal"]))

    for d in range(1, 5):
        pts += [
            P(f"{SITE}.mech.cdu.c{d}.kw", f"CDU-{d} pump power", "mech", "cdu",
              "meter", "number", "kW", 10, instance=f"c{d}",
              rating=round(it_design * 0.012, 1),
              redundancy_group="cdus", redundancy_rule="N+1",
              balance_group="mech_root", balance_role="branch",
              source=f"mqtt:dc1/mech/cdu/c{d}/kw", tags=["mech_load"]),
            P(f"{SITE}.mech.cdu.c{d}.supply_temp", f"CDU-{d} secondary supply", "mech",
              "cdu", "sensor", "number", "degF", 10, instance=f"c{d}",
              source=f"mqtt:dc1/mech/cdu/c{d}/supply_temp", tags=["dlc"]),
            P(f"{SITE}.mech.cdu.c{d}.return_temp", f"CDU-{d} secondary return", "mech",
              "cdu", "sensor", "number", "degF", 10, instance=f"c{d}",
              source=f"mqtt:dc1/mech/cdu/c{d}/return_temp", tags=["dlc"]),
            P(f"{SITE}.mech.cdu.c{d}.flow", f"CDU-{d} secondary flow", "mech", "cdu",
              "sensor", "number", "gpm", 10, instance=f"c{d}",
              source=f"mqtt:dc1/mech/cdu/c{d}/flow"),
            # approach temp is DERIVED, not metered — it is the CDU degradation
            # signal and the case for gray-zone diagnosis over threshold alarms.
            P(f"{SITE}.mech.cdu.c{d}.supply_temp_sp", f"CDU-{d} supply setpoint", "mech",
              "cdu", "setpoint", "number", "degF", 60, instance=f"c{d}",
              write_class="gated", write_min=60.0, write_max=85.0,
              write_rate_limit_per_s=0.0033,
              source=f"mqtt:dc1/mech/cdu/c{d}/supply_temp_sp"),
        ]

    for h in (1, 2):
        pts.append(
            P(f"{SITE}.mech.crah.h{h}.kw", f"CRAH-{h} power", "mech", "crah", "meter",
              "number", "kW", 10, instance=f"h{h}",
              rating=round(it_design * 0.03, 1),
              balance_group="mech_root", balance_role="branch",
              source=f"mqtt:dc1/mech/crah/h{h}/kw", tags=["mech_load"]))
    pts.append(
        P(f"{SITE}.mech.dry_cooler.dc1.kw", "Dry cooler power", "mech", "dry_cooler",
          "meter", "number", "kW", 10, rating=round(it_design * 0.02, 1),
          balance_group="mech_root", balance_role="branch",
          source="mqtt:dc1/mech/dry_cooler/dc1/kw", tags=["mech_load"]))
    pts.append(
        P(f"{SITE}.mech.total.kw", "Mechanical total", "mech", "utility", "meter",
          "number", "kW", 10, balance_group="mech_root", balance_role="parent",
          source="mqtt:dc1/mech/total/kw", tags=["pue_input"]))

    # ------------------------------------------------------------- env / grid
    pts += [
        P(f"{SITE}.env.weather.dry_bulb", "Outdoor dry bulb", "env", "weather",
          "sensor", "number", "degF", 300, source="mqtt:dc1/env/weather/dry_bulb"),
        P(f"{SITE}.env.weather.wet_bulb", "Outdoor wet bulb", "env", "weather",
          "sensor", "number", "degF", 300, source="mqtt:dc1/env/weather/wet_bulb"),
        P(f"{SITE}.grid.signal.price", "Day-ahead price", "grid", "market", "signal",
          "number", "usd_per_mwh", 900, source="mqtt:dc1/grid/signal/price"),
        P(f"{SITE}.grid.signal.carbon_intensity", "Grid carbon intensity", "grid",
          "market", "signal", "number", "gco2_per_kwh", 900,
          source="mqtt:dc1/grid/signal/carbon_intensity"),
        P(f"{SITE}.grid.signal.dr_event", "Demand response event", "grid", "market",
          "signal", "enum", "none", 300,
          enum_values=["none", "notice", "active", "ended"],
          source="mqtt:dc1/grid/signal/dr_event"),
        P(f"{SITE}.grid.command.shed_enable", "Load shed enable", "grid", "market",
          "command", "bool", "none", 60, write_class="gated",
          write_rate_limit_per_s=0.0033,
          source="mqtt:dc1/grid/command/shed_enable", tags=["control"]),
    ]

    return {
        "site": SITE,
        "generated_by": "energy/model/build_site.py",
        "topology": {
            "pods": pods, "racks_per_pod": racks_per_pod,
            "rack_design_kw": rack_kw, "it_design_kw": it_design,
        },
        "points": pts,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pods", type=int, default=4)
    ap.add_argument("--racks-per-pod", type=int, default=40)
    ap.add_argument("--rack-kw", type=float, default=60.0)
    ap.add_argument("--out", default=str(Path(__file__).parent / "site.json"))
    a = ap.parse_args()

    site = build(a.pods, a.racks_per_pod, a.rack_kw)
    Path(a.out).write_text(json.dumps(site, indent=2))

    pts = site["points"]
    by_sys: dict[str, int] = {}
    for p in pts:
        by_sys[p["system"]] = by_sys.get(p["system"], 0) + 1
    writable = [p for p in pts if p["role"] in ("setpoint", "command")]

    print(f"wrote {a.out}")
    print(f"  points        {len(pts)}")
    print(f"  by system     {by_sys}")
    print(f"  IT design     {site['topology']['it_design_kw']:.0f} kW")
    print(f"  writable      {len(writable)} (all write_class=gated)")
    print(f"  balance grps  {len({p.get('balance_group') for p in pts if p.get('balance_group')})}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
