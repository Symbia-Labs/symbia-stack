# Step identity: the ref and the commit, for behavior

Status: PAPER, with one measured finding. Proposed 15 Aug 2026. Companion
to operating-modes.md (same night) and prerequisite to per-step weights
(experiments/step-weights, RESULTS.md).

## The measured finding (15 Aug, code-level, decisive)

The routine⇄rule round-trip **does not exist**:

- `ruleSetToRoutines` (assistant-loader.ts:589) preserves the RULE id but
  `actionToStep` (line 506) discards every ACTION id and mints
  `step-${Date.now()}-${index}` on every load. The executed ids (the
  `step-calc` style ids that `ProvenanceStep.id` already records in
  receipts) never reach the UI.
- There is no `routinesToRuleSet`. Routines saved by the console land in
  `metadata.routines` as a display copy the rule executor never reads.
  **Editing a step in the Behavior tab changes what you see, not what
  runs** — the display-copy variant of the Save-button-that-persists-
  nothing defect (see the catalog `.strict()` header for the original).

So "make the projection id-faithful" is not a bugfix; it is building a
return path that was never there. Named plainly so nobody scopes it small.

## The ruling requested

**Step identity is future node identity.** The stack's direction (Brian,
15 Aug) is that routines eventually run on the grounded runtime as
component graphs; a routine step's id will be a graph node id. Choose the
identity discipline that survives that compilation unchanged:

1. **Identity lives on the executed unit** — today the rule action, later
   the graph node. The routine view DISPLAYS ids; it never mints them.
2. **Ids are author-assigned slugs** (`think-answer`, `step-calc`),
   unique within their rule/routine, format-validated, editor-suggested
   so nobody hand-types serials. Author ids make renames LOUD — a rename
   is an identity change and breaks pins visibly — which is the failure
   direction this platform prefers. (The editor's `step-${Date.now()}`
   scheme is worse than every alternative: illegible, time-leaking, and
   collision-prone within a millisecond. It goes regardless.)
3. **The step digest rides beside the id** — canonical JSON of the step
   definition, `@symbia/crypto` treatment. The id is the ref; the digest
   is the commit. Receipts record both; a per-step model pin records the
   step digest it was made against, so "pinned against a step that no
   longer says that" is checkable forever.
4. **Mismatch policy follows the modes:** in design mode, ref-same/
   digest-changed is DISCLOSED (receipt line, console banner — same
   pattern as the card/file weights mismatch). In deploy mode it is a
   REVOCATION: the cast froze the step; a changed step is a different
   artifact. No ratchet clock needed — the mode boundary is the ratchet.

First-match-wins and conditions-calling-tools (the rest of the 11 Aug
review) stay open. They are executor semantics, not identity.

## Migration, in stages that land independently

1. **Editor stops minting.** `actionToStep` carries the action id through;
   steps without ids render as the defect they are.
2. **The return path gets built** — editor saves compile back to the
   executed unit, ids validated unique, round-trip covered by a test that
   diffs ids before and after. This is the large stage, and it is also
   when the Behavior tab starts telling the truth.
3. **Receipts gain the step digest** beside the id they already carry.
4. **Per-step `llm` config attaches to ids** — the step-weights spike
   graduates, with the broker resolve endpoint and its prerequisites
   (registry `bytes`/`precision`, chat-API `seed`).
5. **Compilation to graphs** inherits everything: step id = node id,
   step digest = node definition digest, cast pins ride into the signed
   composition.

## Open sub-decisions (simple form)

- Id uniqueness scope: per routine, or per assistant? (Lean: per routine;
  pins carry routineId + stepId.)
- May the editor auto-suggest ids from step content (slugged), or
  kind+ordinal only? (Lean: content-slugged, author-editable.)
- Does stage 1 land before the ruling on the rest of the 11 Aug cluster?
  (Lean: yes — it deletes a defect either way.)
