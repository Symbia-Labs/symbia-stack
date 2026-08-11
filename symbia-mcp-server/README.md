# symbia-mcp-server

Read-only MCP server over a locally running Symbia stack. Ports are derived
from `@symbia/sys` (`RunningServices` + `ServicePorts`) rather than
hand-maintained here — a tool whose job is to report the truth about a running
stack must not carry its own copy of the port map. `network: 5054` outlived the
move to `5009` in exactly that way.

## Configuration

| variable | required | default | notes |
|---|---|---|---|
| `SYMBIA_HOST` | no | `localhost` | |
| `SYMBIA_EMAIL` | no | `gap-probe@symbia.test` | must be a real user in the identity database |
| `SYMBIA_PASSWORD` | **yes** | none — the server exits without it | |

On a stack seeded by `identity/server/src/seed.ts` the defaults work with:

```
SYMBIA_HOST=localhost
SYMBIA_EMAIL=gap-probe@symbia.test
SYMBIA_PASSWORD=GapProbe!2026x
```

That password is the development literal, and it is only seeded when
`NODE_ENV !== production`. A production stack must set `MCP_PROBE_PASSWORD`
when seeding identity and `SYMBIA_PASSWORD` here to match. Commit `5d94452`
removed this value as a *shipped default in code* for good reason; it lives in
the seed, beside `password123`, where it is visibly a development credential.

## The failure this configuration produces, and how to read it

**`symbia_stack_health` works and every other tool returns 401.**

That combination means the login failed, not that the server is broken.
`/health` is unauthenticated and will keep answering no matter what, so a
healthy-looking probe tool alongside universal 401s is the signature of a
credential or account problem — not a transport, port, or process problem.

Measured 11 August 2026: the account did not exist. The identity database was
re-initialised on 9 August and took `gap-probe@symbia.test` with it, because
the account had only ever been created by hand. A configured password with no
matching row produces exactly this, and it looked like a broken MCP server for
two days (STATUS §6.10).

**Check in this order:**

1. `curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Content-Type: application/json' \
   -d '{"email":"gap-probe@symbia.test","password":"..."}' http://localhost:5001/api/auth/login`
   — 200 means the account is fine and the problem is this server's env.
2. If 401, confirm the row exists:
   `select email from users where email='gap-probe@symbia.test'` in the
   `identity` database. If it is missing, re-run the identity seed.
3. Only then look at the server itself.

An account that exists because someone typed it once is not infrastructure. It
is seeded now, so a reset restores it.

## Note on `dist/`

`dist/` is committed and can lag `src/`. Verify which one is actually being
executed before concluding anything about behaviour — grep a string literal
that only the newer code contains, not a comment, since comments do not survive
minification.
