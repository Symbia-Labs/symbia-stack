# PAC-MAN as a provenance graph

### What building a game out of sixteen audit components taught me about the component model

*Built, run, sealed and verified on 2026-08-17 in a Symbia Imagine session. 141 signed events, chain intact, every signature valid. Predictions registered before the first move.*

---

## Why a game

Brian asked for the wildest thing I could build with the graph model. I proposed an argument-checker. He said: *build Pac-Man.*

He was right and I was being timid. An argument-checker is a provenance system wearing a different hat — it would have proved nothing about the model's expressiveness, because it plays to exactly what the components were designed for. A maze game is adversarial to the design. It needs mutable position, collision, level geometry, and a win condition, and not one of those is what an aggregation primitive is for.

So: no new components, no code in the runtime, nothing but a graph document. Sixteen components built to stop a partial federal spending total passing as the total, arranged into a playable maze.

It works. The board clears. And the two hacks that make it work turn out to be the most honest description of the component model I've found.

---

## Hack one: the maze is the port list

`symbia.logic.switch` emits on the port named by a field's value — and if no such port is declared, on `default`. It exists so a graph can fork on a message type.

Read it as geometry instead:

```json
{ "id": "maze", "component": "symbia.logic.switch",
  "config": { "field": "pos",
              "ports": ["8","9","10","11","12","15","17","19","22",
                        "23","24","25","26","29","31","33","36","37","38","39","40"] } }
```

Twenty-one ports, one per open tile, each wired to the board. **A wall is simply a port that does not exist.** Walk into one and there is nowhere to go, so the message takes `default` — and `default` is wired to a collector called `blocked`.

Collision detection is not implemented. It is a consequence of the topology. The level is not data the graph consults; **the level is the graph.** Twenty-one of the thirty-eight edges in this document are the maze, and you could read the layout off the wiring diagram.

Position is a single integer (`y*W + x`), so movement is four arithmetic nodes rather than eight:

```json
{ "id": "mv_left",  "component": "symbia.compute.arithmetic", "config": { "expression": "{pos} - 1" } }
{ "id": "mv_up",    "component": "symbia.compute.arithmetic", "config": { "expression": "{pos} - 7" } }
```

Every move therefore carries a recipe receipt naming the tile it came from and the arithmetic that produced the next one. The game is fully auditable, which nobody asked for and which came free.

---

## Hack two: the win condition is a rollup

`symbia.state.rollup` is the component this whole platform is built around. You declare an expected set; it aggregates what has arrived, reports `coverage`, names what is `missing`, and — the part that matters — **emits on the apocryphal lane while anything is absent**, because a partial total must not pass as the total.

Declare the dots as the expected set:

```json
{ "id": "board", "component": "symbia.state.rollup",
  "config": { "expected": ["9","10","11","12","15","17", ...],
              "op": "sum", "keyField": "key", "valueField": "value" } }
```

Now the same refusal that stops a bureau publishing an incomplete spending figure stops you claiming you have cleared the board:

```
right  -> 9    coverage 0.050   eaten 1/20    lane apocryphal
...
down   -> 31   coverage 1.000   eaten 20/20   lane canonical
```

```
FINAL BOARD
  lane      canonical
  coverage  1.000   (20 of 20 dots)
  missing   []
  BOARD CLEARED — the rollup went canonical. That is the win.
```

**"You haven't won yet" and `lane: apocryphal` are the same statement.** Not analogous — identical. The component cannot tell the difference between "this total is missing three reporting units" and "this board is missing three dots," because there isn't one. Both are *a claim of completeness that the declared membership does not support*, and the platform's central mechanic answers both with the same refusal and the same `missing` array naming exactly what's absent.

Every intermediate state is a real, checkable claim: at `coverage 0.950`, the board is not sulking about being incomplete — it is correctly reporting an incomplete aggregate over a declared set, and naming the one tile left.

---

## The third hack, which is uglier and more instructive

`rollup` needs a numeric value per key. Arithmetic emits `{result, method, expression, exact}` — and there is no component that injects a constant.

But `exact` is `true` on every successful arithmetic, and `Number(true) === 1`:

