# Developer guide

How to get Symbia Stack running on your machine, find your way around it, and
make a change without breaking the thing that makes the platform worth having.

This is the onboarding doc. `docs/QUICKSTART.md` is the short boot sequence;
`CONTRIBUTING.md` covers PR mechanics; `INTENT.md` and the per-service
`INTENT.md` files explain *why* each piece is shaped the way it is. Read those
after this one.

---

## 1. What you are looking at

Symbia is nine backend services plus a browser UI. Each service owns one
concern, runs on its own port, speaks HTTP, and publishes its own OpenAPI spec.
They talk to each other through a service mesh client (`@symbia/relay`) rather
than by importing each other's code.

| Service | Port | Owns |
|---|---|---|
| identity | 5001 | auth, users, orgs, API keys, credentials |
| logging | 5002 | logs, metrics, traces, objects |
| catalog | 5003 | the registry of reusable resources |
| assistants | 5004 | assistant runtime and rule engine |
| messaging | 5005 | conversations, WebSocket bus |
| runtime | 5006 | graph execution, component registry, ingress |
| integrations | 5007 | LLM gateway, external integrations, MCP surface |
| models | 5008 | local GGUF inference |
| network | 5009 | event routing, service mesh, topology |
| service-admin | 3000 | minimal admin UI (plain Node, no build step) |
| control center | 5173 | the main UI — Vite dev server, **started separately** |

Ports are not hardcoded in nine places. They live in `symbia-sys/src/index.ts`
as `ServiceId` / `ServicePorts`, and everything else — the start scripts, the
Vite proxy table, the clients — derives from there. If you add or move a
service, that file is the edit; anything that needs a second edit somewhere
else is a bug worth reporting.

### The rule that shapes the codebase

> If you cannot build something through the Symbia API alone, that is a
> platform defect to be logged — not a reason to reach outside.

Standing up an unregistered service, hand-editing a route map, or hardcoding an
ingress will produce something that works and quietly destroys the platform's
central claim: that no capability enters without a recorded gate. When you hit
that wall, write the defect down. `docs/API-MEASUREMENTS.md` is the running
ledger of exactly this, and it is the most useful document in the repo for
understanding what the platform actually does versus what it says it does.

---

## 2. Prerequisites

- Node.js 20+ (the start scripts check and refuse older)
- npm 10+
- PostgreSQL 15+ — or Docker, which brings its own
- Docker + Docker Compose, if you take the container path

---

## 3. Getting it running

Two paths. Take Docker the first time — it bootstraps the database and walks
you through creating the first account. Take the local path once you are
iterating on a service.

### Path A — Docker (recommended for a first run)

```bash
./start.sh                        # first run: builds images, bootstraps DB, prompts for super admin
./start.sh                        # later runs: fast restart, no prompts
./start.sh --new                  # wipe the database and start clean
./start.sh --rebuild              # force rebuild of all images
./start.sh -r -s integrations     # rebuild one service only
./start.sh --skip-admin           # skip the admin prompt
./start.sh --help
```

There are **no default credentials**. On first run you are prompted for name,
email, password, and organization name; that first user becomes super admin
with visibility across all orgs.

Raw Compose works too (`docker-compose up -d`, `logs -f`, `down`, `down -v`),
but note what it publishes. **`docker-compose.yml` alone exposes exactly one
port to the host: 9000.** Everything else talks over the compose network by
service name. That is what someone who just cloned the repo gets.

For the console on 8000, psql on 5432, or a service port to curl, add the dev
overlay:

