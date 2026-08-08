> **RETRACTED IN PART — see "Retraction" at the end of this file.**
> The `## MCP cross-check` and `## Browser pass` sections describe changes made
> on this branch earlier the same day. They are not observations of a shipped
> system. Read them as contaminated.

# Symbia functional probe — 2026-08-06T21:44:40.134Z

Observation only. Status codes are recorded; no endpoint is declared
working or broken here. `not_checked` means the question was not asked,
which is different from asked-and-answered-badly.

Repo HEAD: `d69857b` — fix/2026-08-06-api-gaps (uncommitted changes present)

## Services

| service | port | /health | latency | spec title | version | GET paths probed |
|---|---|---|---|---|---|---|
| identity | 5001 | 200 | 27ms | Symbia Identity Service API | 1.0.0 | 6 |
| logging | 5002 | 200 | 3ms | Symbia Logging Service API | 2.0.0 | 6 |
| catalog | 5003 | 200 | 2ms | Symbia Object Service API | 1.0.0 | 6 |
| assistants | 5004 | 200 | 2ms | Symbia Assistants Backend API | 1.0.0 | 6 |
| messaging | 5005 | 200 | 2ms | Symbia Messaging API | 1.0.0 | 6 |
| runtime | 5006 | 200 | 2ms | Symbia Runtime API | 1.0.0 | 6 |
| integrations | 5007 | 200 | 2ms | Symbia Integrations Service | 2.0.0 | 6 |
| models | 5008 | 200 | 2ms | Symbia Models Service | 1.0.0 | 5 |
| network | 5009 | 200 | 2ms | Symbia Network Service API | 1.0.0 | 6 |

## Port map disagreements

The declared system map and the published container ports differ. Recorded, not resolved.

- **network** — disagrees: declared 5054, published 5009

## Endpoint observations

### identity (:5001)

| path | status | latency |
|---|---|---|
| `/api/api-keys` | 200 | 14ms |
| `/api/users/me` | 200 | 7ms |
| `/api/orgs` | 200 | 13ms |
| `/api/dashboard` | 200 | 5ms |
| `/api/admin/audit-logs` | 200 | 6ms |
| `/api/admin/orgs` | 200 | 13ms |

### logging (:5002)

| path | status | latency |
|---|---|---|
| `/api/logs/streams` | 401 | 1ms |
| `/api/metrics` | 401 | 1ms |
| `/api/traces` | 401 | 1ms |
| `/api/objects/streams` | 401 | 1ms |
| `/api/assistant/config` | 401 | 1ms |
| `/api/auth/config` | 200 | 1ms |

### catalog (:5003)

| path | status | latency |
|---|---|---|
| `/api/resources` | 200 | 7ms |
| `/api/bootstrap` | 200 | 5ms |
| `/api/bootstrap/summary` | 200 | 5ms |
| `/api/stats` | 200 | 5ms |
| `/api/graphs` | 200 | 3ms |
| `/api/contexts` | 200 | 2ms |

### assistants (:5004)

| path | status | latency |
|---|---|---|
| `/api/health` | 200 | 1ms |
| `/api/status` | 200 | 9ms |
| `/api/graphs` | 400 | 2ms |
| `/api/runs` | 400 | 1ms |
| `/api/actors` | 400 | 1ms |
| `/api/rules` | 401 | 1ms |

### messaging (:5005)

| path | status | latency |
|---|---|---|
| `/api/health` | 200 | 4ms |
| `/api/bootstrap` | 200 | 1ms |
| `/api/auth/session` | 200 | 1ms |
| `/api/conversations` | 401 | 1ms |
| `/api/admin/conversations` | 401 | 2ms |
| `/api/admin/stats` | 401 | 1ms |

### runtime (:5006)

| path | status | latency |
|---|---|---|
| `/api/health` | 200 | 1ms |
| `/api/bootstrap/service` | 200 | 1ms |
| `/api/graphs` | 200 | 1ms |
| `/api/executions` | 200 | 1ms |
| `/api/components` | 200 | 1ms |
| `/api/stats` | 200 | 1ms |

### integrations (:5007)

| path | status | latency |
|---|---|---|
| `/api/integrations/providers` | 200 | 1ms |
| `/api/integrations/capabilities` | 401 | 1ms |
| `/api/integrations/registry` | 401 | 1ms |
| `/api/integrations/mcp/info` | 200 | 1ms |
| `/api/integrations/usage` | 401 | 1ms |
| `/api/integrations/status` | 200 | 1ms |

### models (:5008)

| path | status | latency |
|---|---|---|
| `/v1/models` | 200 | 1ms |
| `/api/models` | 200 | 1ms |
| `/api/stats` | 200 | 1ms |
| `/health/live` | 200 | 1ms |
| `/health/ready` | 200 | 1ms |

