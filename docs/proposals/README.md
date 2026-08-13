# Proposals

**Nothing in this directory is built.**

These are designs and arguments. They describe things that do not exist. A
reader who mistakes one of these for a capability will be wrong, which is why
they are here rather than in `docs/`.

`docs/` holds **findings** — things that were measured, with dates.
This directory holds **intentions** — things that were argued.

Before reading any of them, read `/STATUS.md`, which says what actually runs.

| file | status |
|---|---|
| `envelope-signatures.md` | Stage 0 (service identity) is built and running. Stages 1–3 unbuilt. |
| `sole-ingress-and-derivation.md` | Unbuilt. Note the correction in §4: the runtime already has an HTTP component, so this is about governing what exists rather than adding something. |
| `beyond-the-platform.md` | Unbuilt sketch. Verdict section says build it second, as a demonstration, not a product. |
| `positioning-crypto.md` | Positioning argument. Its central framing is explicitly marked unsettled. |
| `appliance-hardware.md` | Statement of intent. Nothing measured, priced, or prototyped, and it says so. |
| `wasm-runtime.md` | Unbuilt. Implement the declared-but-empty `wasm` ComponentRuntime; code-tool first, rest stays TS. Only evidence is two `experiments/` spikes; ergonomics unproven (§6). |

If one of these gets built, move the parts that became true into `docs/` as a
dated finding, and leave the proposal here marked as superseded.
