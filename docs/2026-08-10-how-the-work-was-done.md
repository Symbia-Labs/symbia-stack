# How the work was done

*10 August 2026. A narration of method rather than outcome, written for
reconstruction. The findings of this session live in their own dated documents;
this one records how they were arrived at, what the working loop actually looked
like from the inside, and where it failed.*

*Written immediately after restoring the stack, from the transcript of that
restoration rather than from recollection of it.*

---

## 1. Why this document exists

The assistant that did this work has no memory between sessions. Everything it
knows at the start of a session it read at the start of that session — from
`CLAUDE.md`, from the dated documents in `docs/`, from commit messages, and from
the code. When the session ends, nothing carries forward except what was written
down.

That is not a limitation to apologise for; it is the same problem this platform
exists to solve, wearing different clothes. GKS Continuity asks how structure
survives across episodes without granting the model false memory. The answer
this repository has arrived at in practice is: **the record is the continuity.**
A commit message describing what changed in the world, a dated document with
predictions registered before measurement, a comment explaining why a line
exists — these are not documentation. They are the mechanism by which the next
session reconstitutes enough context to be useful.

So this document narrates the loop, because a future session reading only
outcomes would learn what was decided and not how to decide the next thing.

## 2. The working loop

Roughly, and repeatedly:

1. **Read before writing.** Grep the codebase for the thing that is about to be
   assumed. Today this caught: that `@symbia/crypto` was a concern already
   specified in a prehistoric seed document; that the runtime has no HTTP
   component at all; that `portLanes` already existed in the catalog schema; and
   that libraries here declare sibling libraries in `devDependencies` and
   `peerDependencies`, not `dependencies`.
2. **Measure before claiming.** Any number in a document was produced by running
   something. The 2.6% ledger overhead, the 2.5 GB/s hash rate, the 85 outbound
   call sites, the 159 typecheck errors — all measured in the session they were
   written, with the command visible in the transcript.
3. **Register predictions before measuring**, when the measurement is a test of
   a design. Each set named the one expected to fail. Two of them did fail; two
   did not, and that was reported as loudly. The ways this practice can poison
   the thing it is meant to protect are serious enough to have their own
   section — §2.1.
4. **Separate observation from inference, explicitly.** "Corner pixels read
   `rgb(5,4,9)`" is an observation. "The veil is being captured" is an
   inference. The documents mark which is which, because inferences rot when the
   code changes underneath them and observations do not.
5. **Attack the output.** The two real defects found today were found by trying
   to forge things, never by a test passing. This is the highest-yield habit in
   the loop and the one most easily skipped.
6. **Write it down in the same motion.** The commit message is drafted while the
   reasoning is still live. A commit written an hour later records what changed;
   one written immediately records why.

## 2.1 How registering predictions contaminates the exercise

Writing a prediction down changes the person who then goes looking. That is the
point — it makes a wrong belief expensive — but it introduces failure modes of
its own, and this session produced examples of most of them.

**The six ways it goes wrong:**

1. **Anchoring the search.** Having written where I expected a failure, I look
   there. Today I predicted the chat path would break in *integrations*. It
   broke in the calculator's input handling instead. Had I searched only where
   I predicted, I would have found nothing and recorded a pass.
2. **Hedged predictions that cannot fail.** "Something in the assistant path
   fails on first use" and "at least one panel shows a confident zero" are not
   predictions, they are weather. Both were written today. Both technically
   resolved, and neither told anyone anything.
3. **Near-misses recorded as hits.** I predicted twelve service tiles and saw
   eleven. The temptation to call that essentially right is exactly the
   corrosion this practice exists to resist.
4. **Safe selection.** Predicting only what is already known, so the record
   accumulates a high hit rate that means nothing. A run of successful
   predictions is evidence of timidity at least as often as skill.
5. **Prediction as target.** Once written, a prediction can quietly become
   something to satisfy — by fixing toward it, or by choosing the measurement
   that makes it true.
6. **The measurer is the predictor is the builder.** I wrote the code, wrote the
   prediction, ran the test and judged the result. There is no independent party
   anywhere in that loop.

**What actually holds it together:**

- **Commit before measuring.** Timestamped in git so retroactive editing is
  detectable. This defends against exactly one of the six — the last-resort one
  — and it is the one most often mistaken for the whole practice.
