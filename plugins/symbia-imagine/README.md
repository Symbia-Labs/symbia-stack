# Symbia Imagine

An ephemeral Symbia stack that runs on your machine and attaches to Claude over MCP. Ten services in one process, an in-memory store, and a signed record of everything done in a session.

Nothing here is durable by design. When you stop the host, the store goes with it.

## What you get

**Values that carry their own evidence.** Every value is labelled `canonical` (you could compute it again) or `apocryphal` (you could not), and a canonical value ships the recipe that produces it. A component that declares certainty and emits no evidence is downgraded, with the reason recorded. You do not have to take Claude's word for a number it reports.

**A record of order.** Every write lands in a signed, chained ledger. Each event carries its own position, and the session declares its total, so a partial record reads as "23 of 87" rather than as a whole one.

**A sandbox that does not touch anything real.** Ten services, an in-memory store, and a catalog seeded with sample data. Author a graph, run it, throw the whole thing away.

## Installing

In Claude Code:

```
/plugin marketplace add Symbia-Labs/symbia-stack
/plugin install symbia-imagine@symbia-stack
```

Nothing else to configure — no API key, no config file to edit, no token to paste.

**First run downloads dependencies.** About 250 MB, once per install, and half of it is a Google API client pulled in by a code path this never reaches. It needs a network and takes as long as npm takes. Progress goes to the log; if it fails, it names the directory it failed in.

Requires Node 20 or later on your PATH.

## How it attaches

Two processes. Claude spawns a **shim**, and the shim spawns its own **host**: the stack, on an ephemeral loopback port, with its address in a file readable only by you. The host holds the shim's pipe, and the pipe closing is its signal to shut down, so when the conversation ends the host and its store end with it.

The host mints a credential at startup, writes it into that address file, and requires it on every request. It dies with the process. Nothing to rotate, nothing to store, nothing to paste anywhere.

## What it does not do

**It does not verify that Claude is right.** A recipe makes one computation checkable. It says nothing about whether the right thing was computed or whether a graph answers the question you asked.

**A seal is not an endorsement.** The signing key is ephemeral and travels inside the bundle. A seal establishes that these artifacts existed in this session in this order, and nothing about whether the work was any good.

**It closes the retroactive-edit hole, not the dishonest-author hole.** Recording predictions before a measurement makes one specific dishonesty mechanically unavailable. It cannot make anyone sincere.

## Skills

| | |
|---|---|
| `check-provenance` | Read what a value claims about itself; recompute a recipe rather than trusting a number |
| `map-discipline` | Register predictions before measuring, and report the broken ones as broken |
| `imagine-session` | Know which host you are on, read the record, seal a session into a bundle |

## The second connector, and why it needs credentials from you

The plugin declares two servers. `symbia-imagine` is the ephemeral host above
and needs nothing. `symbia-durable` attaches to a persistent stack you are
already running — by default `http://localhost:5100` — so that Claude can admin
and develop against the same stack Spyglass is watching.

**It ships with no credentials on purpose.** Set one of these in your own
environment before the connector will start, preferred first:

| | |
|---|---|
| `SYMBIA_SESSION_TOKEN` | a session token (`POST /api/auth/session`) — revocable, no password |
| `SYMBIA_TOKEN` | a pre-issued bearer or API key |
| `SYMBIA_EMAIL` + `SYMBIA_PASSWORD` | legacy login, for a local dev stack |

Without one, the connector exits and says so, naming all three. Earlier builds
shipped a working email and password inside the plugin; every copy carried the
same pair, which made it a default to reuse rather than a placeholder to
replace.

`SYMBIA_BASE_URL` points it at a different origin if yours is not on 5100.

## Source

<https://github.com/Symbia-Labs/symbia-stack>
