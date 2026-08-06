"""
Symbia Energy simulator — electrical loss chain.

Every stage is a real metered point, so any single stage can be killed by the
fault injector and the resulting inconsistency must be catchable downstream.

    racks -> busway -> UPS -> transformer -> utility
                                   +
                     mechanical (chillers, CDUs, CRAH, dry cooler)

Losses are load-dependent, which matters: a fixed-percentage model makes PUE
constant and therefore uninteresting, and it hides the fact that lightly
loaded equipment is disproportionately lossy — one of the few genuinely
actionable findings an energy tool can surface.

Mechanical load in v0 is a first-order function of IT load and outdoor
conditions. The real thermal model with loop lag is step 7; this is
deliberately labelled as the placeholder it is so nobody mistakes it for
physics.
"""
from __future__ import annotations

import math
from dataclasses import dataclass


def _transformer_eff(load_frac: float) -> float:
    """Copper losses scale with load^2, iron losses are constant. Peak
    efficiency lands near half load, which is why the curve is not flat."""
    lf = max(0.02, min(1.3, load_frac))
    iron = 0.0025            # constant, as fraction of rating
    copper = 0.008 * lf * lf
    return max(0.90, 1.0 - (iron / lf + copper))


def _ups_eff(load_frac: float, mode: str) -> float:
    if mode == "eco":
        return 0.985
    if mode == "bypass":
        return 0.995
    lf = max(0.05, min(1.2, load_frac))
    # double conversion: poor at low load, best around 40-70%
    return max(0.86, 0.96 - 0.010 / lf - 0.020 * (lf - 0.55) ** 2)


def _psu_eff(load_frac: float) -> float:
    lf = max(0.05, min(1.2, load_frac))
    return max(0.85, 0.955 - 0.012 / lf - 0.02 * (lf - 0.5) ** 2)


@dataclass
class Electrical:
    it_design_kw: float
    pods: int
    ups_rating_kw: float

    def solve(self, rack_kw: dict[str, float], pod_of: dict[str, int],
              ups_mode: dict[str, str], dry_bulb_f: float) -> dict:
        """One steady-state solve. Returns every metered value as ground truth."""
        it_total = sum(rack_kw.values())

        # ---- busway per pod, plus distribution loss
        busway: dict[int, float] = {p: 0.0 for p in range(1, self.pods + 1)}
        for r, kw in rack_kw.items():
            busway[pod_of[r]] += kw
        busway_loss = 0.004                      # ~0.4% in the busway run
        busway_in = {p: v * (1 + busway_loss) for p, v in busway.items()}
        busway_total = sum(busway_in.values())

        # ---- PSU losses are inside the rack meter already in a real site;
        # modelled here only to make rack draw respond to utilisation.
        psu_lf = (it_total / self.it_design_kw) if self.it_design_kw else 0.0
        _ = _psu_eff(psu_lf)                     # reserved for rack-level detail

        # ---- UPS: 2N, load splits across both
        per_ups_in = busway_total / 2.0
        ups_out, ups_in = {}, {}
        for u in ("a1", "b1"):
            lf = per_ups_in / self.ups_rating_kw if self.ups_rating_kw else 0.0
            eff = _ups_eff(lf, ups_mode.get(u, "double_conversion"))
            ups_out[u] = per_ups_in
            ups_in[u] = per_ups_in / eff

        # ---- mechanical (PLACEHOLDER — real thermal model is step 7)
        # Cooling load tracks IT load; efficiency degrades with outdoor temp.
        # Economiser hours below ~55F cut chiller draw sharply.
        econ = max(0.0, min(1.0, (60.0 - dry_bulb_f) / 25.0))
        base_cop = 5.6 - 0.028 * max(0.0, dry_bulb_f - 60.0)
        chiller_kw_total = (it_total * 0.86) / max(2.5, base_cop) * (1.0 - 0.55 * econ)
        cdu_kw_total = it_total * 0.011
        crah_kw_total = it_total * 0.026
        dry_cooler_kw = it_total * 0.008 + 12.0 * econ
        mech_total = chiller_kw_total + cdu_kw_total + crah_kw_total + dry_cooler_kw

        # ---- transformers: 2N, each carries half of (UPS in + mech)
        elec_load = sum(ups_in.values()) + mech_total
        per_t_out = elec_load / 2.0
        t_rating = self.it_design_kw * 1.1
        t_in = {}
        for t in (1, 2):
            eff = _transformer_eff(per_t_out / t_rating if t_rating else 0.0)
            t_in[t] = per_t_out / eff

        utility_kw = sum(t_in.values())

        return {
            "it_total_kw": it_total,
            "rack_kw": rack_kw,
            "busway_kw": busway_in,
            "ups_in_kw": ups_in,
            "ups_out_kw": ups_out,
            "transformer_in_kw": t_in,
            "transformer_out_kw": {1: per_t_out, 2: per_t_out},
            "utility_kw": utility_kw,
            "mech": {
                "chillers": chiller_kw_total,
                "cdus": cdu_kw_total,
                "crah": crah_kw_total,
                "dry_cooler": dry_cooler_kw,
                "total": mech_total,
            },
            "econ_fraction": econ,
            # ground truth PUE — the simulator knows it; the platform must
            # earn it from meters, and must refuse when it cannot.
            "true_pue": (utility_kw / it_total) if it_total > 0 else None,
        }


def weather(t_s: float, seed_day_f: float = 74.0) -> tuple[float, float]:
    """Diurnal dry/wet bulb. Simple on purpose — weather is a driver here,
    not a subject."""
    hour = (t_s / 3600.0) % 24.0
    dry = seed_day_f + 11.0 * math.sin((hour - 9.0) / 24.0 * 2 * math.pi)
    wet = dry - 12.0 - 3.0 * math.sin((hour - 15.0) / 24.0 * 2 * math.pi)
    return round(dry, 2), round(wet, 2)
