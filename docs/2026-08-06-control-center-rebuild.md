# Control center rebuild — design

*6 August 2026. Design only. No code written. Disputable.*

Two changes requested after a read of `DEVELOPER.md`:

1. Rebuild the control center. Remove Vite. Port the existing views into a
   control center **service** that starts with the stack instead of being a
   bundler a developer runs by hand.
2. Re-tier the ports: base services `5000+`, control center `8000`, API `9000`.

---

## 1. Decisions already taken

Recorded so they are not relitigated mid-build.

| Question | Decision |
|---|---|
| What is on `:9000` | The existing API front end currently on `:3000` — `service-admin`. Same webserver model reused for the UX on `:8000`. |
| What is on `:8000` | Control center as **service #10**: registered in `ServiceId`, same lifecycle as the other nine. |
| Build toolchain | esbuild, exactly as every service already does in `scripts/build.ts`. |
| Server library | `createSymbiaServer` from `@symbia/http`, like the nine — not hand-rolled `node:http`. |
| `network` port | 5054 → 5009. |
| `ServiceId.SERVER` | Stays registered at 5000, reserved, nothing listening. |
| Energy panel | Not ported in this pass. Archived to `archive/energy/`; route, type member, nav entry and panel map entry come out with it. |
| Monaco | Vendored into `dist/vendor/monaco/vs` by the build and served from 8000. No CDN fetch at runtime. |
| App model | **Deferred, 6 Aug.** Not settled in this pass. |
| Scope of this pass | Design document first. Nothing built until approved. |

The console is service #10 and the build proceeds on that basis.
`symbia-control-center/app.json` declares it an **app**
(`"key": "apps/control-center"`), which says the opposite; that contradiction is
parked rather than resolved, and §8.1 records it so it is picked up
deliberately later instead of being discovered. `app.json` is left in place and
untouched — editing it to agree with a decision that has not been made would
destroy the record of the disagreement.

---

## 2. The webserver model being reused

`service-admin/server.js` — 527 lines, `node:http` only, one production
dependency (`pg`), no framework, no bundler, no build step. It serves a single
`index.html`, answers `/health`, and proxies to services.

What makes it the right model here:

- It starts as a container in `docker-compose.yml` like anything else. No
  second install tree, no `npm run dev` a developer has to remember.
- There is exactly one origin. The page and its API calls share it, so CORS is
  structurally out of the picture rather than negotiated per service.
- It has no dev mode. There is no flag that can be true in one process and
  false in another.

What must **not** be copied from it:

```js
// service-admin/server.js:229 — hand-maintained, keyed by port
const SERVICE_MAP = {
  '5001': process.env.IDENTITY_HOST || 'identity',
  '5002': process.env.LOGGING_HOST  || 'logging',
  ...
};
```

This is the same defect class as D5 in `vite.config.ts` (already corrected
there by deriving the map from `@symbia/sys`), and worse: the proxy path is
`/proxy/:port/*`, so the **port number is in the URL**. Every caller then
hardcodes a port. A port change becomes a change to every caller.

Both new servers derive their route table from `@symbia/sys` and address
services by **id**, never by port.

---

## 3. Port plan

| | now | proposed |
|---|---|---|
| `server` (placeholder, nothing listens) | 5000 | 5000 — **kept, reserved** |
| identity | 5001 | 5001 |
| logging | 5002 | 5002 |
| catalog | 5003 | 5003 |
| assistants | 5004 | 5004 |
| messaging | 5005 | 5005 |
| runtime | 5006 | 5006 |
| integrations | 5007 | 5007 |
| models | 5008 | 5008 |
| network | 5054 | **5009** — approved |
| control center | 5173 (Vite, by hand) | **8000** |
| API front end (`service-admin`) | 3000 | **9000** |

Three notes.

**`ServiceId.SERVER: 5000` stays reserved.** Nothing listens on it and it is
already special-cased out of the Vite proxy map — the new proxy keeps that
filter. Holding 5000 costs nothing and keeps the slot from being claimed by
something else; the cost is that "registered" and "running" are not the same
predicate here, so anything that enumerates the registry to reach services has
to skip it explicitly. That filter should live in one place and be commented as
deliberate, or it will read as a bug and get removed.

**`network` moves 5054 → 5009**, closing the one break in the block. Approved
6 Aug. It appears in ten `.env.example` files, `docker-compose.yml`, both start
scripts, and `symbia-mcp-server`. It moves in one commit, generated from the
registry rather than hand-edited across those files — see step 3. Anything
still answering on 5054 after that commit is a reference that was not derived
from `@symbia/sys`, which makes the move a useful probe for exactly the
drift F2 and F4 describe.

**`service-admin` is not in `ServiceId` at all.** A service running on a port,
proxying to every other service and holding direct Postgres credentials to six
databases, with no entry in the platform's own registry. That is the condition
the platform rule exists to catch, and it is currently unrecorded. Moving it to
9000 is the moment to register it — as `ServiceId.API`.

---

## 4. What runs on 8000

