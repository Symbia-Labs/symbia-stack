# EC2 clean-install browser walk — 9 Aug 2026

Console: http://localhost:18000 (SSM tunnel → cowork-symbia-1, i-08a4c8c9b50dc4c23,
us-east-1). Fresh Ubuntu 24.04, Node 22.22.3, Postgres 16 local, stack from a zip
of the working tree (fix/2026-08-06-api-gaps, dirty) taken ~16:41Z. NOT the
Colima stack — that one answers on localhost:8000 and is two days old.

## Known state before the walk (measured, not inferred)

- Listening: 5001–5006, 5008, 5009, 8000, 5432. NOT listening: 5007, 9000.
- integrations: crashes at import — `./base.js` does not provide export
  `OAuthProvider` (type re-exported as value; Node 22.23/tsx).
- service-admin: workspace has only a `start` script; `npm run dev -w` and
  `npm run build -w` both fail on it.
- Console started manually via systemd WITHOUT `PORT`/`HOST` env — because
  `resolveServicePort` falls back to generic `PORT` for every serviceId, and
  with `PORT` set the console proxied all ten services to itself
  (fixed-by-environment 9 Aug ~17:45Z; the code defect stands).
- All other services WERE started by start-local.sh, so each carries its own
  `PORT` env — any peer call that goes through resolveServiceTarget (rather
  than the injected *_SERVICE_URL vars) resolves to the CALLER ITSELF.
- Proxy verified honest post-fix: /svc/identity/api/auth/me → 401 JSON;
  unreachable upstream → 502 upstream_unreachable.

## Predictions (registered before looking)

P1. Login screen renders (auth probe now gets an honest 401).
    dev@example.com / password123 authenticates; lands logged in.
P2. Overview shows 8/10 services healthy — integrations and api down and
    SHOWN as down. If the page says 10/10, the counter is lying and that is
    the finding.
P3. LLM Providers panel: integrations is unreachable, so the panel must say
    "couldn't ask", not "no providers configured". An empty-list rendering of
    a 502 is the confident-zero defect.
P4. Network page shows ≥1 node (control-center registered with the relay at
    17:15Z; services connect to 5009 at boot). Registered as the prediction
    most likely to be wrong: peer-call PORT leakage may have kept services
    from ever reaching the network service.
P5. Catalog does NOT show the 16 builtin component manifests (runtime's boot
    write to catalog is a peer call; if it used resolveServiceTarget it wrote
    to itself). Partial or zero.
P6. MSG / NET indicators: unknown. Sockets traverse tunnel + proxy upgrade
    path (P5 of the trace doc was never exercised). Recording, not predicting.
P7. Chat send fails, and fails VISIBLY (integrations is the LLM gateway).
P8. Logs page shows boot-time entries from logging service. If blank with
    logging healthy, ingest is broken somewhere new.

## Observations (browser walk, Claude-in-Chrome, ~21:05–21:13Z)

Driven in a real browser (Chrome, MCP), not curl. Screenshots + console +
network captured.

P1 — BROKEN, and it exposed a bigger thing. No login screen renders, but NOT
   because auth is off honestly. `AuthGuard.tsx` is a "LOGIN DISABLED BUILD"
   that never blocks and never routes to /login; App.tsx probes
   /svc/identity/api/auth/me, gets a real 401 (confirmed in the network log),
   the probe fails silently, loading clears, and the app renders anyway as a
   placeholder "User". So identity REQUIRES auth, the guard was compiled to
   ignore that, and the two disagree — the exact VITE_DEV_NO_AUTH class the
   6 Aug note claims to have killed, resurrected in AuthGuard instead of the
   env var. The seed users don't exist either: /auth/login →
   401 "Invalid email or password". Postgres `users` was empty (seeding only
   runs under IDENTITY_USE_MEMORY_DB=true; this deploy uses real PG).
   Registered dev@example.com via /auth/register (200) and injected the token
   into localStorage 'symbia-auth' to proceed. After that the header shows
   "Dev / dev@example.com" — a real authenticated session.

