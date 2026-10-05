#!/bin/bash
# Rebuild the stack and restart the host. The client stays open.
#
# What this covers: service code (catalog, runtime, logging, …) and the
# host's own code (sidecar.mjs, session-ledger.mjs). That is most of the
# work.
#
# What it does NOT cover: symbia-mcp-server and shim.mjs. Both are imported
# by the process Claude Desktop spawned, so changing a tool's schema, the
# dispatcher, or the shim still needs a client restart. See SHIM-SPLIT.md.
set -euo pipefail
cd "$(dirname "$0")"

echo "1/3  bundling services (esbuild, from TypeScript source)"
bash 01-bundle-routes.sh 2>&1 | grep -iE "error|✘" && { echo "bundle failed"; exit 1; } || true

echo "2/3  stopping the host"
# By port, not by pattern: pkill -f matches this script's own command line.
lsof -ti :"${IMAGINE_HOST_PORT:-7717}" | xargs -r kill 2>/dev/null || true
sleep 1

echo "3/3  starting the host"
nohup node host.mjs > .session/host.log 2>&1 &
for i in $(seq 1 60); do
  sleep 1
  # Wait for ready, not for a 200. The socket opens before the services
  # mount, so polling for "answers at all" reads a half-built stack.
  if curl -sf "http://127.0.0.1:${IMAGINE_HOST_PORT:-7717}/" 2>/dev/null | grep -q '"ready":true'; then
    curl -s "http://127.0.0.1:${IMAGINE_HOST_PORT:-7717}/" \
      | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"     up: {len(d.get('services',[]))} services, mode {d.get('mode')}, session {d.get('session',{}).get('actor')}\")"
    echo "     the client did not move; its next call reaches this host"
    exit 0
  fi
done
echo "     host did not answer in 60s — see .session/host.log"
exit 1
