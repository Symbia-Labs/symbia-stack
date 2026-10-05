# What an in-process component handler can actually do

**Status:** design note, 2026-08-17. Written because three privileged components were added in one day and validated only inside an ephemeral sketch, and nobody noticed until it was said out loud.

---

## The thing that is easy to forget

A component handler is a TypeScript function compiled into the runtime service. It is not sandboxed, not capability-scoped, and not reviewed by anything at load time beyond a manifest that describes its *ports*, not its *reach*. It runs with whatever authority the runtime process has.

That is a defensible design — an in-process primitive should be fast and unencumbered — but it means the manifest's honesty about lanes creates a false impression of honesty about everything else. `symbia.state.rollup` declares `lane: conditional` and cannot lie about it, because `normaliseEmission` enforces the declaration. Nothing comparable governs what a handler *touches*.

## What today's three components hold

| component | authority exercised | declared anywhere? |
|---|---|---|
| `symbia.transform.extract-text` | none — pure function over its input | n/a |
| `symbia.io.http-request` | outbound network, subject only to the egress guard's private-address refusal | no |
| `symbia.canon.certify` | **writes to the catalog with `X-Service-Auth: internal`**, bypassing user authorisation entirely; creates resources and uploads artifacts | no |
| `symbia.canon.check-claims` | reads arbitrary catalog resources and downloads their artifacts, same internal header | no |

`certify` is the sharpest case. It mints catalog resources as the platform rather than as a user, because that is the only way a graph node can write while a client's token lives somewhere else. Nothing about the graph JSON that invokes it says so. A person reading a graph sees `symbia.canon.certify` and learns nothing about the fact that loading that graph grants a write path around authorisation.

## The rule this note exists to state

**A new primitive is a change to the persistent stack, whatever packaging motivated it.**

Components live in `runtime/server/src/executor/`. Both packagings compile the same registry: the imagine plugin and `docker compose` ship identical component code. An idea that seemed useful in a sketch host arrives in production with the same authority, and the only gate between the two is that someone ran a build.

Three consequences, in the order they bite:

1. **Validate outside imagine.** `runtime/` now has `npm test` — `node:test` through `tsx`, no host, no plugin, no containers. A handler is `(input, ctx) => ports`; it is testable directly, and until 17 Aug nothing tested one. Booting a sketch host to check a primitive confuses "it ran" with "it is right".
2. **Prefer fixing an existing component to adding one.** The distinctiveness defect in `check-claims` was nearly repaired by writing a *new* gate component. That would have expanded the trusted set in order to fix a bug inside the trusted set. The fix belonged where the corpus already was.
3. **Ask what the handler reaches, not just what it emits.** The manifest review question is not only "does it declare its lane honestly" but "what does it touch, and would a reader of the graph know".

## What would actually fix this

Capability declarations in the component manifest — `network`, `catalog:write`, `internal-auth` — enforced by the runtime the way `lanes` are enforced by `normaliseEmission`. A component that declares no network capability cannot fetch; one that declares no `internal-auth` gets a user-scoped client instead of the platform header. The manifest becomes a request for authority as well as a claim about provenance, and in both cases the runtime is what grants it.

That is real architecture work and it is not scheduled. Until it exists, the control is social: **new primitives get read by someone who asks what they touch, and get tested somewhere that is not a sketch.**

## The smaller thing worth keeping

The reason this note exists at all is that the same property that makes the platform honest about values — declare it, and the runtime enforces it — is entirely absent one layer down, where the code that produces those values decides for itself what it may reach. A system can be scrupulous about the provenance of its outputs while being silent about the privileges of its parts. Both halves have to be declared before either claim is complete.