P2 — CONFIRMED. Overview reads 8/10, "healthy · 2 down", integrations and api
   both shown red. The counter did not lie. Identity Users 1 / Orgs 1 after
   the registration.

P3 — CONFIRMED (the good one). Integrations page: "Couldn't load integrations
   — connect ECONNREFUSED 127.0.0.1:5007" with a Retry button. Overview LLM
   Providers still says "No providers configured / Integrations service
   answered; the list was empty" — that second string IS wrong (integrations
   did NOT answer, it refused the connection), a confident-zero survival in
   the Overview panel even while the Integrations page gets it right.

P4 — CONFIRMED BROKEN as predicted. Network page: "No nodes connected",
   Graph 0/0, header "Disconnected". The relay the control-center logs said it
   joined does not surface as a node here. Peer-registration to network (5009)
   did not populate topology. (Cause not yet isolated — observation only.)

P5 — BROKEN in the good direction. Catalog shows all 16 builtin component
   manifests (symbia.compute.arithmetic, io.*, logic.*, sink.*, source.timer,
   state.join, …), keys normalized `components/<name>`, Contracts 16. Runtime's
   boot write to catalog worked. The PORT-leak fear did not hit this path.

P6 — RECORDED. Bottom-left MSG red, NET red. Sockets over tunnel+proxy did not
   establish; the indicators honestly show red rather than a fake green.

P7 — CONFIRMED, and worse than predicted. Chat panel opens marked
   "Disconnected". Sending "hello, are you there?" cleared the input and showed
   NOTHING — no echo, no queued bubble, no error toast. Not visible failure;
   silent. Messaging shows healthy on Overview but the chat socket is down and
   the send is dropped without feedback.

P8 — logging genuinely empty: /svc/logging/api/stats → totalLogEntries 0,
   totalLogStreams 0. UI "No logs found" is truthful. Oddity worth a look:
   stats.ingestRate 18 with totalDataPoints 0 — a nonzero rate over zero data.
   Consistent with services logging to local JSONL, not shipping to logging.

### NEW — not predicted, browser-only, the biggest finding

F-A. **NetworkGraph infinite render loop.** Console held 10,000 messages, ALL
   identical: "Maximum update depth exceeded … at NetworkGraph
   (app.js:82150) … NetworkPanel". setState-in-useEffect with an unstable dep.
   It fires continuously whenever the Network panel mounts. No API/curl check
   could see this; only a rendered browser does. Pins the tab's CPU and floods
   the console. This is the single strongest argument in the repo for the
   "UX validation uses a browser, never curl" rule.

### Deploy-shape findings (from getting it running, all observed)

D1. `npm run build` as committed cannot complete: build:services names
    `service-admin`, whose workspace has only a `start` script.
D2. `symbia-control-center` is absent from build:services.
D3. start-local.sh `set -e` aborts the whole boot at the first failing
    workspace (service-admin), so nothing after it starts.
D4. start-local.sh starts the console via `dev` = `build.ts --watch`, which
    builds and exits; nothing serves 8000 while boot logs it "started". The
    2s liveness check passes because the build outlives it.
D5. **resolveServicePort falls back to the generic PORT env for EVERY
    serviceId.** Under any launcher that exports PORT (start-local.sh does),
    the console proxies all ten services to itself: /svc/*/health answered its
    own health, API calls answered 200 index.html via the SPA fallback, and the
    UI rendered logged-in chrome full of confident zeros. This is the platform's
    thesis defect, in the resolver whose own comment says "never a hardcoded
    literal at the call site." Worked around by launching the console with NO
    PORT set; the code defect stands and deserves its own dated doc.
D6. integrations (5007) down independently: `./base.js` does not export
    `OAuthProvider` (type re-exported as value; Node 22.23/tsx).

Environment note: the box is cowork-symbia-1, root-owned AWS (the cowork-agent
lockdown is still pending). Reached only via SSM port-forward on
localhost:18000 — no inbound ports opened.
