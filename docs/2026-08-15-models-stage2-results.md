# Stage 2 runtime results — measured against a running service

15 Aug 2026, evening. Models service on `PORT=5098`,
`MODELS_PATH=experiments/model-derivation/data`, dev Mac. Predictions in
`docs/2026-08-15-models-stage2-predictions.md`, committed before any run
(`9ab07f0`). One deviation from the registered setup is disclosed inline.

## Prediction outcomes: 4 held, with one setup deviation

**PB1 — HELD.** Four models scanned, each with a digest matching
`data/shasums.txt`: parent `8e0ae260…`, both Q4 files `eeac84f2…` (two
names, one digest — content addressing visible in the listing), Q2
`ab283692…`.

**PB2 — HELD.** `GET /api/models/child-q4km-run1` returned the full
`sha256:eeac84f2…d532e4`, byte-equal to the shasum.

**PB3 — HELD, but the premise was wrong and the honest version is below.**
The prediction assumed no catalog. A catalog WAS reachable — `localhost:5003`
is an ssh tunnel to a running stack — so the measurement became "cards exist
and agree": load succeeded, `digest_mismatch` absent. Silent-agree and
silent-null are indistinguishable from outside, which is why the forced
mismatch below was added.

**PB4 — HELD.** A byte-appended copy of the Q2 file was the only file
re-hashed on reboot (`Hashed` lines: 1) and got a different digest
(`2a04c83a…` vs `ab283692…`); the original's digest came from the
mtime+size cache unchanged.

## Beyond the registered predictions: forced mismatch, measured

The card for `child-q4km-run1` was PATCHed to claim
`sha256:deadbeef…00ff`, then the model was loaded via a chat completion.
Observed: the load succeeded, the log warned
`DIGEST MISMATCH … loading anyway, disclosed on the registry entry`, and
`GET /api/models/child-q4km-run1` returned
`digest_mismatch: { card: "sha256:deadbeef…", file: "sha256:eeac84f2…" }`.
The disclose-now policy works end to end. The card was restored by a
subsequent sync and verified restored.

## Found by measuring: the catalog cannot be asked by key

The first attempt to read a card back 404ed while the full listing showed
the card present. Cause, confirmed in `catalog/server/src/routes.ts`:

- `GET/PATCH/DELETE /api/resources/:id` resolve by **row id only**;
  `storage.getResourceByKey` existed with **no route exposing it**.
- The list route's only filters were `type` and `status` — a `prefix`
  param is silently ignored (an early read of this session mistook the full
  list for a filtered one).
- `model-sync` GETed keys against the `:id` route, saw 404 every time, and
  concluded "absent": its **update branch had never run**, and its PUT
  target does not exist as a route at all. Every re-sync re-POSTed into the
  key's UNIQUE constraint. February's TESTING-REPORT "Model sync: Pass" was
  true exactly once per model.

Fixed same day: the list route gained an exact `key` filter (wiring the
orphaned storage method through existing access filtering), and model-sync
now finds-by-key then PATCHes by row id — written to also work against
catalogs deployed before the filter existed. Measured: a second boot logged
4 updates, 0 failures, where the old code would have hit the constraint.
**The catalog route change is code-landed, runtime-unverified** — the
catalog behind the tunnel runs the old build; model-sync's client-side
re-filter is what was actually exercised.

## Housekeeping

Probe rows (`probe/nonexistent-check`, the corrupt-copy card) deleted with
verification; corrupt file removed; cards restored; no service left running
on 5098. During measurement the port was once double-booted (EADDRINUSE) —
the second "boot" in the transcript at `stage2c` never ran; results above
are from the `stage2b`/`stage2d` boots, which did.