- **Results in a separate document.** The prediction file is never reopened.
- **Specificity is the real test.** Compare today's predictions: *"ffprobe
  reports a duration"* named a tool, a field and an expected value, and broke
  informatively. *"openssl agrees with the Node verifier"* named an independent
  implementation, and passing meant something. *"Something fails somewhere"*
  named nothing and meant nothing. **If a prediction does not say what
  observation would disconfirm it, it is not a prediction and should not be
  written down as one.**
- **A near-miss is a miss.** Eleven is not twelve. Recorded that way.
- **Reach outside the loop for at least one check.** The single most valuable
  result today came from `openssl` — an implementation with no stake in being
  agreeable. Every internal check can only confirm the author agrees with
  himself.
- **Watch the hit rate as a signal, not a score.** If predictions are nearly
  always right, they are too safe. Being wrong twice today about things stated
  precisely is worth more than being right ten times about things stated
  vaguely.
- **Predict against your own work, not someone else's.** The Electron prediction
  — *"nothing here breaks, and if it does my model of what is coupled to what is
  wrong"* — staked something falsifiable on my own understanding. That is the
  shape worth copying.

**What is still missing.** Nothing in this session separates the predictor from
the measurer. The honest mitigation available today is precision — a prediction
specific enough that its failure is not negotiable — and reaching for at least
one instrument that was not built here. Neither substitutes for an adversary,
and the project's own rule that adversarial roles keep isolated context exists
because of this gap.

## 3. What the loop caught, and what it missed

**Caught by grep, before it became a mistake:** the seed crypto spec, the
missing HTTP component, the lane vocabulary, the dependency convention.

**Caught by attacking:** a signature that verified correctly over the wrong
bytes, leaving `attestation.level` rewritable — found by editing the field and
re-verifying. A verifier that correctly refuted a forged claim and then printed
that claim as its own headline — found by reading its output rather than its
exit code.

**Missed, three times, in the same way.** Each of these was a probe that
encoded the assumptions of the thing it was probing:

- a tamper check that always corrupted segment 4, reporting failure on any clip
  with fewer than four segments;
- a reformatting test using `JSON.stringify(ev, Object.keys(ev))`, not
  registering that a replacer *array* filters at every depth — it silently
  truncated the payload, and the signature correctly refused it;
- a persistence test using `docker-compose restart`, which reuses the container
  filesystem and therefore proves nothing about a redeploy. `--force-recreate`
  showed the identity changing every time.

The pattern is one rule with three faces: **an instrument that shares the
assumptions of what it measures will agree with it.** The countermeasure that
worked was reaching for something outside the loop — `openssl` verifying a
signature the Node code produced, given nothing but a public key.

## 4. The restoration, narrated

This is the part worth recording in detail, because it is the loop under
pressure rather than in theory, and because the mistakes were mine.

**Starting state.** I had rebuilt `symbia-base` with new libraries and rebuilt
only the `directory` service. Nine services were still running images from the
previous day.

**Step 1 — ask the platform, not the shell.** `symbia_stack_health` via the MCP
server reported 6/11. Five services unreachable.

**Step 2 — refuse the obvious inference.** "Unreachable" and "not running"
produce identical evidence. `docker ps -a` showed `catalog`, `logging`,
`messaging` and `assistants` in `Exited (1)`, while `identity` was `Up
(healthy)` — yet the health tool called identity unreachable too. Two different
conditions wearing one label.

**Step 3 — find the actual cause.** Container logs showed
`error: terminating connection due to administrator command`. Postgres had been
restarted, and those four services crash on an unhandled `error` event rather
than reconnecting — then stay down, having no restart policy. **A finding about
the platform, logged in §6.** Postgres restarted because my earlier compose edit
changed `identity`'s configuration, and `up -d directory` recreated its
dependency chain.

**Step 4 — check for the trap I could not see.** `lsof` showed `ssh` holding
ports 5006 and 8000. Earlier in this session there had been SSH tunnels to an
EC2 instance. If those were still live, every "healthy" reading might have been
measuring a different machine. They were not — the process was Colima's own
port-forward mux. Cheap check, catastrophic if skipped.

**Step 5 — the guard fires, and finds more than it was aimed at.** With
everything rebuilt, `assistants` refused to start:

