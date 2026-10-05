# imagine use-case spike — results

15 Aug 2026. Every step issued through **symbia-mcp** (`symbia_call` on the
dispatcher) into the headless imagine sidecar. No direct database writes,
no seed-file edits, no shell into a service. Predictions registered first.

Subject: the *verifiable brief* — the seed use case chosen over dark fleet
because it needs no sensors, no imagery and no second node.

## Outcomes

| check | verdict |
|---|---|
| PU1 component manifest authorable | **HELD** (second attempt — see below) |
| PU2 runtime executes an API-authored component | **BROKEN, as predicted** |
| PU3a graph of existing components authorable | HELD |
| PU3b runtime sees the graph | measured: `loadedGraphs: 0` |
| PU4 assistant authorable | HELD |
| PU4b assistant loads into the service | empty — loader never picked it up |
| PU5 lanes visible on a component | HELD |

## What an agent can do today, through the API alone

Author **artifacts**: component manifests, graph definitions, assistants —
all created, accepted by the write gate, and readable back. Lanes are
visible on components, with their notes, so an agent can see which outputs
are canonical before wiring anything.

## Where the line actually falls

**An agent can author a component but cannot make one run.** Component
implementations are registered in code (`registerComponent()` in
`runtime/server/src/executor/components.ts`); the executor knows 14 and a
graph referencing anything else is refused at load with "components with
no registered implementation". So the catalog manifest is a *contract*
and the implementation is *code*, and only the contract half is reachable
from outside. The manifest even declares `implementation: "expression"`
as a legal value — a declarative component type — but nothing consumes
it. **Inventing a primitive is not possible through the API today.**

That is the honest ceiling: an agent in imagine mode can compose what
exists and can describe what it wishes existed, but cannot bring the
latter into being.

**Two more instances of composition-root leakage**, both the same shape as
everything else found tonight:

- The runtime reports `loadedGraphs: 0` after a graph is created, because
  `CatalogSync.start()` is called from `runtime/server/src/index.ts`. The
  sidecar mounts the routes, so the graph exists in the catalog and the
  runtime never hears about it.
- The assistants service lists nothing after an assistant is created,
  because the loader also runs from `index.ts`.

Both are `createService()` stage S2/S3 work, not new problems.

## The finding I did not predict

**The component manifest contract is not discoverable through the API.**
My first attempt invented the executor's shape and was rejected —
correctly — with a Zod error naming a missing field. But the OpenAPI for
`POST /api/resources` types `metadata` as a bare object, so nothing an
agent can read tells it that a `component` resource needs
`{key, version, implementation, inputs[], outputs[], config{}}`. I only
succeeded by reading `catalog/shared/schema.ts` — which is exactly the
move the governing rule forbids.

For an agent-facing platform this is the sharpest gap of the three: the
write gate knows the shape, the API refuses without it, and the shape is
unpublished. Fix candidates: publish the per-type metadata schemas in the
OpenAPI, or add a `GET /api/resources/schema/{type}` the dispatcher can
surface.

## What this means for the seed

The seed cannot ship the seven new components as manifests alone — they
would list and refuse to run, which is worse than absent. Either:

1. implement them in the executor (code, ships with the platform), or
2. make `implementation: "expression"` real, so declarative components
   become authorable — which would let an agent invent primitives and is
   a far more interesting platform.

Option 2 is the one that makes imagine mode worth having.
