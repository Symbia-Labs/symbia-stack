# symbia-stack

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
- Register predictions in git before measuring; report broken ones as broken.

## Constraints
- Dev/local persistence is JSONL + local logs only (DB connectors later,
  behind an interface).
- Catalog holds reusable items only — never real-time point instances.
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