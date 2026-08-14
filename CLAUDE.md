# symbia-stacK

LOAD TOOLS: DESKTOP COMMANDER, SYMBIA MCP SERVER, CLAUDE IN CHROME

1. VERIFY STACK IS RUNNING LOCALLY. CHECK ENDPOINT STATUS
2. VERIFY SYMBIA MCP SERVER IS AVAILABLE
3. VERIFY YOU HAVE CONTROL CENTER ACCESS VIA CLAUDE IN CHROME
4. VERIFY REST API AVAILABILITY

**Read `/STATUS.md` first.** It says what is built, what is wired, and what
is only written down. `docs/` holds dated findings; `docs/proposals/` holds
things that do not exist.

Platform for provable provenance. The governing rule: **if a piece can't be
built through the Symbia API alone, that's a platform defect to log — never a
reason to reach outside** (unregistered services, hand-edited routes,
hardcoded ingress all destroy the point).

## Build & check
- `npm run build` (libs then services), `npm run check`, `npm run check:ports`
  (fails on literal `5054`), `npm run dev` → `./start-local.sh`
- One origin, one build mode: control center is a service on 8000, esbuild
  only. Vite is deleted — any dev/prod URL branch or `import.meta.env` is a
  regression. `getServiceUrl(id)` returns `/svc/${id}`, always.
- Address services by id, never port. Route tables derive from `@symbia/sys`.
  Registered ≠ running: `server` (5000) is registered with nothing behind it;
  `RunningServices` is the only place that difference lives.

## Verification discipline
- Never trust a running process to be the code you wrote — grep a unique
  marker in the running bundle first. Kill by **port**, not `pkill -f`.
- "Not working" and "not running" look identical — `lsof` the port before
  concluding anything about the code.
- UX validation uses a browser, never curl. Blank beats green: never infer a
  pass from absence of evidence. Separate observation ("returned 404") from
  inference ("endpoint missing").
- MAP (measure against prediction): register predictions in git before
  measuring; report broken ones as broken.

## Writing — chat replies and docs both
- Observation, then inference, in that order, in separate sentences. Then stop.
  A third sentence restating the finding more memorably is the tic to cut.
- Banned constructions: closing aphorisms; `not X, it's Y`; `X doesn't A, it
  B's`; em-dash asides carrying the punchline; a metaphor where a number exists;
  rhetorical repetition for cadence.
- Prefer the plain word. Cut any sentence that would survive unchanged if the
  measurement behind it changed.
- **This repo's own voice is a trap.** `STATUS.md` and `claims.ts` carry
  aphorisms that were earned by a specific finding. Matching that register by
  default amplifies it into decoration.
- Why it matters here and not everywhere: flourish is unfalsifiable, so it reads
  as generated rather than verified, and it devalues the real measurements
  printed next to it.
- Say what was not established as plainly as what was. No summary paragraph that
  is more confident than the section above it.

## Constraints
- Dev/local persistence is JSONL + local logs only (DB connectors later,
  behind an interface).
- Catalog holds reusable items only — never real-time point instances.
- Catalog keys are normalized type-prefixed paths: `<type-plural>/<name...>`
  (plural always, nesting where earned, domain in tags never keys); the
  write gate validates key-prefix ⇄ type-column agreement. Settled 9 Aug
  (`docs/2026-08-09-catalog-roadmap.md` §7.3) — do not relitigate.
- Component manifests are public contracts: no domain vocabulary.
- App vs installation: no org ids or metric namespaces baked into artifacts
  (`docs/APP-MODEL.md` — design agreed, not fully implemented).
- `energy/` is a test case, not the product; its defect ledger is the output.
- `.mcp.json` contains a real bearer token — never paste into docs/issues.
- Conventional Commits; describe what changed in the world.
- No human-time estimates. UI type ≥16px base.

## State pointers
- Working branch: `fix/2026-08-06-api-gaps`. `work/2026-08-05-energy-and-
  honesty-repairs` is stranded (25 commits, unmerged).
- Findings live in dated `docs/2026-08-*.md` files, not here.
- `DEVELOPER.md` §8 predates the rebuild (Vite/5173) — stale.
- MCP server `dist/` may still probe network on 5054; `src/` has 5009.