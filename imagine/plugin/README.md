# Symbia Imagine

An ephemeral Symbia stack that runs on your machine and attaches to Claude over MCP. Ten services in one process, an in-memory store, and a signed record of everything done in a session.

Nothing here is durable by design. When you stop the host, the store goes with it.

## What you get

**Values that carry their own evidence.** Every value is labelled `canonical` (you could compute it again) or `apocryphal` (you could not), and a canonical value ships the recipe that produces it. A component that declares certainty and emits no evidence is downgraded, with the reason recorded. You do not have to take Claude's word for a number it reports.

**A record of order.** Every write lands in a signed, chained ledger. Each event carries its own position, and the session declares its total, so a partial record reads as "23 of 87" rather than as a whole one.

**A sandbox that does not touch anything real.** Ten services, an in-memory store, and a catalog seeded with sample data. Author a graph, run it, throw the whole thing away.

## Installing

Install the plugin. Nothing else to configure — no API key, no config file to edit, no token to paste.

**First run downloads dependencies.** About 150 MB, once per install, and most of it is a Google API client pulled in by a code path this never reaches. It needs a network and takes as long as npm takes. Progress goes to the log; if it fails, it names the directory it failed in.

Requires Node 20 or later on your PATH.

## How it attaches

Two processes. A **host** runs the stack on a loopback port and writes its address to a file readable only by you. A **shim** — the thing Claude spawns — reads that file and connects.

The split exists so the stack can be restarted without closing your chat. It also means the stack outlives the client: quitting Claude leaves the host running until you stop it.

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

## Source

<https://github.com/Symbia-Labs/sidecar>