`symbia-control-center/server/` — the same shape as any service under
`DEVELOPER.md` §5 "Anatomy of a service".

```
symbia-control-center/
├── server/src/
│   ├── index.ts      # createSymbiaServer({ serviceId: CONTROL_CENTER })
│   ├── proxy.ts      # /svc/{id}/* -> service, derived from @symbia/sys
│   ├── static.ts     # serve dist/, SPA fallback to index.html
│   └── config.ts
├── src/              # the React app, unchanged in structure
├── scripts/build.ts  # esbuild — bundle + tailwind + monaco + index.html
├── dist/
│   ├── app.js  app.css  index.html
│   └── vendor/monaco/vs/   # copied at build, never committed
├── Dockerfile
└── app.json          # see §8
```

Three responsibilities, and deliberately no fourth:

1. **Serve `dist/`.** Static assets, SPA fallback so `/logs` and `/network`
   resolve to `index.html` (the deep-link routes added under marker
   `SYMBIA_MARKER_C5_DEEPLINK_20260805` need this to survive a page reload — on
   the Vite server they work only because the dev server does the same fallback).
2. **Proxy `/svc/{id}/*` → that service's root, no path rewriting.** Identical
   semantics to the current Vite proxy, so `getServiceUrl()` output does not
   change shape. Service root, not `/api`, because `/health` lives at root.
3. **Answer `/health`, `/health/live`, `/health/ready`** like every other
   service, so `symbia_stack_health` and the compose healthcheck see it.

It does **not** hold database credentials, does not do auth logic of its own,
and does not add endpoints of its own. Anything it would compute belongs in a
service. If the console needs something no service exposes, that is a platform
defect to log, per the rule.

**The server is `createSymbiaServer` from `@symbia/http`, not plain
`node:http`.** Approved 6 Aug. It gives health endpoints, telemetry, graceful
shutdown, CORS and the relay for free — all of which a registered service is
expected to have, and all of which `service-admin` currently lacks. The
"webserver model" worth reusing from `service-admin` is the *shape* — one
origin, static + proxy, no bundler, starts with the stack — not the absence of
the shared library.

This decision propagates to step 8. `service-admin` moving to 9000 as
`ServiceId.API` should adopt `@symbia/http` on the same grounds, otherwise the
stack has ten services on the shared library and one hand-rolled server that
reports health in its own format. Its 527 lines are mostly Postgres
introspection, which is untouched by the change; what moves is the request
routing around them. **Flagged, not decided** — §8.2 already asks whether that
service should exist in its present form at all, and that question comes
first.

---

## 5. Removing Vite

### What is deleted

- `vite.config.ts`, `postcss.config.js`, `tsconfig.node.json`,
  `src/vite-env.d.ts`
- deps: `vite`, `@vitejs/plugin-react`, `postcss`, `autoprefixer`
- `.env.example` / `.env.local` in the console — `VITE_IDENTITY_URL`,
  `VITE_MESSAGING_URL`, `VITE_DEV_NO_AUTH`

### What replaces it

`scripts/build.ts`, esbuild, matching `catalog/scripts/build.ts`:

- one entry, `src/main.tsx` → `dist/app.js`, with `--watch` for the dev loop
- Tailwind via its own CLI → `dist/app.css` (no PostCSS pipeline needed)
- `index.html` copied with the script/link tags rewritten to the built names
- `tsc --noEmit` stays as the type gate, unchanged

### The blast radius, measured

```
import.meta.env.DEV      44 occurrences across 10 files
import.meta.env (any)    48 occurrences
window.location.port === '5173'   2 sites
```

Distribution: `useServices.ts` 19, `useMessaging.ts` 7, `messagingBridge.ts` 6,
`networkClient.ts` 4, `loggingStreamClient.ts` 3, one each in `App.tsx`,
`endpoints.ts`, `services.ts`, `useAuth.ts`, `assistantsClient.ts`.

esbuild does not provide `import.meta.env`. Every one of these is a compile
error the moment Vite leaves, which is the good case — none can survive
silently.

### The structural point

Most of those 44 are `if (import.meta.env.DEV) console.log(...)`, which is
noise. The load-bearing ones are the URL decisions, and those are the exact
sites this codebase has already been burned by twice:

> `config/services.ts:77` — "Do NOT gate this on `import.meta.env.DEV` —
> measured in the running page, that flag is FALSE even under `npm run dev`."
>
> `config/endpoints.ts:5` — "This file carried the SAME defect that
> `config/services.ts` was fixed for earlier today, and the fix there did not
> reach here."

Two independent implementations of one concern; the fix reached one of them.
Working discipline #7, verbatim.

**After the rebuild, that decision does not exist.** The page is served from
8000 by the server that also proxies `/svc/*`. There is no second origin and
no dev/prod branch:

```ts
export function getServiceUrl(id: string): string {
  return `/svc/${id}`;   // always. no environment detection anywhere.
}
```

That is the actual argument for this rebuild — not that Vite is unwanted, but
that a build with two modes will keep producing this defect, and a build with
one mode cannot.

