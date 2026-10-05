/**
 * D8 — takedown, and saying how much of a trace you hold.
 *
 * Registered before the run:
 *   K1  a sidecar killed with SIGTERM writes an `imagine.session.closed`
 *       event before it exits
 *   K2  that event declares a total equal to its own position
 *   K3  every event carries a seq, and the seqs are 1..n with no gaps
 *   K4  a bundle sealed mid-session reports state "unterminated" and does
 *       NOT claim to be complete — sealing before the end is legitimate
 *   K5  a trace with events removed from the MIDDLE reports the gap
 *   K6  a trace with events removed from the TAIL is reported as partial,
 *       naming held and declared — the case a chain alone cannot catch
 *   K7  services exporting stop() are stopped before the ledger closes
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { completenessOf } from "../standalone/session-ledger.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const sessionDir = join(here, "..", "standalone", ".session");
const R = [];
const rec = (id, ok, note) => { R.push({ id, ok, note }); console.log(`${id} ${ok ? "HELD  " : "BROKEN"} ${note}`); };

const before = new Set(existsSync(sessionDir) ? readdirSync(sessionDir) : []);

const child = spawn("/opt/homebrew/bin/node", [join(here, "..", "standalone", "sidecar.mjs")], {
  stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, NODE_ENV: "" },
});
let err = "";
child.stderr.on("data", (c) => { err += c.toString(); });
child.stdout.on("data", () => {});

// Let it boot fully: services start, seed runs, runtime hydrates.
await new Promise((r) => setTimeout(r, 22000));

child.kill("SIGTERM");
await new Promise((r) => setTimeout(r, 3000));

// Which ledger is this session's? The one that appeared while it ran.
const fresh = readdirSync(sessionDir).filter((f) => f.startsWith("ledger.") && f.endsWith(".jsonl") && !before.has(f));
if (!fresh.length) {
  console.error("no new ledger file — cannot measure");
  process.exit(1);
}
const ledgerPath = join(sessionDir, fresh[0]);
const events = readFileSync(ledgerPath, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));

const closing = events.find((e) => e.event_type === "imagine.session.closed");
rec("K1", !!closing, closing ? `closed on "${closing.payload.reason}" after ${events.length} events` : "no closing event written");

rec("K2", closing?.payload?.total === closing?.payload?.seq,
  closing ? `declared total ${closing.payload.total}, own seq ${closing.payload.seq}` : "n/a");

const seqs = events.map((e) => e.payload?.seq);
const contiguous = seqs.every((n, i) => n === i + 1);
rec("K3", contiguous, `seqs ${seqs[0]}..${seqs[seqs.length - 1]} across ${events.length} events, contiguous: ${contiguous}`);

// K4 — mid-session seal
const midSeal = events.slice(0, Math.floor(events.length / 2));
const cMid = completenessOf(midSeal).completeness;
rec("K4", cMid.state === "unterminated" && cMid.complete === false,
  `${cMid.state}: ${cMid.note.slice(0, 96)}`);

// K5 — a hole in the middle
const holed = [...events.slice(0, 5), ...events.slice(8)];
const cHole = completenessOf(holed).completeness;
rec("K5", cHole.gaps.length > 0,
  cHole.gaps.length ? `gap reported between seq ${cHole.gaps[0].after} and ${cHole.gaps[0].before}` : "no gap reported");

// K6 — the tail cut off, closing event kept (the case a chain cannot catch)
const cut = [...events.slice(0, events.length - 4), events[events.length - 1]];
const cCut = completenessOf(cut).completeness;
rec("K6", cCut.state === "partial" && cCut.held < cCut.declared,
  `${cCut.held} of ${cCut.declared} — ${cCut.state}`);

const stopped = /stopped runtime/.test(err);
const orderOk = err.indexOf("stopped runtime") < err.indexOf("ledger closed");
rec("K7", stopped && orderOk,
  stopped ? `stop ran before the ledger closed: ${orderOk}` : "no service reported stopping");

console.log(`\ntakedown log:\n  ` + (err.match(/\[sidecar\] (takedown|stopped|stop FAILED|ledger closed)[^\n]*/g) || []).join("\n  "));
console.log(`\n${R.filter((r) => r.ok).length}/${R.length} held`);
