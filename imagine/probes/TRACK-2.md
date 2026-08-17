# Track 2 — the spec is the capability surface

Run 16 Aug. Predictions at the top of `06-spec-reach.mjs`, committed before
the run.

| | prediction | verdict | measurement |
|---|---|---|---|
| R1 | all ten mounted services return > 0 operations | HELD | 389 operations across ten (was 365 across eight) |
| R2 | models returns > 0 | HELD | 12 operations (was 0) |
| R3 | integrations declares the download endpoint | HELD | `POST /api/integrations/download` |
| R4 | models is callable, not merely listed | HELD | `GET /api/models` → `operationId: listModelsApi` |
| R5 | directory is callable, not merely listed | HELD | `GET /api/stats` → `operationId: get_api_stats` |

The dispatcher resolves every call against a service's own
`/docs/openapi.json`. Three different things made a working handler
unreachable, and all three presented identically to a caller: "No such
operation."

**models — the spec route lived in `index.ts`.** Catalog registers
`/docs/openapi.json` inside `routes.ts`, models registered it inside the
`createSymbiaServer` config. So the spec existed on the deployed stack and
nowhere else, and every models endpoint was invisible to MCP. Moved into
`registerRoutes`. Same defect class as `wireComponents` in Track 1: the
thing lives in the one entrypoint that nothing else runs.

**integrations — the route was real and undeclared.** `POST
/api/integrations/download` has existed since the models rework and is the
path model weights travel. It was not in `openapi.ts`, so the dispatcher
could not reach it. An undeclared route is an unreachable one for any caller
that resolves against the document.

**directory — no spec at all, and two address spaces.** The service shipped
no OpenAPI document, which reported as zero operations: from a caller's side
that is indistinguishable from a service that does nothing. It has twelve
handlers — peers, foreign nodes, admission, and the forwarding-permission
query the bridge asks before it relays. Writing the spec surfaced a second
problem: directory exported `createRouter()` and left the prefix to the
caller, so the deployed stack mounted it at `/api` and the imagine sidecar
mounted it at the root. One service, two address spaces, and no spec could
be right about both. It exports `registerRoutes` now and the sidecar's
adapter is deleted.

## What this says about the measure

Counting reachable operations is a usable completeness measure for the
platform, and it disagrees with the source. Ten services were mounted and
running the whole time; eight could be asked what they do. The gap was not
capability. It was three ways of failing to declare capability, none of
which produced an error anywhere.
