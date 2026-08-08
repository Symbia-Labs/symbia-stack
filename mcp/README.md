# Symbia MCP server

A copy of the MCP server that Claude Desktop runs, kept here so it is under
version control.

## Where it actually runs from

```
~/Library/Application Support/Claude/Claude Extensions/ant.dir.local.symbia-stack/
  manifest.json
  server/index.js      <- the live file
```

Claude Desktop spawns `node server/index.js` per `manifest.json`. **Editing the
file in this directory changes nothing** — this is a copy for review and
history. The live file is the one above.

## The failure this directory exists to prevent

Measured 8 Aug 2026: `symbia_stack_health` reported `network` on port **5054**,
unreachable, while the live `index.js` had said `network: 5009` since 7 Aug
21:20. Nothing was wrong with the file. The MCP server process had been running
since before the edit and was holding the old module in memory.

That is the same class as every other stale-process finding in this repo, with
one extra turn of the screw: the process is spawned by Claude Desktop, is not
visible to `ps` from a tool shell, and cannot be restarted from outside the
app. **A change to the live file takes effect only when the extension is
reloaded** — toggle it in Settings → Extensions, or restart Claude Desktop.

If the server ever reports something that contradicts the stack, check the
process age before checking the code.

## Changed 8 Aug 2026

`control-center` (8000) and `api` (9000) added to `PORTS`. They were missing, so
health reported 9/9 on a stack running eleven services — a console that was
down looked like a console nobody had asked about.

Verified against the running stack at the time of the edit: **11/11 healthy**.
Both new entries answer `/health` with 200 and 404 on `/docs/openapi.json`,
which the tool already treats as optional, so they report without a title or
version rather than failing.

## Auth

`SYMBIA_EMAIL` / `SYMBIA_PASSWORD` via `POST /api/auth/login`, defaulting to the
gap-probe test user. This is a different credential path from the `DEV_NO_AUTH`
one the rest of the stack uses. Worth knowing because a login failure surfaces
as *every tool breaking at once* rather than as an auth error.
