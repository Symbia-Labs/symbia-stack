"""
Symbia Energy — timeseries sinks.

DESIGN STANDARD (Brian, 5 Aug 2026): dev/local is JSONL and other local logs
only. Connectors for GreptimeDB, InfluxDB, Elastic etc. come later, behind
this interface — not by rewriting the ingest path.

This also happens to be the right default for the thesis. A JSONL sink is
append-only, greppable, and diffable: you can prove what the service was told
and when, with `tail` and nothing else. A remote TSDB is a better store and a
worse witness, and during the phase where the product's claim is "every number
can show its provenance", being auditable with a text editor is worth more
than being fast.

Rotation is by UTC day. Files are never rewritten, only appended — the same
rule the CEB runs under.

Adding a connector later means implementing write(batch) and appearing in
build_sink(). Nothing upstream changes.
"""
from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path


class Sink:
    def write(self, readings: list[dict]) -> None:
        raise NotImplementedError

    def stats(self) -> dict:
        return {}

    def close(self) -> None:
        pass


class JsonlSink(Sink):
    """Append-only JSONL, one file per UTC day.

    Each line is a full reading envelope, INCLUDING quality and age. Storing
    only value+timestamp would throw away the exact fields that make a
    reading auditable, and reconstructing quality later means recomputing it
    against a point model that may have changed — which is how a record stops
    being a record.
    """

    def __init__(self, directory: str | Path, prefix: str = "readings"):
        self.dir = Path(directory)
        self.dir.mkdir(parents=True, exist_ok=True)
        self.prefix = prefix
        self._lock = threading.Lock()
        self._day: str | None = None
        self._fh = None
        self._lines = 0
        self._bytes = 0

    def _ensure(self):
        day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if day != self._day:
            if self._fh:
                self._fh.close()
            self._day = day
            path = self.dir / f"{self.prefix}-{day}.jsonl"
            self._fh = path.open("a", buffering=1)
        return self._fh

    def write(self, readings: list[dict]) -> None:
        if not readings:
            return
        with self._lock:
            fh = self._ensure()
            for r in readings:
                line = json.dumps(r, default=str, separators=(",", ":"))
                fh.write(line + "\n")
                self._lines += 1
                self._bytes += len(line) + 1

    def stats(self) -> dict:
        return {"kind": "jsonl", "dir": str(self.dir), "day": self._day,
                "lines_written": self._lines,
                "mb_written": round(self._bytes / 1_048_576, 3)}

    def close(self) -> None:
        with self._lock:
            if self._fh:
                self._fh.close()
                self._fh = None


class NullSink(Sink):
    """For tests and for the regression runner, where persistence is noise."""

    def write(self, readings: list[dict]) -> None:
        pass

    def stats(self) -> dict:
        return {"kind": "null"}


def build_sink(kind: str, directory: str | Path) -> Sink:
    if kind == "jsonl":
        return JsonlSink(directory)
    if kind == "null":
        return NullSink()
    # Deliberately explicit rather than silently falling back to jsonl: a
    # typo'd sink name should fail loudly, not quietly write somewhere else.
    raise ValueError(
        f"unknown sink '{kind}'. dev/local supports: jsonl, null. "
        f"greptime/influx/elastic connectors are not implemented yet.")