```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

`start.sh` sets `COMPOSE_FILE` to do this for you. The overlay also removes the
`depends_on: db-bootstrap` conditions so restarts are fast. Read the comment at
the top of that file before you touch it — an earlier version replaced
bootstrap with an `echo`, and any new table silently never got created.

It is called `docker-compose.dev.yml`, not `docker-compose.override.yml`, and
the rename is the whole point: compose loads an override file automatically, so
under the old name every clone silently ran with the developer's exposure
surface and the documented default was a fiction. `npm run check:ports` now
asserts the default surface is 9000 and nothing else.

### Path B — local, no Docker

```bash
npm install                  # installs all workspaces
./start-local.sh --db-only   # bootstrap the database against a local Postgres
./start-local.sh             # start every service on the host; Ctrl-C stops them
./start-local.sh --skip-build  # skip the library build for a faster restart
./start-local.sh --help
```

`npm run dev` is an alias for `./start-local.sh`. Single service:
`npm run dev:catalog`, `dev:runtime`, `dev:identity`, and so on.

Logs and PIDs land in `.local-pids/` — one `<service>.log` per service. That
directory is where you look when a service starts and then vanishes.

For a database-free loop on one service, in-memory mode:

```bash
CATALOG_USE_MEMORY_DB=true npm run dev:catalog
IDENTITY_USE_MEMORY_DB=true npm run dev:identity
```

### The control center is not started by either script

This catches everyone. Neither `start.sh` nor `start-local.sh` runs the main
UI, and it is **not** an npm workspace — it has its own `node_modules`.

```bash
cd symbia-control-center
npm install      # once
npm run dev      # http://localhost:5173
```

### Configuration

Copy `.env.example` to `.env` and uncomment only what you need to change.
Everything has a working local default. The knobs you will actually touch:

- **Ports** — `IDENTITY_PORT`, `RUNTIME_PORT`, … when something conflicts
- **Database** — `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB`
  (defaults `symbia` / `symbia_dev` / `symbia`)
- **Secrets** — `SESSION_SECRET`, `NETWORK_HASH_SECRET`,
  `CATALOG_INTERNAL_SERVICE_TOKEN`. Local defaults are fine locally and
  nowhere else.
- **LLM keys** — `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `HUGGINGFACE_TOKEN`
- **Runtime gates** — `RUNTIME_MANIFEST_ENFORCEMENT` (default `strict`),
  `RUNTIME_REGISTER_MANIFESTS`, `RUNTIME_HYDRATE_GRAPHS`,
  `RUNTIME_AUTO_EXECUTE`. `strict` is the default on purpose: a gate that is
  skipped by default is not a gate.

---

## 4. Confirming it is actually up

Every service serves `/health`, plus `/health/live` and `/health/ready`.

```bash
for p in 5001 5002 5003 5004 5005 5006 5007 5008 5009; do
  printf "%s " "$p"; curl -s "http://localhost:$p/health" | head -c 80; echo
done
```

If you have the Symbia MCP server connected in Claude, one `symbia_stack_health`
call returns per-service status, port, latency, and the OpenAPI title/version
each service reports. A healthy stack is `"healthy": 9, "total": 9`.

**A green health check is not a working UI.** Validate anything user-facing in
a browser, not with `curl`. An API call that succeeds while the button does
nothing is the exact failure mode this codebase keeps producing — see §8.

---

## 5. Repo layout

```
symbia-stack/
├── identity/ logging/ catalog/ messaging/     # the nine services,
├── network/ runtime/ assistants/              # each self-contained
├── integrations/ models/
├── service-admin/            # minimal admin UI, plain Node
├── symbia-control-center/    # the real UI (React + Vite), NOT a workspace
│
├── symbia-sys/               # ServiceId, ServicePorts, bootstrap, script
├── symbia-http/              # Express + WebSocket + middleware + health
├── symbia-db/                # Drizzle ORM, with pg-mem for in-memory mode
├── symbia-auth/              # shared auth middleware
├── symbia-relay/             # service mesh client
├── symbia-logging-client/    # telemetry SDK
├── symbia-messaging-client/  # messaging client
├── symbia-catalog-client/    # catalog client
├── symbia-seed/              # deterministic test data
├── symbia-id/  symbia-md/    # id utils, doc generation
├── symbia-mcp-server/        # read-only MCP window onto a running stack
│
├── examples/                 # worked apps that exercise the platform (see §7)
├── tests/                    # ITT framework (see §6)
├── scripts/                  # registration + workflow scripts
├── docs/                     # QUICKSTART, APP-MODEL, SYMBIA-MCP, api/
└── website/                  # marketing site
```