`buildSocketUrl()` needs the same treatment: WebSocket and Socket.IO upgrades
must be proxied through 8000 rather than dialing `http://localhost:5005`
directly. Currently they bypass the proxy entirely. **This is the highest-risk
part of the port and should be validated in a browser first, not last.**

---

## 6. What is being ported

118 `.ts`/`.tsx` files, 32,619 lines. The structure carries over — this is a
change of what serves and builds the app, not a rewrite of it.

Four capabilities are the console, per Brian, 6 Aug. Everything else is
supporting or optional, and if the port has to be sequenced or something has to
be cut, these are the four that decide it:

> 1. Graph viewer/inspector
> 2. Log viewer/inspector
> 3. Component/catalog browsing
> 4. Native chat/LLM interface

Traced to files, because "port the log viewer" turns out to be ambiguous —
there are two of them and one is unreachable.

### 1 · Graph viewer/inspector — 2,044 lines

**There are two graph surfaces, not one, and they share no code.**

| | files | lines | shows |
|---|---|---|---|
| network topology | `panels/network/` — `NetworkGraph`, `AnimatedEdge`, `NetworkFlowNode`, `networkFlowUtils` | 1,126 | services, mesh edges, live event flow |
| routine/graph editor | `catalog/type-sections/` — `RoutineEditor`, `RoutineFlowPreview`, `routineFlowUtils`, `flow-nodes/` | 918 | a routine's steps, inside the catalog editor |

Both use `@xyflow/react` and both use `dagre`, through two independent layout
functions — `getDagreLayout()` in `networkFlowUtils.ts:79` and
`getLayoutedElements()` in `routineFlowUtils.ts:92`. One concern, two
implementations, which is discipline #7 and the reason `authMiddleware`
survived a patch. **Which of these two you mean by "graph viewer" changes the
port**, and neither is what a runtime *execution* viewer would be — nothing
here renders a graph run. Worth naming before step 6.

Services: network (5009), catalog (5003).

### 2 · Log viewer/inspector — 4,505 lines, minus one dead panel

`LogSearchPanel` (295) + `log-search/FieldSidebar` (633),
`LogResultsTable` (320), `SavedSearchesDrawer` (232), `logSearchStore` (762),
`config/logFields` (470), `loggingClient` (334), `loggingStreamClient` (785),
`LogVolumeHistogram` (109).

`panels/LogsPanel.tsx` (441 lines) is **not imported by anything**.
`DashboardPage` wires `logs` to `LogSearchPanel`. If "log viewer" means the
441-line one, it is dead code and has been un-rendered for long enough that
nobody noticed. See F10.

Services: logging (5002). **Rides on the WebSocket/SSE work in step 7.**

### 3 · Component/catalog browsing — 5,460 lines

`CatalogList` (165), `CatalogToolbar` (209), `ResourceEditor` (263),
6 `sections/` (1,124), 9 `type-sections/` (3,699 — the largest single area in
the app), `catalogEditorStore`, `@symbia/catalog-client`.

Contains Monaco, and therefore contains F8 — see below. Also contains the
routine graph editor from capability 1, so 1 and 3 overlap and should be ported
together rather than as separate steps.

Services: catalog (5003), runtime (5006).

### 4 · Native chat/LLM interface — 1,793 lines

`panels/ChatPanel` (898), `messaging/` (249 across 5 components),
`messagingBridge` (538), `assistantsClient` (469), `useMessaging` (378),
`messagingStore` (159).

`components/dashboard/ChatPanel.tsx` (215 lines) is a **second, unreachable
ChatPanel**. `DashboardPage` imports `panels/ChatPanel`. See F10.

Services: messaging (5005), assistants (5004), models (5008),
integrations (5007). **Also rides on step 7** — Socket.IO, not just SSE.

**Both 2 and 4 depend on the riskiest step in the plan.** Two of the four
capabilities that define the console ride on the one thing F6 says has never
been exercised through a proxy. That reorders the risk: step 7 is not a
late-stage detail, it is the gate on half of what Brian says the console is.

### Supporting, and not optional

- **shell** — `AppShell`, `Header`, `Sidebar`, `StatusBar`, `MainLayout`
- **auth** — `AuthGuard`, `LoginForm`, `RegisterForm`, plus the untokened
  probe in `App.tsx`, which stays as-is: it asks the service rather than
  reading a flag
- **inputs** — Symbia Script input + highlighter, JSON, operation path,
  search, time range
- **command** — `CommandPalette` (⌘K), `CommandCenter`, `CommandInput`
- **stores (7)**, **clients (10)**

### Outside the four

`OverviewPanel`, `NetworkPanel`, `AssistantsPanel`, `IntegrationsPanel`. All
reachable, all currently working as far as this document knows — which is not
far, see §13. Not proposed for cutting; recorded as not being what the console
is for.

### Dead code found while tracing this

3,877 lines — 11.9% of the app — are unreachable. Nothing imports them:

| | lines | note |
|---|---|---|
| `components/dashboard/` (7 files) | 1,287 | zero imports from anywhere. An entire earlier generation: `ControlCenter`, `ChatPanel`, `EventStream`, `LogViewer`, `ResourceBrowser`, `ServiceGrid`, `UnifiedInput` |
| `panels/ServiceObservationPanel.tsx` | 989 | not imported |
| `panels/LogsPanel.tsx` | 441 | not imported |
| 6 of 8 `charts/` | 1,160 | reachable only through `ServiceObservationPanel`, which is itself unreachable. Only `Sparkline` and `LogVolumeHistogram` are live |

Observation, not verdict: this is measured by import graph, so a component
reached by string key or dynamic import would be missed. I checked
`DashboardPage`'s panel map and `MainLayout`'s nav list, and neither reaches
them. **Recommendation: do not port dead code, and do not delete it in the same
commit either.** Move it to `archive/` alongside energy. Deleting during a port
means a missing view has two possible causes.

Logged as F10.

### Monaco

One use site: `panels/catalog/shared/JsonEditor.tsx`, the JSON editor inside
the catalog resource editor. `import Editor from '@monaco-editor/react'`.

I described this in the first draft as "its workers were Vite's job." **That was
wrong, and the way it is wrong matters.** Measured:

```
@monaco-editor/react@4.7.0  →  @monaco-editor/loader
loader/lib/cjs/config/index.js:6
  paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs' }

grep -rn "loader.config" src/   →  no matches
```

`@monaco-editor/react` does not bundle Monaco and never asked Vite to. It ships
a loader that fetches the editor from **jsdelivr at runtime**, over AMD, and
nothing in this codebase overrides that default. `monaco-editor@0.55.1` is
sitting in `node_modules` (16 MB under `min/vs`) as a peer, unused by the path
actually taken.

So the observations:

- Opening a catalog resource editor issues a cross-origin request to
  `cdn.jsdelivr.net`. On a machine with no route to the public internet, that
  editor does not load.
- The editor version in a running console is whatever jsdelivr answers with,
  resolved at page load. It is not the version in the lockfile, and no build
  artifact records it.
- Removing Vite does not cause this and does not fix it. It is true today, on
  5173, and would be equally true if nothing changed.

The inference — mine, disputable — is that this is the same shape as the rule
this project is built on: a capability entering the running system from
outside, at runtime, with no declaration and no gate. It is not a bundler
problem. It is an undeclared dependency that a bundler happened to be standing
next to.

**Resolution, approved 6 Aug** — and it gets easier rather than harder without
Vite: copy `monaco-editor/min/vs` into `dist/vendor/monaco/vs` as a build step,
serve it from the 8000 server as static assets, and pin the loader to it:

```ts
import { loader } from '@monaco-editor/react';
loader.config({ paths: { vs: '/vendor/monaco/vs' } });
```

Same origin as everything else, which also removes the cross-origin worker shim
the CDN path requires — Monaco's web workers spawn from that directory, and
same-origin workers need no shim at all. The version becomes the locked one,
and it is present in the image rather than fetched from a third party.

The vendored copy is **produced by the build, not committed** — `dist/` is a
build artifact and `monaco-editor` is already a resolved dependency, so
committing 16 MB would create a second copy that can drift from the lockfile.
`loader.config(...)` is called once at app entry, in `main.tsx`, before any
component mounts. Once, in one place: a second call site is F7 again.

Open, and a build detail rather than an architecture question: whether to trim
the copy. 16 MB is the whole distribution, including language contributions for
every language Monaco supports; JSON is the only one used here. Trimming is
worth doing and worth doing *after* the honest version loads, so that a broken
editor cannot be blamed on two changes at once.

One consequence to carry: the loader's default URL pins `monaco-editor@0.55.1`
independently of `package.json`, which requests `@monaco-editor/react` at
`^4.7.0`. Vendoring makes the installed `monaco-editor` version the one that
runs, so the two stop being able to disagree — but it also means a `npm update`
that moves Monaco now changes the editor, where previously it did not. That is
the correct direction and it should be expected rather than discovered.

**`EnergyPanel.tsx` does not come across, and is archived.** Dropped from this
pass, 6 Aug. The energy prototype is on record as not using the platform API,
and porting its panel onto the new server would carry that arrangement forward
under a rebuild whose entire argument is that capability arrives through
declared paths.

Archived, not deleted — moved to `symbia-control-center/archive/energy/`,
out of `src/` so it is not built, not type-checked against a moving codebase,
and not reachable. It comes back when energy reaches the platform through the
API, which is the condition, not a date. (No archive convention exists in this
repo today; `archive/` is a proposal. If one gets established elsewhere, this
follows it.)

Five call sites go with it — enumerated because "did it all come out" should be
answerable:

| | site | what |
|---|---|---|
| 1 | `App.tsx:137` | `'energy'` in the deep-link route array (marker `SYMBIA_MARKER_C5_DEEPLINK_20260805`) |
| 2 | `MainLayout.tsx:57` | `'energy'` in the `PanelId` union |
| 3 | `MainLayout.tsx:274` | sidebar nav entry `{ id: 'energy', label: 'Energy', icon: IconEnergy }` |
| 4 | `DashboardPage.tsx:22` | `import { EnergyPanel }` |
| 5 | `DashboardPage.tsx:29` | `energy: EnergyPanel` in the panel map |

