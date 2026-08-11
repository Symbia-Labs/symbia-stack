# S3 — multi-turn results

**11 August 2026.** First test of a conversation with more than one message.
`scripts/probe-multiturn.mts`, three turns in one conversation.

**Turn 1 is correct. Turns 2 and 3 are broken in four separate ways.**

## What happened

```
turn 1: "2+2"
   by calculator   COMPUTED   "= 4"
   route: coordinator -> calculator  method=declaration
   lineage: checksum=sha256:45b4fdbae… parent=["2ab65b79-…"]

turn 2: "now multiply that by 10"
   ⚠️  2 ASSISTANTS ANSWERED ONE MESSAGE
   by coordinator  REFUSED   "⚠️ I encountered an error … No specialist declares this"
   by calculator   REFUSED   "⚠️ I encountered an error … Unexpected token: nowmultiplythatby10"
   both: NO DELEGATION — answered without a routing decision

turn 3: "and what's 15% of the result?"
   ⚠️  2 ASSISTANTS ANSWERED ONE MESSAGE
   by calculator   REFUSED   "⚠️ I encountered an error … Invalid character: '"
   by smart-calc   NONE — this reply carries no receipt   "x * 0.15"
```

## 1. A delegation permanently changes the conversation

`assistant.route` adds the target as a participant. It never leaves. From turn
2 onward **every message is delivered to every assistant that has ever been
routed to**, in addition to the coordinator:

```
[SDN] Assistants in payload: 2
[SDN] Processing message for 2 assistant(s): coordinator, calculator
```

By turn 3 that is calculator *and* smart-calc. The roster in a conversation
grows monotonically and nothing prunes it.

## 2. Several assistants answer the same message

Both processed turn 2 and **both replied**. The turn-taking machinery ran and
did not arbitrate:

```
[SDN] Claim emitted for coordinator: priority=25
[SDN] coordinator won claim, proceeding with response
[SDN] Claim emitted for calculator: priority=33
[SDN] calculator won claim, proceeding with response
```

Two claims, two winners. `suppressResponse` keeps the *coordinator* quiet when
it delegates; nothing keeps a specialist quiet once it is in the room. The user
gets two answers to one question, and on turn 3 the two disagree about whether
they failed.

## 3. Routing is bypassed entirely after turn 1

Every reply from turn 2 on carries **no delegation record**. The specialist is
handed raw message text directly, with no `assistants.route` call, no declared
pattern, no `method`, and nothing sealed about why it is the one answering.

This is STATUS §6.3 returning by a different door. It was closed this morning
for the delegation path; the *post-delegation* path never had it. **A
conversation is honest about routing for exactly one turn.**

## 4. A reply with no receipt at all

Smart Calculator's turn-3 answer — `x * 0.15` — carries **no provenance
envelope**. Not a wrong arena: no envelope. A reply the platform can say
nothing about, which is the single thing it exists to prevent.

It also shows the failure mode underneath: the model produced `x * 0.15`,
`math.evaluate` could not evaluate it, and the model's raw output was emitted
as the answer. The parse step became the reply.

## 5. The chain still has not advanced

Only one delegation occurred across three turns, so the lineage ordering
property remains **untested** — not because the probe failed to exercise it,
but because delegation stops happening after turn 1. Fixing §3 above is a
prerequisite for testing the chain at all.

**And a flaw the run exposed anyway:** turn 1's checksum here,
`sha256:45b4fdbae…`, is byte-identical to turn 1 of a *different* conversation
earlier. The chain digest covers the payload only — not `parent_links`, not the
timestamp — so two identical delegations in unrelated conversations produce the
same chain value. The events differ (`event_id`, `parent_links`); the checksum
does not distinguish them. **A checksum that does not commit to its own parent
is not identifying a position in a chain.**

## 6. Participants are not recorded

`GET /api/conversations/:id/participants` returns `[]` while assistants are
demonstrably receiving and answering messages. Related to STATUS §6.5, where
`assistant.route`'s join returns 401 — so the fan-out is driven by something
other than the participants table, and the table is not a record of who is in
the room.

## 7. Every failure is dressed as a malfunction

Turn 2's coordinator reply is a *correct refusal* — nothing declares
`now multiply that by 10` — presented as `⚠️ I encountered an error while
processing your request`. Already recorded from D7; multi-turn makes it
constant rather than occasional.

Neither specialist has any memory, so `that` and `the result` are
unresolvable. That much is expected. Being asked at all is not.

## The instrument, again

The first run reported `NO REPLY` for turn 1, which had worked.
`/api/auth/me` returns `{ user, organizations }` rather than a bare user, and
the message field is `sender_id`, not `senderId` — so the filter compared
`undefined !== undefined` and matched nothing.

Sixth instrument failure in this session, and the same shape as the other five:
it pointed at working code and said broken. The probe now counts *every* reply
to a turn rather than the first, which is what made §2 visible.

## Ranked

1. **Suppress specialists that were not addressed.** One message, one answer.
2. **Route every turn**, not just the first. A reply with no delegation record
   is unattributed, and this is the majority of a real conversation.
3. **Never emit a reply with no envelope** (§4). The failure path in smart-calc
   emits the model's raw parse; that path must refuse instead.
4. **Commit the parent link into the chain digest** (§5).
5. Separate the refusal path from the error path (§7).
6. Decide whether a specialist stays in a conversation at all, and for how long.
