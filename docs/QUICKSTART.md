# Symbia Stack — Quickstart

Get the full Symbia stack (9 services + Postgres) running locally and confirm it's healthy.

## Prerequisites

- Node.js 20+
- PostgreSQL 15+ (or use the in-memory mode for development)
- Docker and Docker Compose (for the containerised path)

## The stack at a glance

Nine services, each self-contained with its own OpenAPI spec at `/<service>/docs/openapi.json` (served live at `http://localhost:<port>/docs/openapi.json`):

| Service | Port | Purpose |
|---|---|---|
| identity | 5001 | Auth, orgs, API keys, entities |
| logging | 5002 | Log/metric/trace ingest and query |
| catalog | 5003 | Resource registry (graphs, contexts, assistants, integrations, models) |
| assistants | 5004 | Assistant runtime and admin |
| messaging | 5005 | Conversations and participants |
| runtime | 5006 | Graph/routine execution engine |
| integrations | 5007 | LLM providers, external integrations, MCP surface |
| models | 5008 | Local LLM inference |
| network | 5009 | Event routing, policies, SoftSDN observability |
| control-center | 8000 | Operator console |
| api | 9000 | API / admin front end — **the only port published by default** |

Those ports are what each service *listens on*. Only 9000 reaches your host
unless you opt into the dev overlay; everything else talks over the Compose
network by name.

## Option A — Docker (recommended for a full, production-like run)

`start.sh` handles first-run initialisation (image builds, DB bootstrap, super-admin setup) and fast restarts.

```bash
./start.sh                 # first run prompts for super-admin; later runs fast-restart
./start.sh --new           # start fresh with an empty database (removes data)
./start.sh --rebuild       # force rebuild of all images
./start.sh --skip-admin    # skip the admin-creation prompt
```

On first run you'll be prompted to create the super-admin account (name, email, password, org). There are no default credentials — the first user created becomes super admin.

`start.sh` sets `COMPOSE_FILE` so it includes `docker-compose.dev.yml`, which
publishes Postgres, the nine service ports and the console on 8000. Raw Compose
does not:

```bash
docker-compose up -d       # start all services — publishes 9000 only
docker-compose logs -f     # tail logs
docker-compose down        # stop
docker-compose down -v     # stop and wipe data

# opt into the developer ports explicitly
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

## Option B — Local (no Docker), for fast iteration

`start-local.sh` runs the services directly on the host against a local Postgres.

```bash
npm install                # install workspaces
./start-local.sh --db-only # bootstrap the database only
./start-local.sh           # start all services on the host (Ctrl-C stops them)
./start-local.sh --help    # options
```

`npm run dev` is an alias for `./start-local.sh`. Per-service dev is also available: `npm run dev:identity`, `dev:runtime`, `dev:models`, etc.

### Configuration

Copy `.env.example` to `.env` and override only what you need. Common knobs:

- Ports: `IDENTITY_PORT`, `RUNTIME_PORT`, … (defaults above)
- Database: `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` (default `symbia` / `symbia_dev` / `symbia`)
- Secrets: `SESSION_SECRET`, `NETWORK_HASH_SECRET` (change for anything beyond local dev)
- LLM keys: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `HUGGINGFACE_TOKEN`
- Local models: `MAX_LOADED_MODELS`, `IDLE_TIMEOUT_MS`, `DEFAULT_GPU_LAYERS`, `DEFAULT_THREADS`

For a database-free dev loop on a single service, in-memory mode is available, e.g. `IDENTITY_USE_MEMORY_DB=true npm run dev:identity`.

## Verify it's up

Each service exposes `/health` (plus k8s-style `/health/live` and `/health/ready`).

If you started with a bare `docker-compose up -d`, only 9000 is on your host,
so ask the front door:

```bash
curl -s http://localhost:9000/health
```

If you started via `start.sh` or with the dev overlay, the service ports are
published and you can ask each one directly:

```bash
for p in 5001 5002 5003 5004 5005 5006 5007 5008 5009; do
  printf "%s " "$p"; curl -s "http://localhost:$p/health" | head -c 80; echo
done
```

A connection refused on 5001–5009 after a bare `docker-compose up` means the
port is not published — not that the service is down. Those two produce
identical evidence from the outside; `docker-compose ps` tells them apart.

If you have the Symbia MCP connected in Claude, the fastest check is one call to `symbia_stack_health`, which returns per-service status, port, latency, and the OpenAPI title/version each service reports. A healthy stack returns `"healthy": 9, "total": 9`.

## Build & docs

```bash
npm run build                        # build libs then all services
./scripts/workflow/build-docs.sh     # regenerate each service's OpenAPI + llms docs and collect them into docs/api/
./scripts/workflow/validate-docs.sh  # validate docs, incl. OpenAPI-spec-vs-implemented-routes check
```

The route-vs-spec validator (`scripts/workflow/validate-openapi-routes.py`) fails the build if any spec advertises an endpoint that isn't implemented, and warns on implemented routes missing from the spec.

## Common gotchas

- **Port conflicts** — override the `*_PORT` vars in `.env`.
- **Postgres not reachable** — check `POSTGRES_HOST`/`POSTGRES_PORT`; `./start-local.sh --db-only` bootstraps the schema.
- **Git commit blocked by `index.lock`** — if a `.git/index.lock` is left behind, `rm -f .git/index.lock` before committing.
- **First run has no login** — create the super-admin via `./start.sh`; there are no seeded default credentials.