### network (:5009)

| path | status | latency |
|---|---|---|
| `/api/registry/nodes` | 401 | 1ms |
| `/api/registry/contracts` | 401 | 1ms |
| `/api/registry/bridges` | 401 | 1ms |
| `/api/events` | 401 | 1ms |
| `/api/events/stats` | 401 | 1ms |
| `/api/policies` | 401 | 1ms |

## UI surfaces (reachability only)

A single-page app answers 200 for paths that do not exist. These rows say
a server responded, and nothing about whether any button works.

| surface | status | latency |
|---|---|---|
| control-center (vite dev) | 200 | 4ms |
| control-center (container build) | 200 | 3ms |
| control-center proxy -> identity | 200 | 2ms |

## Counts

- services asked: 9
- services that returned any HTTP status on /health: 9
- services that returned no status at all: 0
- endpoint probes recorded: 53
- docker port inspection: answered

UI is not covered by this script. Browser observations are appended by the
scheduled task that calls this script.

## MCP cross-check

Instruments disagree about `network`.

| question | `symbia_stack_health` (MCP) | probe script (docker + HTTP) |
|---|---|---|
| network port | 5054 | 5009 (published by `symbia-stack-network-1`) |
| network status | `unreachable`, "fetch failed" | HTTP 200, `{"status":"ok"}` |
| services healthy | 8 of 9 | 9 of 9 responded |

Recorded, not resolved. The declared system map also says 5054.

Separately: `ops/inventory-snapshots.jsonl` recorded `9 of 9` healthy at
10:35 today with network on 5054. Whether the port moved or the record is
of a different configuration is `not_checked`.

## Browser pass

Chrome, `http://localhost:5173/`, this session.

| observation | value |
|---|---|
| document title | `Symbia Control Center` — set |
| rendered content | none; viewport 1726x997, blank white |
| accessibility tree | empty — zero interactive elements returned |
| `get_page_text` | "No text content found" |
| console messages after a fresh reload | none captured, including no errors |

The HTML shell and enough JavaScript to set `document.title` ran. Nothing
painted. No error was reported anywhere.

This is the case the browser pass exists for: the same surface returned HTTP
200 on three separate curl probes in the table above, and `/svc/identity/health`
proxied correctly through it. Every non-browser signal available said the
control center was fine.

Not repaired, per standing discipline. Cause is `not_checked`.

## Not checked

- Why the control center renders empty — no root-cause work performed.
- Whether the container build on :8000 renders (only :5173 was opened).
- Whether `network` moved from 5054 to 5009 or was never on 5054.
- Any authenticated endpoint: everything returning 401 above was asked
  without credentials, so 401 is the answer to "does it enforce auth",
  not to "does it work".
- Any POST, PUT, or DELETE operation. This probe is read-only.
- Whether identity returning 200 unauthenticated on `/api/users/me` reflects
  `DEV_NO_AUTH` (HEAD is `d69857b`, "implement DEV_NO_AUTH") or something
  else. Observed, not explained.

## Retraction

Written after Brian pointed out that this run measured the author's own work.

**1. The 5173 finding is void.** It was reported as a discovery — a console that
returns 200 to curl and renders nothing in a browser. `f159316`, committed
earlier the same day on this branch, is titled *"delete Vite; one origin, no
environment detection."* Vite no longer exists in the tree. `lsof` showed node
PID 71461 still listening on 127.0.0.1:5173, serving a bundle built before the
deletion. The blank page was a stale process impersonating code that had been
removed. Killed by port, per discipline #4 — which this very report was written
to enforce, and which its author violated while writing it.

**2. The instrument disagreement was self-inflicted, not discovered.**
`cc6c59e` — *"network 5054 -> 5009"* — is on this branch, same day. The MCP
server and the system map still say 5054 because the move did not update them.
Recording that as a finding about the instruments dressed an unfinished edit as
an observation about the platform.

**3. The 8000 dashboard is this branch's output, not a shipped system.** HEAD is
`d69857b`, whose own message opens "REGRESSION I CAUSED." The standing task is
to walk **v1.2.0**; the checkout is `fix/2026-08-06-api-gaps`. Reporting today's
build as "the live system" is precisely the contamination the project
instructions warn about: a description of the thing just built rather than the
thing that shipped.

**What is still good in this file.** The service table and endpoint
observations in the sections above — status codes from nine services against
paths taken from each service's own OpenAPI document. Those stand, with the
caveat that they too describe this branch.

**Disposition.** The 4-hourly scheduled task built on this run was deleted
rather than repaired. Pointing it at port 8000 would have fixed the address and
preserved the error: a recurring job measuring its own author's uncommitted day
and filing the result as observation.
