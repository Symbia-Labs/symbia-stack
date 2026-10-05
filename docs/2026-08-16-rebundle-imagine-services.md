# Rebundling the Imagine service bundles from fixed source

**Date:** 2026-08-16
**Task:** review §8 "Now", first item — rebundle the sidecar services so the next
Imagine host runs the four fixes from §5.
**Method:** four predictions registered through `symbia_call` before any
measurement (`post_contexts` 20:36:03, context
`9f9a307b-fbca-42b9-acf5-5c2d22e92af4`); results registered after
(`e3c4449d-a927-4f15-985a-34d9183abdb3`, 20:38:35). Two of the four broke.

## Predictions and outcomes

**P1 — marker distribution. BROKEN.** Predicted exactly one of the ten tracked
bundles would contain `/api/integrations/status`. Measured three:
`assistants.mjs` 1, `integrations.mjs` 2, `logging.mjs` 1.

The marker was not diagnostic. `integrations` defines the route. `logging` has
its own `logging/server/src/integrations-client.ts` whose
`getIntegrationsStatus()` already fetched that path, with an `X-Service-Id:
logging` header, before today. The assistants defect in §5.1 was therefore a
divergence between two clients in the same repository — one of them had the
correct path all along. The fix-unique marker is `isIntegrationsAvailable`,
which appears only in `assistants.mjs`.

**P2 — scope of change. HELD, more strongly than predicted.** Predicted the nine
non-assistants bundles would differ from the tracked copies only by esbuild
nondeterminism. Measured byte-identical under `cmp` for all nine.

**P3 — build precondition. HELD.** All ten bundled exit 0 with esbuild 0.25.12
and no prior `npm run build:libs`, as `--packages=external` never resolves
`@symbia/*` dist at bundle time.

**P4 — assistants delta. BROKEN. This is the finding.**

Predicted the rebundled `assistants` would be byte-identical to the tracked
`assistants.mjs`, since §5 records that file as already mirrored from fixed
source. Measured 323,076 bytes generated against 323,321 tracked, 121 diff
lines.

The tracked bundle was hand-edited, not generated. Two independent signals:

- It contains the phrase `Mirrors source fix` three times.
  `grep -rn 'Mirrors source fix' assistants/server/src/` returns nothing. The
  phrase exists only in the build output.
- Em-dash escaping does not match what the bundler produces. Tracked: 34 lines
  with a literal `—`, 34 with `—`. Generated: 32 literal, 35 escaped. The
  specific case is the string `no handler for this action type — nothing
  executed`, which the generated bundle emits with `—` and the tracked
  bundle carries with a literal character.

The four fixes were functionally correct in the tracked bundle. They were typed
into the artifact rather than bundled from the fixed source, so the file that
shipped was not the file the source produces.

## What was done

`imagine/01-bundle-routes.sh`'s loop was run for all ten services
and the output copied into `plugin/symbia-imagine/services/`. Nine copies are
byte-identical to what was already tracked; `assistants.mjs` is the only change.

All ten pass `node --check`. All four assistants-side fix markers are present in
the generated output — `isIntegrationsAvailable` ×2,
`/api/integrations/status` ×1, `models: ServiceId2.MODELS` ×1, `no handler for
this action type` ×1 — and `Mirrors source fix` is now absent.

Fix §5.4 is in `symbia-mcp-server/src/index.ts` and is not part of any service
bundle. It is unaffected by this pass.

## Not established

Whether the running host at `127.0.0.1:7717` picked up the new bundles. It was
started before this rebundle; the review already notes the fixes take effect on
reload. Nothing here was measured against a reloaded host.

Whether any other tracked bundle was hand-edited at some earlier point. The nine
that came back byte-identical are proof only that they match source *today* —
a hand-edit that was later overwritten by a regeneration would leave no trace.

## Platform gaps this exposed

**Nothing enforces that the tracked bundles are the output of the bundler.** No
`package.json` script or `.github/` workflow references
`plugin/symbia-imagine/`. The mirroring step is manual, which is what let a
hand-edit reach the artifact. A `build:plugin` script that regenerates and a
check that fails when the tracked bundles differ from a fresh build would close
it. Deferred deliberately — the plugin is still changing shape.

**The bundler could not be run from the session sandbox against the repo's own
toolchain.** `node_modules/esbuild` is the `darwin-arm64` build; the sandbox is
`linux-arm64`. esbuild 0.25.12 was installed into `/tmp` and invoked from there
with identical flags, leaving the repo's `node_modules` untouched. Recorded per
the standing instruction: the detour was necessary, and the gap is that a
mounted checkout carries a platform-specific toolchain.