`package.json` at the root lists the npm workspaces. Note what is **not** in
that list and therefore needs its own `npm install`: `symbia-control-center`,
`symbia-catalog-client`, `symbia-mcp-server`, `tests`, `energy`, `website`.

### Anatomy of a service

Every backend service has the same shape. `catalog/` is a good one to read:

```
catalog/
├── server/src/
│   ├── index.ts        # entry point, server setup, route mounting
│   ├── routes.ts       # HTTP routes
│   ├── storage.ts      # data access
│   ├── db.ts           # DB wiring (@symbia/db)
│   ├── auth.ts         # auth wiring
│   ├── config.ts       # env → typed config
│   ├── openapi.ts      # spec generation
│   └── migrations/     # SQL migrations
├── shared/schema.ts    # Zod schemas, shared with clients
├── docs/               # generated: openapi.json, llms.txt
├── scripts/build.ts    # esbuild bundle
├── INTENT.md           # what this service is for and what it refuses to be
├── README.md
├── .env.example
└── Dockerfile
```

Shared libraries are consumed as local file dependencies —
`"@symbia/db": "file:../symbia-db"`. When you change a library, rebuild it
(`npm run build:libs`) before the consuming service will see it.

---

## 6. Everyday commands

From the repo root:

```bash
npm install              # all workspaces
npm run build            # libs, then services
npm run build:libs       # libraries only — do this after editing symbia-*
npm run build:services   # services only
npm run check            # tsc across every workspace that defines `check`
npm run clean            # nuke node_modules, dist, tsbuildinfo
npm run db:setup         # alias for ./start-local.sh --db-only
```

Per service: `npm run dev`, `build`, `start`, `check`. Some also have `seed`,
`db:push`, or `migrate` — check the service's `package.json` rather than
assuming.

### Docs and spec validation

```bash
./scripts/workflow/build-docs.sh      # regenerate each service's OpenAPI + llms docs into docs/api/
./scripts/workflow/validate-docs.sh   # validate, including spec-vs-implemented-routes
```

`scripts/workflow/validate-openapi-routes.py` **fails the build** if a spec
advertises an endpoint that is not implemented, and warns on implemented routes
missing from the spec. Run it before you claim an API exists.

### The workflow orchestrator

`scripts/workflow/workflow.sh` wraps the rest:

```bash
./scripts/workflow/workflow.sh scan 3        # scan codebase context
./scripts/workflow/workflow.sh audit --fix
./scripts/workflow/workflow.sh build --docker
./scripts/workflow/workflow.sh docs
./scripts/workflow/workflow.sh validate
./scripts/workflow/workflow.sh test          # ITT tests
./scripts/workflow/workflow.sh ci            # audit → build → validate
```

### Tests — the ITT framework

Tests live in `tests/` and are organised by what they are trying to establish,
not by what they touch:

- **Intentions** — does the code do what `INTENT.md` and `README.md` say?
  (`intent-alignment`, `api-contract`)
- **Trust** — auth enforcement, RLS tenant isolation, secret handling
- **Transparency** — complexity, naming, no `eval`, no encoded logic,
  correlation ids, user-journey telemetry

```bash
npx tsx tests/run-itt.ts              # everything
npx tsx tests/run-itt.ts intentions   # or trust / transparency
./scripts/workflow/test-itt.sh
```

Thresholds and detection patterns are in `tests/itt.config.ts`.

### Git hooks

```bash
./scripts/setup-git-hooks.sh
```

Installs a pre-commit hook that blocks `debugger` statements in staged TS and
warns on `console.log`.

---

## 7. How capability enters the platform

This is the part that is unlike other codebases, and getting it wrong is how
people accidentally break the product's whole premise.