Site 2 is the useful one: `PanelId` is a union type, so removing `'energy'`
from it turns sites 1, 3 and 5 into compile errors. The compiler finds the rest
rather than a grep. Site 4 becomes an unresolved import for the same reason.

Two things to get right anyway, because neither is type-checked: `/energy`
typed into the address bar must fall to the catch-all redirect rather than
render a blank shell, and the sidebar must not show an entry that redirects —
a nav item that goes nowhere is the "button does nothing" failure in miniature.

---

## 7. Registry changes

`symbia-sys/src/index.ts` is the single source. Every derived map — the proxy
table, the compose file, `.env.example`, the MCP server's service list — reads
from it or is generated from it.

```ts
export const ServiceId = {
  SERVER: "server",                    // reserved, 5000. Nothing listens.
  IDENTITY: "identity",
  LOGGING: "logging",
  CATALOG: "catalog",
  ASSISTANTS: "assistants",
  MESSAGING: "messaging",
  RUNTIME: "runtime",
  INTEGRATIONS: "integrations",
  MODELS: "models",
  NETWORK: "network",                  // 5054 -> 5009
  CONTROL_CENTER: "control-center",    // new, 8000
  API: "api",                          // was service-admin, unregistered, 9000
} as const;

// `SERVER` is registered but not running. Anything that enumerates the
// registry to *reach* a service filters it here and nowhere else — a second
// copy of this filter is the F2/F7 defect again.
export const RunningServices = (Object.values(ServiceId) as ServiceId[])
  .filter((id) => id !== ServiceId.SERVER);
```

`ServiceLocalEndpoints` is a second hand-maintained table that duplicates
`ServicePorts` verbatim and can drift from it. It should be derived:

