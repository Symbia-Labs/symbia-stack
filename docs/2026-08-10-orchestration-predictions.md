# Conversation orchestration — predictions registered before measuring

*Written 10 August 2026, 23:17 EDT, against `07322f4`. Committed before any
code or catalog change. Per discipline 1: the number goes in git before it is
measured, and a broken prediction is reported as broken.*

**The work being predicted:** make the coordinator actually delegate. Today
`coord-orchestrate` is `llm.invoke` → `message.send` over a prompt listing its
team, so it writes prose *about* delegating and forwards nothing. The
`assistant.route` handler, the `suppressResponse` plumbing in `webhooks.ts`,
and the claim/defer turn-taking protocol are all built and have never had a
caller.

## Observations already made (not predictions)

Recorded here so the predictions below are not contaminated by them.

- **O1** The live `ast-coordinator` resource has `updatedAt`
  `2026-08-09T19:59:12Z` (15:59 EDT) and still contains the canary suffix
  `_computed by math.evaluate — no model call_`. Commit `52f7aa2`, which
  removed it from the file, is dated 19:50 EDT the same day — about four hours
  later. The database has not received that fix.
- **O2** The catalog bootstrap log shows `0 added, 10 updated`, `0 added, 5
  updated`, `0 added, 23 updated`, then a single
  `duplicate key value violates unique constraint "resources_pkey"`. Those
  per-file lines are in-memory `Map` merges, printed before anything touches
  the database. `seedFromDataFiles()` makes one `insertResources()` call at the
  end, plain `INSERT`, no upsert, 38 rows in one batch. It is all-or-nothing,
  and it is nothing. The earlier record's inference — "every bootstrap file
  ordered after the failure point is never applied" — describes a per-file
  application that does not exist.
- **O3** Ten assistants are loaded, keyed by catalog key: `analyst`, `builder`,
  `calculator`, `code-runner`, `converter`, `coordinator`, `data-explainer`,
  `echo`, `intent-router`, `smart-calc`. Their `metadata.alias` values are
  `analyst`, `builder`, `calc`, `run`, `convert`, `symbia`, `explain`, `echo`,
  `router`, `smartcalc`.
- **O4** `assistant-route.ts` rewrites its target through a hardcoded
  `aliasMap` before calling `getLoadedAssistant`, which is keyed on catalog key
  only. Six of that map's seven targets do not exist in the live registry, and
  `'builder' → 'assistants-assistant'` rewrites a real assistant into a
  non-existent one. This is the third copy of the alias table
  (`webhooks.ts:138`, `assistant-route.ts:64`, and `metadata.alias` on each
  resource, which is the actual registry).

## Predictions

Each names a disconfirming observation. "Something in routing fails" is
weather; these are not that.

- **P1** Routing to a target by its **alias** (`@calc`, `@explain`) fails today
  with `Assistant '<alias>' not found`, because `getLoadedAssistant` is keyed
  on catalog key. *Disconfirmed by:* an alias reaching its assistant unmodified.

- **P2** Routing to `builder` fails today with
  `Assistant 'assistants-assistant' not found` — a real assistant made
  unreachable by the alias table. *Disconfirmed by:* `builder` receiving a
  routed message.

- **P3** After resolving targets against loaded assistants by key **or** alias
  and deleting the hardcoded map, a coordinator rule using `assistant.route`
  will deliver a message to the target, and the target's own rules will match
  and reply — with the coordinator silent, because `suppressResponse` is
  already handled at `webhooks.ts`. *Disconfirmed by:* two replies (coordinator
  and target), or none.

- **P4 — the one I expect to get wrong.** The delegated reply will arrive with
  **no visible indication that delegation happened**. The console will show a
  message from the target assistant and nothing about who routed it or why. The
  claim/defer protocol runs on every message today and is already invisible;
  routing will be invisible in the same way. *Disconfirmed by:* any routing
  provenance appearing in the transcript or the receipt without new UI work.

- **P5** The forwarded message will re-enter `handleSDNMessageNew`, whose
  mention detection runs *before* the `isTargetedForward` check and overwrites
  `assistantsToNotify` outright. So a routed message whose content still begins
  with `@something` will be re-resolved by mention rather than delivered to the
  targeted assistant. *Disconfirmed by:* a message beginning with an `@mention`
  routing to a different, explicitly targeted assistant.

- **P6** `activeClaims` in `symbia-relay` is a module-local `Map`, so claim
  arbitration is per-process. With one `assistants` container this is
  invisible, and nothing in this session will expose it. *Disconfirmed by:*
  an arbitration failure observed with a single container running.

## What would make this a good session

One delegation observed working in a browser, P4 reported honestly whichever
way it lands, and no new library, no new proposal, and no second
implementation of the alias table.