**Nothing becomes real by being put in a directory.** Not a graph, not an app,
not a component. Capability enters through an authenticated, gated, ledgered
write to the catalog, and the runtime hydrates from there.

### Components

Sixteen builtin components ship with the runtime, implemented in
`runtime/server/src/executor/components*.ts`:

```
symbia.io.passthrough    symbia.io.collect       symbia.io.delay
symbia.io.http           symbia.io.log           symbia.source.timer
symbia.logic.filter      symbia.logic.switch     symbia.transform.map
symbia.compute.arithmetic
symbia.state.join        symbia.state.latest     symbia.state.rollup
symbia.state.window
symbia.sink.log          symbia.sink.metric
```

On boot the runtime publishes their manifests to the catalog
(`RUNTIME_REGISTER_MANIFESTS`). Under `RUNTIME_MANIFEST_ENFORCEMENT=strict` a
graph referencing a component with no registered catalog manifest **refuses to
load** — an unreachable catalog fails graph loads rather than silently trusting
the in-process registry.

Component manifests are a public contract. Keep domain vocabulary out of them.
A 6 Aug 2026 audit found `symbia.state.join`'s published manifest documenting
its config with data-centre electrical point names, and three state components
defaulting `keyField` to `"point"` — a telemetry-historian term leaking into
every other domain. Both fixed; the general lesson stands.

### Graphs and ingress

```bash
node scripts/register-graph.mjs <graph.json> [--key K] [--role pipeline] \
     [--app apps/foo] [--org ORG_ID] [--status published] [--republish]
```

A graph's `metadata.ingress` (`{node, port, capability}`, defaulting to
`entry`/`in`) is registered as its own catalog resource. External producers
deliver through `POST /api/ingress/:graphName`, which checks the declared
capability — authentication alone would let any logged-in caller push into any
graph. The `--org` flag is not bookkeeping: the owning org authorises delivery
and is what derived data is attributed to.

### Apps

An app is a **declared, versioned bundle of configuration and customization
over the bare platform** — published, shared, deployed onto any Symbia stack,
always executing inside the Symbia runtime. It never runs standalone. Full
definition in `docs/APP-MODEL.md`; status there is *design agreed, not fully
implemented*, so read it as intent.

```bash
node scripts/register-app.mjs <app.json> [--org ORG_ID] [--status published] [--republish]
node scripts/verify-apps.mjs
```

The distinction that carries the weight: the **app** is the portable artifact
(graphs, component manifests, ingress declarations, config *schema*); the
**installation** is one deployment into one org on one stack (running
executions, config *values*, secrets, derived series). Bake an org id or a
metric namespace into the artifact and it can only ever be installed once.

### Catalog scope

The catalog is for **reusable items only** — types, graphs, components,
integrations, apps. Real-time point instances are primitives with a proxy
representation on graphs. They are never catalog resources.

### The example apps

`energy/` was a data-centre energy monitoring app built through the platform API
alone — a **test case, not the product**: the load applied to the platform in
order to find out what it could not do. The app was removed on 8 Aug 2026, its
job done. Its defect ledger survives as `docs/API-MEASUREMENTS.md` and is the
real output; the app itself is recoverable from git history if it is ever
needed again.

`examples/order-margin/` exists so the platform is never validated against a
single application; it walks the same
register → hydrate → gated ingress → durable state → metric sink path in a
domain with no energy vocabulary anywhere.

If you find yourself shaping a platform contract around one app's needs, that is
the defect, not the feature.

---

## 8. Things that have actually cost people time

Each of these is a real failure that happened here, not a hypothetical.

**Never make cross-origin calls from the control center.** Use `/svc/{service}`,
which Vite proxies to the service root without rewriting path segments — so
both `/health` (root) and `/api/*` are reachable. Only messaging, network, and
runtime set CORS headers in their entry point; the other six do not — so
absolute `http://localhost:PORT` URLs get blocked by the browser before the app
sees the response. This surfaced as a dashboard reading
"3/8 healthy" with every container healthy, and as "Failed to fetch" rendering
every LLM provider as "Not configured".

