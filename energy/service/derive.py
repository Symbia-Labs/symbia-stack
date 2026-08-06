"""
Symbia Energy — the derive primitives.

Python reference implementations of the components named in the proposal
(quality.stamp, compute.rollup, compute.ratio, compute.rate, compute.capacity,
plus the energy-balance check). They live here so the semantics are testable
without a container rebuild — the workbench proved that porting a proven
implementation beats writing a second one from a spec.

THE ONE RULE THAT MATTERS
-------------------------
Every function has a REFUSAL RETURN. rollup emits `incomplete`, ratio emits
`undefined`. Neither ever returns a number built from bad inputs. This is the
Symbia Script port model in Python: only the emitted port fires, and there is
no edge from `incomplete` to a value.
"""
from __future__ import annotations

from datetime import datetime, timezone


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def stamp_quality(reading: dict, point: dict, now: datetime | None = None) -> dict:
    """quality.stamp — freshness is a first-class fact, not a footnote.

    A value that stops changing still has a timestamp. Ageing it is the only
    defence against a plausible number that stopped being true hours ago, and
    it is what the meter-freeze scenario exercises.
    """
    now = now or now_utc()
    ts = reading.get("ts")
    if reading.get("value") is None:
        return {**reading, "quality": "missing", "value": None, "age_s": None}
    if ts is None:
        return {**reading, "quality": "uncertain", "age_s": None}

    t = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
    age = (now - t).total_seconds()
    max_age = point.get("max_age_s", 60)
    return {**reading,
            "quality": "good" if age <= max_age else "stale",
            "age_s": round(age, 2)}


def rollup(readings: list[dict], expected: list[str], op: str = "sum") -> dict:
    """compute.rollup — emits `incomplete` if ANY expected member is absent.

    A partial sum presented as a total is the same species of lie as a dead
    meter, and harder to spot because the number still moves plausibly.
    """
    by_id = {r["point"]: r for r in readings}
    missing, degraded, vals = [], [], []
    for pid in expected:
        r = by_id.get(pid)
        if r is None or r.get("value") is None or r.get("quality") == "missing":
            missing.append(pid)
            continue
        if r.get("quality") != "good":
            degraded.append(f"{pid}({r.get('quality')})")
        vals.append(float(r["value"]))

    if missing:
        return {
            "port": "incomplete", "value": None, "missing": missing,
            "have": len(vals), "expected": len(expected),
            "uncomputable_reason":
                f"{len(missing)} of {len(expected)} inputs unavailable: "
                + ", ".join(missing[:3])
                + (f" (+{len(missing) - 3} more)" if len(missing) > 3 else ""),
        }

    v = sum(vals) if op == "sum" else (
        sum(vals) / len(vals) if op == "avg" else max(vals))
    return {
        "port": "value", "value": round(v, 3), "method": "computed",
        "expression": f"{op} of {len(vals)} points",
        "inputs": [{"point": p, "value": by_id[p]["value"],
                    "ts": by_id[p].get("ts"), "quality": by_id[p].get("quality")}
                   for p in expected[:6]],
        "input_count": len(expected),
        "exact": True, "inputs_verified": not degraded, "degraded": degraded,
    }


def ratio(num: dict | None, den: dict | None, num_id: str, den_id: str,
          label: str = "ratio") -> dict:
    """compute.ratio — PUE, WUE, CUE. Emits `undefined`, never a number, on a
    missing input or a zero denominator.

    This is the function the whole demo turns on. A ratio with a dead
    denominator has no value; estimating it or holding the last one over is
    exactly the failure the product exists to prevent.
    """
    for r, pid in ((num, num_id), (den, den_id)):
        if r is None:
            return {"port": "undefined", "value": None,
                    "uncomputable_reason": f"{pid} has no reading"}
        if r.get("value") is None or r.get("quality") == "missing":
            return {"port": "undefined", "value": None,
                    "uncomputable_reason": f"{pid} quality=missing"}

    dv = float(den["value"])
    if abs(dv) < 1e-6:
        return {"port": "undefined", "value": None,
                "uncomputable_reason":
                    f"{den_id} reported {dv} — a denominator of zero has no "
                    f"ratio. This is what a dead meter looks like. The value "
                    f"is not estimated and not carried over."}

    nv = float(num["value"])
    degraded = [f"{pid}({r.get('quality')})"
                for r, pid in ((num, num_id), (den, den_id))
                if r.get("quality") != "good"]
    return {
        "port": "value", "value": round(nv / dv, 4), "method": "computed",
        "expression": f"{nv} / {dv}",
        "inputs": [
            {"point": num_id, "value": nv, "ts": num.get("ts"),
             "quality": num.get("quality")},
            {"point": den_id, "value": dv, "ts": den.get("ts"),
             "quality": den.get("quality")},
        ],
        "exact": True, "inputs_verified": not degraded,
        "degraded": degraded, "label": label,
    }


