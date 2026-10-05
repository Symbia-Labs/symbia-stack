# imagine use-case spike — predictions

Registered 15 Aug 2026 before running. The question is the governing rule
itself: **can an agent build a working use case in imagine mode through
the Symbia API alone?** Anything that cannot is a platform defect, logged.

Subject: the *verifiable brief* — sources in, a report out in which every
claim names its source and lane, contradictions surface, and what the
sources do not establish gets said. Chosen over dark fleet because it
needs no sensors, no imagery and no second node.

Method: every step issued through the MCP dispatcher (`symbia_call`)
against the headless imagine sidecar. No direct database writes, no
editing seed files, no shell into a service.

- **PU1 (component manifests are authorable):** a new component resource
  (`components/verify.computed`) can be created through
  `POST /api/resources` with a valid manifest, and the write gate accepts
  it.
- **PU2 (the runtime will not execute it) — EXPECTED BROKEN.** Component
  *implementations* live in `runtime/server/src/executor/components.ts`
  and are registered in code by `registerComponent()`. A manifest in the
  catalog with no handler in the executor should be listed but not
  runnable. Predicting the boundary lands exactly there: **catalog
  manifests are contracts; execution is code.** If so, "an agent can
  invent a new primitive" is FALSE today, and that is the finding.
- **PU3 (composition of EXISTING components is authorable and runnable):**
  a graph wiring `source.timer → compute.arithmetic → io.log` can be
  created through the API and executed by the runtime, producing a run
  record. This is the honest ceiling of what an agent can build now.
- **PU4 (an assistant is authorable):** an assistant resource with a rule
  set can be created through the API and appears in
  `GET /api/assistants` after load.
- **PU5 (lanes are visible in the output):** a run over
  `compute.arithmetic` reports its output on the canonical lane, and a
  refusal on apocryphal — the manifest says so; the run should show it.

Expected shape of the result: PU1, PU3, PU4 hold; PU2 breaks as
predicted; PU5 is the one I am least sure of, because §12 of STATUS
records lanes as legible but not actionable.