> `NETWORK_HASH_SECRET is required in production — refusing to seal provenance
> envelopes with the development literal`

That guard was added an hour earlier as a one-line change needing no design. On
its first boot it revealed something larger than the weakness it was written
for: `docker-compose.yml` sets `NETWORK_HASH_SECRET` on the **network** service
only. `assistants` had no such variable and fell back to
`'symbia-network-dev-only'`, while `network` used `'symbia-network-dev-secret'`.
**Two different secrets.** The docstring in `provenance.ts` promises that an
envelope sealed there "is checkable by the same means as an event crossing the
mesh" — and in this deployment that promise had been false, silently, because
nobody had ever checked one against the other. Fixed by giving `assistants` the
same variable, with the history in a comment.

**Step 6 — the mistake that took longest.** After a plain `docker-compose up -d`
the health tool reported **1/11**, worse than before the fix, while Docker
reported every container healthy. `docker ps` showed containers exposing
`8000/tcp` rather than `0.0.0.0:8000->8000/tcp`. `git log -S'8000:8000'` showed
that string had *never* existed in `docker-compose.yml`.

The answer was in `start.sh`, line 22:

```sh
export COMPOSE_FILE="docker-compose.yml:docker-compose.dev.yml"
```

The dev overlay publishes host ports, and is **deliberately not named**
`docker-compose.override.yml` so that a plain `up -d` behaves like production. I
had run the plain form, dropping the overlay, then measured through a tool that
probes host ports. The stack was correct; my composition was not. The repository
had anticipated this exact error in a comment, and I made it anyway by not
reading the launcher before using its subject.

**Step 7 — verify the running code is the written code.** With
`COMPOSE_FILE` set, 11/11 healthy — the first time all eleven have reported
green through the MCP server. Then, because green is not evidence: grep a unique
marker from today's source (`role_claimed`) inside every *running* bundle. All
nine returned 1. Each service logged its own persisted identity.

## 5. Where the human directed, and why that mattered

The corrections that changed direction, rather than polish:

- **"we've discussed this serialization many times before — completely refresh
  yourself"** — stopping an improvised hash-chain design and sending me to read
  GKS Lineage, which the work then followed.
- **"spyglass is one observer, but a file upload in chat, or a http url/page
  grab is also another"** — the reframe that turned a capture gadget into a
  platform primitive and produced both libraries.
- **"is this what symbia/crypto was for?"** — preventing a parallel invention of
  a concern already specified in the seed work.
- **"if the http observer is the ONLY pathway to www then we have a signed copy
  of the raw that the model processed"** — the sole-ingress proposition.
- **"if it is we slow the store"** — dissolving a falsifier I had written, by
  observing that back-pressure is a budget rather than a wall.
- **"these are exactly the two lanes we have orbited around"** — connecting a
  cost-based split to the existing `canonical` / `apocryphal` port lanes, which
  is a better distinction than the one I had reached.

The division that worked: the human holds what the project *is* and what has
already been settled; the assistant can move quickly and check hard, but
repeatedly needs pointing at which rabbit hole is the real one. At least six
times today, the correction was worth more than the work it interrupted.

## 6. Findings this session produced about the platform

Recorded here because they came out of the process rather than from a task:

1. **No service survives a Postgres restart.** Four crashed on an unhandled
   `error` event and stayed down. Unhandled, unretried, no restart policy.
2. **`assistants` and `network` sealed with different secrets**, contradicting
   the documented promise that their envelopes are mutually checkable.
3. **`npm run check` fails with 159 TypeScript errors**, against 49 recorded on
   6 August. None originate in code added today.
4. **The MCP health tool measures host reachability, not service health.** It
   reports "unreachable" for a service that is running correctly but not
   published, which collapses two conditions the platform's own discipline
   requires be kept apart.

## 7. For the next session

Read `CLAUDE.md`, then the dated documents in `docs/` newest first, then
`git log` for the working branch. That is the whole reconstitution procedure.
The single highest-value habit to carry forward is the one in §3: **when a check
passes, ask whether it could have failed.** Three times today it could not have,
and each time the passing check was hiding something.

Bring the stack up with `./start.sh`, or with `COMPOSE_FILE` set as it does.
A plain `docker-compose up -d` is a supported thing to run and it will not serve
the console to a browser.