```ts
export const ServiceLocalEndpoints = Object.fromEntries(
  Object.entries(ServicePorts).map(([id, p]) => [id, `http://localhost:${p}`])
);
```

---

## 8. Contradictions

Open questions, not findings. §8.1 is deferred by ruling and §8.3 is settled;
one part of §8.2 still needs an answer, and it blocks only step 8.

**1. `app.json` vs. service #10 — DEFERRED, 6 Aug. Does not block.**

Recorded so the contradiction survives being parked. The manifest declares the
console an app under `docs/APP-MODEL.md`, with `privilege.crossAppRead` and a
written justification for why an operator console cannot be isolated.
Registering it as service #10 makes it a platform peer, which that document
says an app is not. When this is picked up, the resolution is one of: amend the
manifest and withdraw `apps/control-center`; or reframe 8000 as a host that
serves app UIs, with the console as its first tenant.

Two things worth carrying forward to that conversation, because they are easy
to lose:

- `app.json` already lists the Vite dev server under `outside`, reasoning "in
  an installation the built assets are served by the platform, not by a bundler
  running on a developer's machine." This rebuild implements that sentence. The
  manifest anticipated the change even while disagreeing about what the thing
  doing it is.
- The manifest is left exactly as it is. Nothing in the rebuild edits it into
  agreement. A service shipping alongside a manifest that denies it is a
  service is an honest state and a visible one; quietly reconciling them would
  make the question harder to find later, not easier.

**2. `service-admin` at 9000 — the question was badly asked.**

Brian's answer to the previous version of this section was "I don't know?",
which is the correct response to it. I asked for a verdict on whether a service
"should exist in that form" without supplying anything to decide it with. That
is my failure, not an open question. Replaced with what is actually there and a
narrower question that can be answered.

**What it serves.** Ten routes:

| routes | what |
|---|---|
| 1 | `/` — a 96 KB single-file HTML dashboard |
| 1 | `/health` |
| 1 | `/proxy/:port/*` — generic passthrough, port in the URL (F2) |
| 7 | `/db/*` — list databases, list tables, table schema, table data, read-only SQL, per-db health |

Seven of ten routes are generic Postgres introspection. **This is a database
console, not an API front end.** The naming in the original request — "the
existing API front end on 3000" — describes the `/proxy` route, which is one
route of ten and the one that duplicates what the 8000 server will now do
properly.

**The read-only guard does not hold.** `executeQuery` requires the string to
start with `select`, then rejects it if the lowercased text *contains* any of
nine keywords. Run against realistic queries:

```
REJECTED (keyword: create)      | SELECT created_at FROM users
REJECTED (keyword: update)      | SELECT id, updated_at FROM resources
REJECTED (keyword: delete)      | SELECT deleted_at FROM logs
REJECTED (not select-prefixed)  | WITH x AS (SELECT 1) SELECT * FROM x
allowed                         | SELECT * FROM users
```

Observation: a substring denylist over SQL text rejects any query naming a
`created_at`, `updated_at` or `deleted_at` column — which is most tables in a
Drizzle schema — and rejects every CTE. Inference, mine: the guard is doing
less than it appears to and more than it should, in opposite directions.
Postgres has a real mechanism for this — a read-only transaction, or a role
granted `SELECT` and nothing else. String inspection is the "confident `0` that
means never asked" pattern applied to authorization.

**The decidable question, in three parts:**

1. **Does 9000 mean "the platform's API surface" or "the admin console's
   port"?** These are different products. If the former, `/proxy/:port/*` is
   the wrong shape for it and the DB routes do not belong on it at all. This is
   the part I most need answered.
2. **Should read-only be enforced by the database rather than by string
   matching?** This one I would answer yes without needing you, and the change
   is small: a dedicated Postgres role, or `BEGIN TRANSACTION READ ONLY`.
3. **Does the console stay hand-rolled or move to `@symbia/http`?** Only worth
   asking after 1.

Part 1 blocks step 8. Parts 2 and 3 do not block anything in this document.

**3. `symbia-control-center` is not in the repository.** I went looking for the
workspace question and found something larger underneath it. Measured:

```
.gitignore:38   symbia-control-center/     # under "# Excluded from v1.0 release"
git ls-files symbia-control-center   →  (empty)
git check-ignore -v .../src/App.tsx  →  .gitignore:38
symbia-control-center/.git           →  a separate repository, 2 commits,
                                        initial commit 2026-08-05
```

Observations:

- The main UI — 118 files, 32,619 lines — is ignored by the root repository and
  tracked by a nested one created on 5 August.
- The `.gitignore` entry carries the comment "Excluded from v1.0 release," so
  the exclusion was deliberate at the time. Whether it is still intended is not
  something the file can tell me.
- The nested repository's second commit is "declare the control center as an
  app; derive the route table" — the `app.json` and the D5 proxy fix discussed
  in §1 and §2 of this document. That work is not in the stack's history.

Checked `~/vscode` before assuming the nested repo was the only copy — there
are 30-odd Symbia directories there and it was worth ruling out that the
console lived in one of them. It does not. `symbia-control-center` appears
nowhere under `~/vscode`. **The nested repository is the only history this
code has**, and its two commits are the only record of the D5 proxy fix and
`app.json`.

Inference, mine, disputable: a service whose source is gitignored by the
repository that ships the stack cannot be built by that repository's build,
pinned by its tags, or appear in a release. The workspace question I originally
raised here — a second `node_modules`, a second `npm install`,
`DEVELOPER.md` §3's "this catches everyone" — is a symptom of this, not the
thing itself.

**RULING, 6 Aug: the exclusion does not still hold.** `symbia-control-center/`
comes out of `.gitignore:38` and into the repository. Step 1 is unblocked.

Two sub-questions remain, neither blocking:

1. **Nested history preserved, or a fresh commit?** Recommendation: preserve
   it, via `git subtree add` or a filtered fetch. The nested repo has only two
   commits, but the second one is the D5 fix and the app manifest — the
   reasoning for both is in the commit message and nowhere else. A fresh
   `git add symbia-control-center/` loses that and leaves 32,619 lines
   arriving in one undifferentiated commit.
2. **Join the root npm workspaces?** Yes, and it is low risk. Removes the
   second install tree and the "this catches everyone" step. Worth doing in
   its own commit, after the import, so that a workspace resolution problem
   is not tangled up with a history import.

One thing to watch during the import: `.gitignore:38` is a directory-level
exclusion, so nothing under it has ever been evaluated against the rest of the
root ignore file. Checked rather than assumed — the nested repo tracks 134
files, its own `.gitignore` already covers `node_modules/`, `dist/` and
`.env.local`, and `git ls-files` shows no secrets among them. An import that
carries the nested history carries those 134 files and nothing else. A fresh
`git add` from the working tree would not have that protection, which is a
second reason to prefer the subtree route.

---

## 9. Findings recorded, not fixed

Per the rule — shortcuts the platform did not resist, written down rather than
worked around.

| # | Observation | Where |
|---|---|---|
| F1 | A service runs on a port, proxies to all nine services, and holds direct DB credentials, with no entry in `ServiceId`. | `service-admin/` |
| F2 | A proxy route table is hand-maintained and keyed by port, putting port numbers in caller URLs. | `service-admin/server.js:229` |
| F3 | `ServiceId.SERVER: 5000` is registered with nothing behind it. Kept reserved by ruling, 6 Aug — so "registered" and "running" are now formally different predicates. | `symbia-sys/src/index.ts:44` |
| F4 | `ServiceLocalEndpoints` duplicates `ServicePorts` by hand; nothing prevents divergence. | `symbia-sys/src/index.ts:59` |
| F5 | The main UI is not started by either start script and is not in the workspace list — it is reachable only if a developer knows to run a bundler. | `DEVELOPER.md` §3 |
| F6 | WebSocket/Socket.IO URLs bypass the proxy and dial `localhost:PORT` directly, so they are cross-origin where HTTP is not. | `config/endpoints.ts:32` |
| F7 | The "registered but not running" filter for `SERVER` exists in exactly one consumer of the registry, inline, and is not expressed by the registry itself. Every future consumer must rediscover it. | `vite.config.ts` |
| F8 | The catalog resource editor fetches Monaco from `cdn.jsdelivr.net` at runtime. No override is set; the default in `@monaco-editor/loader` is in force. The running version is whatever the CDN answers with, and the editor does not load without a route to the public internet. | `panels/catalog/shared/JsonEditor.tsx`, `@monaco-editor/loader/lib/cjs/config/index.js:6` |
| F9 | The main UI is gitignored by the root repository and tracked by a separate nested repository created 5 Aug. 32,619 lines of the shipping product are outside the history of the thing that ships it. | `.gitignore:38`, `symbia-control-center/.git` |
| F10 | 3,877 lines (11.9%) are unreachable by import graph, including an entire superseded `components/dashboard/` directory and a second `ChatPanel`. Two of them — `LogsPanel`, `dashboard/ChatPanel` — are near-duplicates of live panels, so "the log viewer" and "the chat panel" each name two files. | §6 |

| F11 | `NODE_ENV=production` is set in the shell environment, so `npm config get omit` returns `dev` and a plain `npm install` silently removes every devDependency — vite, typescript, tailwind, `@types/*`. The install reports success. Same environment leak already documented at `config/services.ts:77` for `import.meta.env.DEV`; it eats dependencies as well as flags. | measured 6 Aug during step 1 |
| F12 | `npm run check` (`tsc --noEmit`) fails with **49 errors** and has been failing. Includes `types/catalog.ts` missing `component` and `app` from `Record<ResourceType, …>` — the console's types were never updated when commit 0867f0d added those resource types, and nothing caught it because the check was already red. | `symbia-control-center/tsc-baseline-2026-08-06.txt` |

F1–F12 are observations. Whether each is a defect is an inference, and is yours
to draw.

---

## 10. Ordered steps

Nothing here is estimated in time. Each step is checkable on its own.

All rulings needed to start are in. The app model is deferred (§8.1), and
§8.2 part 1 blocks only step 8.

1. **Import `symbia-control-center` into the repository** — drop
   `.gitignore:38`, bring the nested repo in with `git subtree` so its two
   commits survive, then join the root npm workspaces in a separate commit.
   Nothing downstream has anywhere to land until this is done.
2. **`@symbia/sys`** — add `CONTROL_CENTER` (8000), add `API` (9000), move
   `NETWORK` to 5009, keep `SERVER` reserved and export `RunningServices` so
   the not-running filter lives once, derive `ServiceLocalEndpoints`. Rebuild
   libs.
3. **Regenerate every derived port reference** from the registry —
   `docker-compose.yml`, ten `.env.example` files, `start.sh`,
   `start-local.sh`, `symbia-mcp-server`. Generated, not hand-edited; a
   hand-edit here recreates F2.
4. **`scripts/build.ts`** — esbuild + Tailwind CLI + the Monaco vendor copy,
   producing `dist/`. Verified by loading `dist/index.html` from disk before
   any server exists.
5. **`server/`** — `createSymbiaServer` on 8000: static + `/svc/*` proxy, with
   health, telemetry and shutdown coming from `@symbia/http` rather than
   written here.
6. **Delete Vite**, then fix the 44 compile errors. Each URL-deciding site
   collapses to the unconditional form; each logging site either drops or moves
   behind one explicit `DEBUG` constant.
7. **WebSocket through the proxy** — messaging and log streams. Highest risk;
   validate in a browser here, not at the end.
8. **`service-admin` → 9000**, registered as `ServiceId.API`, route table
   derived from the registry, proxy keyed by id rather than port.
9. **Compose + start scripts** — control center starts with the stack.
10. **Verification pass**, §11.

---

## 11. Verification

Browser, not curl. An API call that works while the button does nothing is the
failure being hunted, and `/health` returning 200 on 8000 says nothing about
whether the console renders.

Before anything is declared working:

- `grep` a unique source marker inside the **running** bundle — stale processes
  impersonated fixes four times on 5 Aug. Kill by **port**, not by path.
- **The four capabilities first**, in Brian's order, before anything else is
  called done: a graph rendered and inspectable; logs listed, searched and
  streaming; the catalog browsed and a resource opened in the editor; a chat
  message sent and a reply streamed back. A pass on the other panels with any
  of these four failing is not a pass.
- Every one of the 8 panels loaded in a browser, deep-linked directly (typed
  into the address bar, not navigated to), and reloaded on that URL.
- `/energy` typed directly, confirmed to redirect rather than render a broken
  panel or a blank shell, and confirmed absent from the sidebar.
- Log stream and chat observed to deliver a message over the proxied socket.
- `symbia_stack_health` returning 11/11.
- `grep -rn "import.meta.env\|5173" symbia-control-center/src` returning
  nothing.
- A catalog resource opened in the editor **with the network tab watched** —
  no request to `cdn.jsdelivr.net`, and Monaco served from `/vendor/monaco/vs`
  on the same origin. Checking that the editor merely renders would pass
  today, over the CDN, and prove nothing.

A panel not checked is recorded as **not checked**. Blank beats green.

---

## 12. Predictions

Registered before any measurement, to be reported as broken if broken.

1. The WebSocket proxy (step 7) will be the step that fails first. F6 says
   those URLs never went through a proxy, so nothing about the current
   arrangement has been exercised through one.
2. ~~Monaco under esbuild will need work beyond a config line — its workers
   were Vite's job.~~ **Broken, 6 Aug, before any code.** The premise was
   false: Vite was never bundling Monaco, and the workers were never its job.
   Reported here rather than quietly rewritten, because the failure mode is
   the interesting part — I predicted a bundler problem from the shape of the
   dependency without opening it, and the actual condition (§6, F8) is a
   runtime CDN fetch that no bundler was involved in. Replacement prediction:
   vendoring Monaco locally will be roughly a config line plus a copy step,
   and the work will land in deciding what to trim from 16 MB, not in
   making it load.
3. At least one of the 44 `import.meta.env.DEV` sites will turn out to be
   load-bearing rather than a log, and will change behaviour when it is
   removed.
4. Step 4 (regenerating port references) will miss at least one file, and it
   will be found by something failing rather than by the grep.
5. Removing the dev/prod branch will fix at least one currently-open UI bug
   that is not on any list, because both prior instances of that defect
   presented as unrelated symptoms ("3/8 healthy", "Not configured").

---

## 13. Not checked

- **`~/vscode/symbia-workbench`** — now looked at, and the original scope
  question ("port workbench capabilities into the control center") rests on a
  false premise. It is **Python**, not a React app: `server.py` (1,194 lines),
  `graph.py`, `decide.py`, `adapters.py`, `gatefuzz.py`, one hand-written
  `index.html`, serving `127.0.0.1:8788`. There is no view layer to fold in.
  What it holds is the see / understand / overcome instrument — corpus replay
  with receipts, claim scoring, the COMPUTE → RETRIEVE → GROUND → ABSTAIN gate.
  Folding that into the console is not a port; it is a decision about whether
  those become platform capabilities, and that belongs in its own document, not
  this one. **Note the port**: it uses 8788 and a second instance on 8789.
  Neither collides with 8000, but they are close enough to record.
- **`symbia-workbench/ux-findings.md`** (398 lines) exists and is the
  `symbia-ux-explorer` agent's log. **Deliberately not read into this
  document.** The project's own rule is that adversarial roles keep isolated
  context, and their value is channel isolation. Reading the explorer's
  conclusions and folding them into a design doc it will later be asked to
  evaluate is exactly the echo chamber the rule exists to prevent. It should be
  read against this document by someone other than its author, after the fact.
- **`symbia-workbench/v120-api-gap-list.md`** (157 lines) and
  **`v120-fresh-install-report.md`** (122 lines) also exist and appear to be
  shared artifacts rather than adversary-only output — the current branch is
  named `fix/2026-08-06-api-gaps`. I have not read them either, because I
  cannot tell from the outside which channel they belong to. **Your call**
  whether they are in bounds.
- **`~/vscode/symbia-chat-lab`** — not examined. The workbench README says
  `router.py`, `providers.py` and `ground.py` are reused from it unchanged.
- **`website/`** also uses Vite. Out of scope here; not addressed either way.
- **"assistant + autonomy = agent"** — raised 6 Aug, refined from a three-term
  version, and deliberately not designed in this document. It is a platform
  question, and letting a console rebuild settle it would be the wrong order.

  What is checkable now, recorded so the later conversation starts from
  measurements rather than from this paragraph:

  - `resourceTypes` is `["context", "integration", "graph", "assistant",
    "component", "app"]`. No `agent`, no `job`, no `schedule`.
  - `AssistantConfig` already carries `principalId` and
    `principalType: "assistant"` (`catalog/shared/schema.ts:172`), and the
    `entitlements` table is keyed on `principal_id`/`principal_type`. **An
    assistant is already a principal for authorization.**
  - `AppManifest.principal` is `z.string().nullable().optional()`, reserved and
    unset, with `docs/APP-MODEL.md` stating "An app does not currently act."
  - `symbia.source.timer` emits every `intervalMs` **while the execution is
    running**. It is an interval inside a live run and cannot start one.

  So the missing capability is narrower than "scheduling": it is that nothing
  initiates. The authorization half of autonomy exists; the trigger half does
  not. Brian's naming point is also recorded — `assistant` was chosen before
  the current meaning of `agent` settled, so the name is dated rather than a
  considered rejection of the term.

  **If a stub lands, it follows the `principal` pattern exactly**: reserved,
  explicitly null, documented as deferred, and read by nothing. The failure to
  avoid is a stub that defaults to something plausible — `autonomy: { enabled:
  false }` rendered by the console as "Autonomy: off" is a confident `0` that
  means "never asked," which is discipline #5 and the defect this product
  exists to prevent. **Console consequence, and the only part of this that
  belongs in this document: an unset autonomy field renders blank, never as
  "off."**
- Whether the current console actually works, panel by panel. This document
  describes a port, and deliberately does not assert what is being ported from
  is sound. The walkthrough that would establish that is a separate task and
  has not been done.