```json
{ "id": "shape", "component": "symbia.transform.map",
  "config": { "mapping": { "pos": "result", "key": "result", "value": "exact" } } }
```

`value: "exact"` is how you write the literal `1` in a language with no literals. It is a genuine hack, it is load-bearing, and it points at a real gap: the component set has no constant. Every value must be computed or arrive from outside. That is a defensible constraint for a provenance system — a constant is an assertion with no derivation — but it means expressing "one" requires borrowing the truthiness of a receipt field.

---

## What broke, exactly as predicted

Five predictions were registered before the first move. Four held. The fifth was written to break:

> **P5 — EXPECTED TO BREAK.** Revisiting an already-eaten dot leaves coverage unchanged and is indistinguishable, in the output, from eating a fresh one. `rollup` stores latest-per-key, so a second visit overwrites with the same value and reports the same coverage. A game needs to know you scored nothing; the component was built to answer a different question and will not tell you.

It broke. Watch the trace:

```
left   -> 24   coverage 0.950   eaten 19/20   lane apocryphal   (revisit — watch coverage)
```

Coverage correctly did not advance. But **nothing in the graph's output says "you gained nothing."** The `(revisit)` annotation in that line is a lie of presentation — it comes from a JavaScript `Set` in my renderer, outside the graph entirely. The board emitted the same shape it emits for a fresh dot.

This is not a bug. It is the component being exactly right for its purpose and wrong for mine:

- **For provenance:** idempotency is essential. A supplier who submits their certificate twice must not double-count. Coverage measures *which members have reported*, and reporting twice is still one member.
- **For a game:** you need the delta. "Did I score?" is the question, and latest-per-key structurally cannot answer it.

The general lesson, which is the one worth carrying out of this exercise: **a component encodes a question, not a capability.** `rollup` answers *"is this set complete?"* — and every use that needs that question is elegant, while every use that needs *"what changed?"* has to reach outside. When someone says a primitive doesn't fit their problem, the useful diagnosis is usually that they are asking it a different question, not that it lacks a feature.

---

## What this says about the component model

**It is more expressive than its vocabulary suggests.** Nothing here is named `maze`, `wall`, `score`, or `win`. Those concepts are all present, all working, and all emergent from routing, arithmetic and a declared expected set. The components are general because they were specified as *questions about data* rather than as *operations on a domain* — and the payment-integrity vocabulary in their descriptions is documentation, not architecture.

**Topology can carry meaning that no node holds.** No component knows the maze. The level exists only in the wiring, and the graph document is simultaneously the program and the level file. That generalises: a graph's shape can encode a domain constraint that no individual step is aware of, and the runtime enforces it by construction rather than by checking.

**The lane system is a genuinely universal statement about completeness.** I expected the apocryphal lane to feel forced in a game. It is the most natural thing in the build. A system that refuses to call a partial aggregate complete is doing the same work whether the members are federal programs, supplier certificates, lab results, or dots in a maze — and the refusal reads correctly in every one of them.

**And the honest caveat:** the game loop lives outside. Loopback egress is blocked, so a graph cannot feed itself; each move is an injection from a player. This is Pac-Man as a **move validator and scorekeeper**, not as an autonomous simulation. `symbia.source.timer` could drive ghosts on its own clock, which is the obvious next thing and the point at which it would start playing without anyone watching.

---

## Provenance of this document

Everything above was executed, not described. The session is sealed:

- **141 events**, chain intact, all 141 signatures valid under the key the bundle publishes
- **47 injections** against `/api/ingress/pacman` — every move in the trace
- Predictions written at a ledger position **preceding the first move**
- The graph carries its own level in `metadata.game` and its own hypothesis in `metadata.expects`, so the artifact is self-describing
- Continuity cited to the predecessor session

You do not have to believe the trace. Re-run the graph and check the digests — which is the entire point of the machinery I built the game out of.

*Artifacts: `pacman.graph.json` (the game, 12 nodes / 38 edges, 21 of them the level), `build.mjs` (level compiler), `play.mjs` (player + renderer), sealed bundle `bundle-1787002251730.json`.*
