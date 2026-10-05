#!/bin/bash
# Tail a running imagine host: what the HOST says, what the LEDGER records,
# and what the OS sees on the wire.
#
# The point is evidence an agent cannot author. An agent narrates tool
# results into a transcript; it does not write host.log (the host process
# does, with a sync fd), it does not sign ledger events (the host holds the
# only key), and it certainly does not open TCP sockets that lsof can see.
# If a run is real, all three move together. If a run is narrated, this
# window stays silent while the transcript fills.
#
# Usage:  bash imagine/watch.sh
set -uo pipefail

say() { printf '\033[2m%s\033[0m\n' "$*"; }

# ── find the live host ────────────────────────────────────────────────────
# An owned host publishes its address into a private temp dir; a shared dev
# host uses the default .session/host.json. Newest wins, then it must answer.
ADDR=""
for f in $(ls -t "${TMPDIR:-/tmp}"/imagine-*/host.json /tmp/imagine-*/host.json 2>/dev/null) \
         "$(dirname "$0")/.session/host.json"; do
  [ -f "$f" ] || continue
  b=$(python3 -c "import json;print(json.load(open('$f'))['base'])" 2>/dev/null) || continue
  curl -s -m 2 -o /dev/null "$b/" 2>/dev/null && { ADDR="$f"; break; }
done

if [ -z "$ADDR" ]; then
  say "No imagine host is answering."
  say "Start a conversation with the plugin loaded, then run this again."
  say "(Owned hosts appear only once a shim spawns one — the plugin being"
  say " installed is not the same as a host running.)"
  exit 1
fi

BASE=$(python3 -c "import json;print(json.load(open('$ADDR'))['base'])")
PID=$(python3 -c "import json;print(json.load(open('$ADDR'))['pid'])")
SESSION=$(python3 -c "import json;print(json.load(open('$ADDR'))['session'])")
SHORT=${SESSION##*:}

# The host keeps host.log open, so the OS knows where its session directory
# is. Asking lsof beats guessing at paths that move between packagings.
SESSION_DIR=$(lsof -p "$PID" 2>/dev/null | awk '/host\.log$/ {print $NF}' | head -1 | xargs -I{} dirname {} 2>/dev/null)
[ -n "${SESSION_DIR:-}" ] || SESSION_DIR="$(dirname "$ADDR")"
LEDGER="$SESSION_DIR/ledger.$SHORT.jsonl"
HOSTLOG="$SESSION_DIR/host.log"

echo
say "host    $BASE  (pid $PID)"
say "session $SESSION"
say "dir     $SESSION_DIR"
say "ledger  $([ -f "$LEDGER" ] && wc -l < "$LEDGER" | tr -d ' ' || echo 0) events"
echo
say "── watching. LEDGER lines are signed by the host; HOST lines are written"
say "   by the host process itself; NET lines are the kernel's view. Ctrl-C to stop."
echo

trap 'kill $(jobs -p) 2>/dev/null; exit 0' INT TERM

# ── 1. the host's own log ─────────────────────────────────────────────────
if [ -f "$HOSTLOG" ]; then
  tail -n 0 -F "$HOSTLOG" 2>/dev/null | while IFS= read -r l; do
    printf '\033[36mHOST  \033[0m %s\n' "${l:0:200}"
  done &
fi

# ── 2. the signed ledger, decoded ─────────────────────────────────────────
if [ -f "$LEDGER" ]; then
  tail -n 0 -F "$LEDGER" 2>/dev/null | while IFS= read -r l; do
    printf '%s' "$l" | python3 -c '
import sys, json
try:
    e = json.loads(sys.stdin.read())
except Exception:
    sys.exit()
p = e.get("payload", {})
seq = p.get("seq", "?")
kind = e.get("event_type", "?")
sig = (e.get("signature") or "")[:14]
if kind == "imagine.mutation":
    detail = f'"'"'{p.get("method","")} {str(p.get("path",""))[:64]} -> {p.get("status","")}'"'"'
    dig = str(p.get("requestDigest", ""))[7:19]
    print(f"\033[33mLEDGER\033[0m #{seq:<5} {detail}  req:{dig}  sig:{sig}…")
else:
    extra = json.dumps({k: v for k, v in p.items() if k != "seq"})[:96]
    print(f"\033[35mLEDGER\033[0m #{seq:<5} {kind}  {extra}  sig:{sig}…")
'
  done &
fi

# ── 3. the kernel's view of the wire ──────────────────────────────────────
# Outbound TCP the host process actually opened. An agent describing a fetch
# it did not perform leaves nothing here.
(
  prev=""
  while kill -0 "$PID" 2>/dev/null; do
    now=$(lsof -p "$PID" -i -n -P 2>/dev/null | awk '/ESTABLISHED|SYN_SENT/ && !/127\.0\.0\.1/ {print $9, $10}' | sort -u)
    if [ -n "$now" ] && [ "$now" != "$prev" ]; then
      while IFS= read -r c; do
        [ -n "$c" ] && printf '\033[32mNET   \033[0m %s\n' "$c"
      done <<< "$now"
      prev="$now"
    fi
    sleep 1
  done
  printf '\033[31mHOST  \033[0m process %s exited — an owned host dies with its conversation\n' "$PID"
) &

wait
