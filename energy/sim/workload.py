"""
Symbia Energy simulator — workload driver.

A job SCHEDULE, not noise. This is the AI-data-center-specific part and the
reason compute.rate exists downstream: synchronised GPU training jobs ramp and
collapse in seconds, so the interesting quantity is dP/dt, not P.

A random walk would produce a demo where every metric looks plausible and
nothing interesting ever happens. Jobs produce the three shapes that actually
stress a facility:

  * RAMP     — thousands of GPUs going to full draw inside a ramp window
  * CHECKPOINT — brief synchronised collapse while state is written
  * CLIFF    — job end, load falls off in one step

Power per rack is expressed as a FRACTION of rack design, so the same schedule
works against any topology from build_site.py.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass, field


@dataclass
class Job:
    name: str
    start_s: float
    duration_s: float
    racks: list[str]
    peak_frac: float = 0.95          # fraction of rack design kW at full draw
    ramp_s: float = 45.0             # sync ramp — seconds, not minutes
    checkpoint_every_s: float | None = None
    checkpoint_len_s: float = 20.0
    checkpoint_frac: float = 0.35    # draw during checkpoint
    kind: str = "training"           # training | inference | batch

    def load_frac(self, t: float) -> float:
        """Fraction of design draw for this job's racks at absolute time t."""
        if t < self.start_s or t >= self.start_s + self.duration_s:
            return 0.0
        el = t - self.start_s

        # ramp in
        if el < self.ramp_s:
            # smoothstep, not linear: real ramps are S-shaped as schedulers fill
            x = el / self.ramp_s
            frac = self.peak_frac * (x * x * (3 - 2 * x))
        else:
            frac = self.peak_frac

        # inference is bursty rather than flat
        if self.kind == "inference":
            frac *= 0.72 + 0.28 * abs(math.sin(el / 37.0))

        # checkpoint collapse — synchronised, which is what makes it a step
        if self.checkpoint_every_s:
            phase = el % self.checkpoint_every_s
            if phase < self.checkpoint_len_s:
                frac = min(frac, self.checkpoint_frac)

        # cliff: last 5s of the job, load falls off
        rem = self.duration_s - el
        if rem < 5.0:
            frac *= max(0.0, rem / 5.0)

        return frac


@dataclass
class Workload:
    """Holds the schedule and computes per-rack draw at time t."""
    racks: list[str]
    rack_design_kw: float
    jobs: list[Job] = field(default_factory=list)
    baseload_frac: float = 0.12      # idle/host/storage draw when no job runs
    seed: int = 1337

    def __post_init__(self) -> None:
        self._rng = random.Random(self.seed)
        # per-rack multiplier: real halls are never uniform
        self._spread = {r: self._rng.uniform(0.88, 1.10) for r in self.racks}

    def rack_kw(self, t: float) -> dict[str, float]:
        """kW per rack at time t. Baseload floor plus whatever jobs claim it."""
        out = {r: self.baseload_frac for r in self.racks}
        for j in self.jobs:
            f = j.load_frac(t)
            if f <= 0:
                continue
            for r in j.racks:
                if r in out:
                    out[r] = max(out[r], f)
        # small per-rack jitter so meters don't look synthetic-clean
        return {
            r: max(0.0, f * self._spread[r] * self._rng.uniform(0.995, 1.005)
                   * self.rack_design_kw)
            for r, f in out.items()
        }


def default_schedule(racks: list[str], day_s: float = 86400.0) -> list[Job]:
    """A day that contains every shape the detector needs to catch.

    Deliberately includes a SYNCHRONISED start (two large jobs beginning within
    a few seconds) because that is the multi-MW step that stresses transformers
    and is the single most AI-specific event in the whole model.
    """
    n = len(racks)
    q = max(1, n // 4)
    return [
        # steady inference across a quarter of the hall, all day
        Job("inference-fleet", 0, day_s, racks[:q], peak_frac=0.55,
            ramp_s=120, kind="inference"),

        # overnight training run with checkpoints — the checkpoint dips are the
        # thing that looks like a fault and is not one
        Job("train-llm-a", 3600 * 1, 3600 * 9, racks[q:2 * q], peak_frac=0.97,
            ramp_s=60, checkpoint_every_s=1800, checkpoint_len_s=25,
            kind="training"),

        # THE synchronised step: two jobs start 4s apart on half the hall
        Job("train-llm-b", 3600 * 10, 3600 * 6, racks[2 * q:3 * q],
            peak_frac=0.98, ramp_s=40, checkpoint_every_s=2400,
            kind="training"),
        Job("train-llm-c", 3600 * 10 + 4, 3600 * 6, racks[3 * q:],
            peak_frac=0.98, ramp_s=40, checkpoint_every_s=2400,
            kind="training"),

        # short batch job that ends mid-afternoon — the cliff
        Job("batch-etl", 3600 * 13, 3600 * 2, racks[:q], peak_frac=0.80,
            ramp_s=30, kind="batch"),
    ]