**Do not gate proxy selection on `import.meta.env.DEV`.** Measured in the
running page, that flag is `false` even under `npm run dev` — `NODE_ENV` leaks
in from the environment. Detect the dev server by
`window.location.port === '5173'`. This defect appeared in two separate config
files (`symbia-control-center/src/config/services.ts` and
`symbia-control-center/src/config/endpoints.ts`), and fixing one did not reach
the other.

**A shared-looking concern with N independent implementations is not shared.**
`authMiddleware` has been forked into at least three services; patching
`@symbia/auth` reached none of them. Before you fix a shared thing, grep for
its other copies.

**Never trust a running process to be the code you just wrote.** Grep for a
unique source marker inside the running bundle before believing a fix landed.
Stale containers and stale local processes impersonated fixes four separate
times in one day. Kill by **port**, not by path — `pkill -f` has repeatedly
missed.

**Blank beats green.** "Not checked" is a legitimate state. Never infer a pass
from the absence of evidence. A confident `0` that actually means "never asked"
is the exact defect this product exists to prevent.

**Separate observation from inference.** "Returned 404" is an observation.
"The endpoint is missing" is an inference. Never write a conclusion into a
probe — conclusions rot when the code changes underneath them.

**Do not mark work complete because something equivalent exists.** Building a
different thing that does the same job is not the task, and it is the same
failure as a Save button reporting success without persisting.

**Dev and local persistence is JSONL and local logs only.** Connectors for
GreptimeDB, InfluxDB, and Elastic come later, behind an interface. Do not reach
for one now.

**`.mcp.json` contains a real bearer token and org id.** Treat it as a secret.
Rotate it if it has been shared; prefer injecting from the environment. Do not
paste it into docs, issues, or chat.

**`index.lock` blocking a commit** — if `.git/index.lock` is left behind,
`rm -f .git/index.lock` and retry.

**Port conflicts** — override the `*_PORT` vars in `.env` rather than editing
code.

---

## 9. Working discipline

Conventions the codebase is maintained under. They exist because of specific
failures, not as style preferences.

1. **Predictions before results.** Register the expected number in git before
   measuring. Report broken predictions as broken.
2. **Every instrument measures itself until something outside it objects.** A
   fuzzer's severity taxonomy shared the optimism of the code it tested; a
   classifier was validated against the labels it was corrected against; a
   retrieval eval contained its own answers. Build the check so it cannot share
   the author's optimism.
3. **Partitions, not promises.** Test/train isolation by real temporal split or
   seeded partition. Ids that look like time usually are not.
4. **UI is validated in a browser, never with `curl`.**
5. **Commit messages follow Conventional Commits** — `feat:`, `fix:`, `docs:`,
   `refactor:`, `test:`, `chore:`.
6. **TypeScript everywhere, Zod for input validation**, following the existing
   patterns in the service you are touching.

---

## 10. Where to read next

| Document | What it gives you |
|---|---|
| `docs/QUICKSTART.md` | the boot sequence, condensed |
| `INTENT.md` (root) | what the platform is for |
| `<service>/INTENT.md` | what each service refuses to be — read before changing one (every service except `models`) |
| `docs/APP-MODEL.md` | what an app is, and app vs. installation |
| `docs/SYMBIA-MCP.md` | the two MCP surfaces and how to drive them |
| `docs/RLS-IMPLEMENTATION.md` | row-level security and tenant isolation |
| `docs/SYMBIA-SCRIPT-QUICKSTART.md` | the scripting surface |
| `docs/api/` | generated OpenAPI + `llms.txt` per service |
| `docs/API-MEASUREMENTS.md` | the defect ledger — what the API could not do |
| `CONTRIBUTING.md` | PR, branch, and release mechanics |
| `SECURITY.md` | reporting security issues |
