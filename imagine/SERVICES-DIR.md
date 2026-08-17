# Mounting from the sidecar's own directory

Predictions registered before measuring. **Registered in git, not through the
sidecar** — the connector is running a `dist` that predates the spec-fetch fix,
so `symbia_call` is unavailable to this session. Recorded as a detour per the
standing rule: the chain proves ordering and a commit does not, so this record
is weaker than the four before it and says so.

## The problem

`sidecar.mjs` mounts `../../<svc>/.standalone-routes.mjs`. That path resolves
inside a symbia-stack checkout and nowhere else, which is why the extracted
repository reads but does not run.

## The obstacle, already measured once

`01-bundle-routes.sh` emits each bundle into its own service directory on
purpose. Third-party packages stay external to the bundle — `node-llama-cpp` is
native and cannot be bundled at all — and Node resolves them from the importing
file upward, finding `<svc>/node_modules` only because the bundle sits there.
Measured 15 Aug: emitting elsewhere failed with `Cannot find package
'drizzle-orm'`.

Moving the bundles without moving what they resolve against reproduces that.

## Predictions

| | |
|---|---|
| M1 | with bundles copied to `./services/` and nothing else changed, at least one service fails to mount for want of an external package |
| M2 | **every** service fails, not a subset — the externals are shared infrastructure rather than per-service exotica *[expected wrong: I think models and network fail and the thin ones survive]* |
| M3 | a resolver preferring `./services/` and falling back to the old path changes nothing observable while `./services/` is absent |
| M4 | the union of external packages across the ten bundles is under 40 |
| M5 | the fix is a `package.json` beside `./services/` declaring that union, with no change to any bundle |

M2 is the one worth being wrong about. If the failure is uniform, the sidecar
needs one dependency set and packaging is a solved problem. If it is a subset,
each surviving service is a separate question and the estimate is wrong.