def rate(history: list[tuple[float, float]]) -> dict | None:
    """compute.rate — dP/dt. Synchronised GPU job starts produce MW-scale
    steps in seconds, so the derivative is the interesting quantity."""
    if len(history) < 2:
        return None
    (t0, v0), (t1, v1) = history[0], history[-1]
    dt = t1 - t0
    if dt <= 0:
        return None
    return {"value": round((v1 - v0) / dt, 3), "unit": "kW/s",
            "method": "computed",
            "expression": f"({round(v1,1)} − {round(v0,1)}) / {round(dt,1)}s",
            "exact": True, "window_s": round(dt, 2)}


def capacity(load: dict | None, rating: float | None, redundancy: str | None,
             members_available: int = 1, members_total: int = 1) -> dict:
    """compute.capacity — headroom that means what an engineer means.

    N+1 headroom is measured against (n−1) members. Reporting raw headroom on
    a redundant system tells an operator they have capacity they cannot use
    during a failure.
    """
    if load is None or load.get("value") is None:
        return {"port": "undefined", "value": None,
                "uncomputable_reason": "load unavailable"}
    if not rating:
        return {"port": "undefined", "value": None,
                "uncomputable_reason": "no rating in the point model"}

    usable, note = float(rating), "raw rating"
    if redundancy == "N+1" and members_total > 1:
        usable = rating * (members_total - 1) / members_total
        note = f"N+1: {members_total - 1}/{members_total} of rating"
    elif redundancy == "2N":
        usable, note = rating / 2.0, "2N: half of rating"

    lv = float(load["value"])
    return {
        "port": "value", "value": round(usable - lv, 2), "unit": "kW",
        "method": "computed",
        "expression": f"{round(usable,1)} usable − {round(lv,1)} load ({note})",
        "exact": True,
        "pct_used": round(100.0 * lv / usable, 1) if usable else None,
        "redundancy": redundancy,
        "redundancy_degraded": members_available < members_total,
        "members": f"{members_available}/{members_total}",
    }


def energy_balance(parent: dict | None, branches: list[dict], parent_id: str,
                   tolerance_pct: float = 2.0) -> dict:
    """The independent check: sum of branches vs the parent meter.

    No quality code catches a meter that is alive, fresh and biased by a
    little. Only this does. It is the facility equivalent of a held-out
    partition — a check the system cannot pass by agreeing with itself.
    """
    if parent is None or parent.get("value") is None:
        return {"status": "unknown", "reason": f"{parent_id} unavailable"}
    good = [b for b in branches if b.get("value") is not None]
    if not branches or len(good) != len(branches):
        return {"status": "unknown",
                "reason": f"{len(branches) - len(good)} of {len(branches)} "
                          f"branch meters unavailable"}

    pv = float(parent["value"])
    bs = sum(float(b["value"]) for b in good)
    if abs(pv) < 1e-6:
        return {"status": "breach", "parent": pv, "branch_sum": round(bs, 2),
                "residual_pct": None, "branches": len(good),
                "reason": f"{parent_id} reads 0 while {len(good)} branches sum "
                          f"to {round(bs,1)} kW. Internally inconsistent — the "
                          f"parent is not measuring what it claims."}

    resid = (bs - pv) / pv * 100.0
    status = "ok" if abs(resid) <= tolerance_pct else "breach"
    return {
        "status": status, "parent": round(pv, 2), "branch_sum": round(bs, 2),
        "residual_pct": round(resid, 3), "tolerance_pct": tolerance_pct,
        "branches": len(good),
        "reason": None if status == "ok" else
            f"branch sum {round(bs,1)} kW disagrees with {parent_id} "
            f"{round(pv,1)} kW by {round(resid,2)}% (tolerance {tolerance_pct}%). "
            f"No quality code catches this; only the balance check does.",
    }
