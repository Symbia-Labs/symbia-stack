"""
Symbia Energy simulator — fault injection.

THE CENTRAL DESIGN DECISION IN THE WHOLE SIMULATOR
--------------------------------------------------
Faults are applied at the PUBLISH boundary, not to the physical state.

The simulator always knows ground truth. A fault corrupts what gets REPORTED.
That separation is what makes the scenarios into a regression suite instead of
a slideshow: for every tick we can hold "what was true" next to "what the
platform was told", and assert that the platform noticed the difference.

If faults mutated the physics instead, a dead meter would be indistinguishable
from a rack that genuinely powered off — which is precisely the confusion the
product exists to eliminate.

Fault kinds
-----------
  death     meter reports 0. The headline: PUE must go UNCOMPUTABLE, not
            "excellent". A conventional trend draws this as an improvement.
  silence   meter publishes nothing at all. Downstream must age it to stale
            then missing. Distinct from death: death is a lying meter,
            silence is an absent one, and they need different handling.
  freeze    meter repeats its last value forever. The most dangerous of the
            three because the number stays plausible.
  drift     slow multiplicative bias. Only the energy-balance check finds it.
  partition a whole branch goes silent at once (network segment lost).
  stuck_status  a status point holds 'running' after the equipment tripped.
"""
from __future__ import annotations

import fnmatch
from dataclasses import dataclass, field


@dataclass
class Fault:
    kind: str
    points: str                  # glob against point id
    start_s: float
    end_s: float | None = None
    # drift only
    rate_per_hour: float = 0.0   # e.g. 0.02 = +2% per hour, compounding
    # stuck_status only
    hold_value: str | None = None

    def active(self, t: float) -> bool:
        if t < self.start_s:
            return False
        return self.end_s is None or t < self.end_s

    def matches(self, point_id: str) -> bool:
        return fnmatch.fnmatch(point_id, self.points)


@dataclass
class FaultInjector:
    faults: list[Fault] = field(default_factory=list)
    _frozen: dict[str, float] = field(default_factory=dict, init=False)
    _drift_started: dict[str, float] = field(default_factory=dict, init=False)

    def add(self, f: Fault) -> None:
        self.faults.append(f)

    def apply(self, point_id: str, value, t: float):
        """Return (publish?, value). publish=False means emit nothing at all.

        Order matters: silence/partition win over death, because an absent
        meter cannot also report a wrong number.
        """
        for f in self.faults:
            if not f.active(t) or not f.matches(point_id):
                continue

            if f.kind in ("silence", "partition"):
                return False, None

            if f.kind == "death":
                # The lie that looks like good news.
                return True, 0.0

            if f.kind == "freeze":
                held = self._frozen.get(point_id)
                if held is None:
                    self._frozen[point_id] = value
                    held = value
                return True, held

            if f.kind == "drift":
                t0 = self._drift_started.setdefault(point_id, t)
                hours = (t - t0) / 3600.0
                if isinstance(value, (int, float)):
                    return True, value * ((1.0 + f.rate_per_hour) ** hours)
                return True, value

            if f.kind == "stuck_status":
                return True, (f.hold_value if f.hold_value is not None else value)

        # no fault: clear any freeze memory so a repeat fault re-latches
        self._frozen.pop(point_id, None)
        return True, value

    def active_descriptions(self, t: float) -> list[str]:
        return [f"{f.kind} on {f.points}" for f in self.faults if f.active(t)]


def from_scenario(doc: dict) -> FaultInjector:
    """Build an injector from a scenario YAML/JSON document."""
    inj = FaultInjector()
    for f in doc.get("faults", []) or []:
        inj.add(Fault(
            kind=f["kind"],
            points=f["points"],
            start_s=float(f["start_s"]),
            end_s=(float(f["end_s"]) if f.get("end_s") is not None else None),
            rate_per_hour=float(f.get("rate_per_hour", 0.0)),
            hold_value=f.get("hold_value"),
        ))
    return inj
