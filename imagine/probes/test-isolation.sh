#!/bin/bash
# Isolation refactor measurement. Predictions: 2026-08-17-isolation-predictions.md,
# committed at b26c708 BEFORE this ran. This file contains no expected values.
set -uo pipefail
cd "$(dirname "$0")/.."
HERE=$PWD
T=$(mktemp -d)
echo "# workdir $T"

start_shim() { # $1: tag. Starts a shim with held-open stdin; echoes shim pid.
  local fifo="$T/stdin-$1"; mkfifo "$fifo"
  ( exec 3>"$fifo"; while kill -0 $$ 2>/dev/null; do sleep 1; done ) &  # holder keeps fifo open
  echo $! > "$T/holder-$1.pid"
  node "$HERE/shim.mjs" < "$fifo" > /dev/null 2> "$T/shim-$1.err" &
  echo $! > "$T/shim-$1.pid"
}

addr_of() { # $1: tag — the private address file path from the shim's stderr
  grep -o "IMAGINE_ADDRESS_FILE.*" "$T/shim-$1.err" 2>/dev/null | head -1
  # fallback: parse "attached to http://..." line
  grep -oE "attached to (http://[0-9.:]+)" "$T/shim-$1.err" | awk "{print \$3}" | head -1
}

host_pid_of() { grep -oE "pid [0-9]+" "$T/shim-$1.err" | head -1 | awk "{print \$2}"; }

echo "== I1: two shims, two hosts =="
start_shim a; start_shim b
for i in $(seq 1 90); do
  grep -q "attached to" "$T/shim-a.err" 2>/dev/null && grep -q "attached to" "$T/shim-b.err" 2>/dev/null && break
  sleep 1
done
A_BASE=$(addr_of a); B_BASE=$(addr_of b)
A_HOST=$(host_pid_of a); B_HOST=$(host_pid_of b)
A_SESS=$(grep -oE "session [a-z0-9:]+" "$T/shim-a.err" | head -1)
B_SESS=$(grep -oE "session [a-z0-9:]+" "$T/shim-b.err" | head -1)
echo "A: $A_BASE host=$A_HOST $A_SESS"
echo "B: $B_BASE host=$B_HOST $B_SESS"
if [ -n "$A_BASE" ] && [ -n "$B_BASE" ] && [ "$A_BASE" != "$B_BASE" ] && [ "$A_SESS" != "$B_SESS" ]; then
  echo "I1 HELD: distinct ports and sessions"
else
  echo "I1 BROKEN"
fi

echo "== I2: SIGTERM shim-a -> host-a exits, ledger closes =="
kill -TERM $(cat "$T/shim-a.pid") 2>/dev/null
DEAD=""
for i in $(seq 1 10); do
  kill -0 "$A_HOST" 2>/dev/null || { DEAD="yes"; echo "host $A_HOST gone after ${i}s"; break; }
  sleep 1
done
[ -n "$DEAD" ] && echo "I2 host-exit HELD" || echo "I2 BROKEN: host $A_HOST still alive after 10s"
LA=$(ls -t "$HERE/.session"/ledger.*.jsonl 2>/dev/null | head -2)
echo "recent ledgers:"; for f in $LA; do
  echo "  $(basename $f): $(wc -c < $f) bytes; last event: $(tail -1 $f | python3 -c 'import sys,json; e=json.loads(sys.stdin.read()); print(e["event_type"], json.dumps(e["payload"])[:120])' 2>/dev/null)"
done

echo "== I3: SIGKILL shim-b -> host-b STILL exits via pipe =="
kill -9 $(cat "$T/shim-b.pid") 2>/dev/null
DEAD=""
for i in $(seq 1 10); do
  kill -0 "$B_HOST" 2>/dev/null || { DEAD="yes"; echo "host $B_HOST gone after ${i}s"; break; }
  sleep 1
done
if [ -n "$DEAD" ]; then echo "I3 HELD: SIGKILL'd shim took its host with it (pipe, not cleanup code)"
else echo "I3 BROKEN: host $B_HOST survived its shim's SIGKILL"; kill -9 "$B_HOST" 2>/dev/null; fi
LB=$(ls -t "$HERE/.session"/ledger.*.jsonl 2>/dev/null | head -1)
echo "  newest ledger last event: $(tail -1 $LB | python3 -c 'import sys,json; e=json.loads(sys.stdin.read()); print(e["event_type"], json.dumps(e["payload"])[:120])' 2>/dev/null)"

echo "== I5: boot time (from shim spawn to attached) =="
for t in a b; do
  S=$(stat -f %B "$T/shim-$t.pid" 2>/dev/null)
  echo "  shim-$t: see timestamps in stderr; grepping boot line"
  grep -E "spawning an owned host|attached to" "$T/shim-$t.err" | head -2
done

# cleanup holders
kill $(cat "$T"/holder-*.pid) 2>/dev/null
echo "# done. stderr logs in $T"
