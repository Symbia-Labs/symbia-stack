# What an app is

*Definition settled 6 Aug 2026 (Brian). Status: design agreed, not implemented.*

## Definition

> An **app** is a declared, versioned bundle of configuration and customization over the bare platform. It is built to solve one problem, published to a catalog, shared, and deployed onto any Symbia stack — where it always executes within the Symbia runtime network. It never runs standalone.

The genesis it has to support: someone starts with the bare platform, wants to solve a problem, and begins. Over time configuration and customization accumulate. Eventually it works as a solution — and at that point it must be able to leave the machine it grew on.

## What an app is not

**The platform is not an app.** An earlier draft of this document made the platform an app — `apps/platform` owning the 16 builtin components — so that "every capability belongs to exactly one app" would hold without exception. That was formal tidiness bought at the cost of a real distinction. The platform is the *substrate an app is built on*, not a peer of it. Rejected.

**An app is not an org.** An org is a tenant. Both `energy` and `order-margin` are owned by the same org today, which is the whole reason they are not isolated from each other.

**An app is not a directory or a tag.** What currently makes `energy` an app is that some resources share a tag. Remove the tag and the app ceases to exist, because it never existed — the familiar defect: *a property claimed with no mechanism.*

## Two tiers

| tier | what | owner |
|---|---|---|
| **platform** | ships with the stack: the 16 builtin components, the services, the execution model | nobody — it is substrate |
| **app layer** | graphs, ingresses, app-supplied components, configuration, data models | exactly one app |

A registered app-layer capability with no owning app is a **defect**, not a category. Under declare-first (below) there is no legitimate path to creating one.

## App vs. installation

This distinction is load-bearing and follows directly from portability.

- The **app** is the artifact: versioned, immutable once published, shareable, deployable many times. `energy@2.0.0`.
- The **installation** is one deployment of that artifact into an org on a particular stack. `energy@2.0.0` installed in org `2c29d1dd…`.

Everything that is *specific to running* belongs to the installation, never the artifact:

| belongs to the app | belongs to the installation |
|---|---|
| graph definitions | running executions |
| component manifests | operator state |
| ingress declarations | derived metric series |
| config **schema** | config **values** and secrets |
| required platform capabilities | the org, and who may deliver to its ingresses |

Getting this wrong is how an app stops being portable: bake an org id or a metric namespace into the artifact and it can only ever be installed once, in one place.

## Manifest

```jsonc
{
  "symbia": "app/1.0",
  "key": "apps/energy",
  "name": "Symbia Energy",
  "version": "2.0.0",
  "description": "Data-centre energy monitoring.",

  // What the platform must provide for this app to install at all. Checked at
  // install time, refused if unmet — the same shape as load-time component
  // manifest resolution (Phase 1), applied to whole apps.
  "requires": {
    "platform": ">=1.1.0",
    "components": [
      "symbia.io.passthrough@^1.2.0",
      "symbia.logic.filter@^1.2.0",
      "symbia.state.join@^1.2.0",
      "symbia.compute.arithmetic@^1.2.0",
      "symbia.sink.metric@^1.2.0",
      "symbia.sink.log@^1.2.0",
      "symbia.io.collect@^1.2.0"
    ]
  },

  // Everything the app carries. Definitions travel, not references — an
  // artifact that only points at things cannot be deployed anywhere else.
  "provides": {
    "graphs":     ["energy-pipeline", "energy-ingest", "energy-pue"],
    "components": [],
    "ingresses":  ["energy-pipeline"]
  },

  // What the app exposes once installed. Everything else it carries is internal.
  "surfaces": {
    "ingress": ["energy-pipeline"],
    "metrics": ["energy.v2.facility_kw", "energy.v2.it_kw", "energy.v2.pue"]
  },

  // Schema only. Values are supplied per installation.
  "config": {
    "site": { "type": "string", "required": true, "description": "Site identifier used to label derived series" }
  },

  // Named, with reasons. An app that cannot say what it left outside has not
  // drawn a boundary — it has just stopped writing things down.
  "outside": [
    { "what": "the site simulator", "why": "a real data centre is not a Symbia component, so its twin should not be one either" }
  ],

  // Reserved. Apps do not yet act; see below.
  "principal": null
}
```

## Lifecycle

**Declare first, then build into it.** You register the app before you know whether the problem is solvable. Every app-layer resource you create afterwards is created against it, so ownership is correct from the first write rather than reconstructed later.

| step | meaning |
|---|---|
| **declare** | Register an empty `app` resource. Gated and ledgered like any other capability. |
| **build** | Create graphs, components and ingresses against it. Each records its owning app. |
| **publish** | Freeze a version as a shareable artifact. Immutable thereafter; changes require a new version. |
| **share** | The artifact goes to a catalog others can install from. |
| **install** | Deploy into an org on some stack. `requires` is checked and refused if unmet. Config values supplied here. |
| **upgrade** | Install a newer version over an existing installation. |
| **uninstall** | Remove the installation and the resources it created. |

**Uninstall does not delete derived data.** Metrics the installation persisted survive it, in the org that owns them. A series records something that happened; removing the app that produced it does not un-happen it.

## Isolation

"It needs to run in isolation" means **deployable in isolation**, not executed in isolation. The app is a self-contained artifact that can be installed onto a fresh stack and reproduce itself. It always executes inside the Symbia runtime network — there is no standalone mode.

That requires, concretely:

1. **Definitions travel, references do not.** An export containing `"graph": "graphs/energy-pipeline"` is useless on another stack. It must carry the definition.
2. **No installation-specific values in the artifact.** No org ids, no absolute endpoints, no secrets.
3. **Declared platform requirements.** An app that silently assumes `symbia.state.join` defaults to `keyField: "point"` breaks on a stack where it does not — which is exactly what happened on 6 Aug when that default was corrected to `"key"`, and `energy-pipeline` derived `null` until re-registered. `requires` makes that assumption explicit and checkable at install time instead of a silent wrong answer at runtime.
4. **Surfaces belong to their installation.** Today both energy and order-margin are owned by one org, so either owner can deliver into the other's ingress. They are provably not isolated. Fixing this is what the app-as-principal work is for.

## Deferred: the app as principal

An app does not currently act. Its graphs execute as the runtime's system identity, and its ingress is authorised by *membership of the owning org* (Phase 2) — which cannot separate two apps in the same org.

The intended resolution: an installation is a principal. Its graphs execute as it, derived metrics are attributed to it, and its ingresses are gated by capabilities it holds rather than by org membership. The `principal` field is reserved and unset so the model does not need rewriting when that lands. Out of scope for the first implementation — it touches Identity, and the bundle is useful without it.

## Energy is a retrofit

Energy predates this model: it was built by accretion and never declared. It is the one legitimate exception — a one-off migration that declares `apps/energy` and claims the resources that already exist. That is a migration, not a general capability. Declare-first means there is no supported path for producing unclaimed app-layer resources going forward, and any that appear are a defect to be reported.

`order-margin` should be declared properly from the start, as the first app that follows the model.

## What this makes possible

- **Phase 4 (D5).** Deriving the service/proxy route table from the registry needs to know which surfaces exist and who owns them. `surfaces` is that input. The table is currently hand-maintained and still contains `energy: 5010`, pointing at a service deleted on 6 Aug.
- **The 227-point data model gets an owner.** D2 deferred the `point` resource type partly because it was unclear what a point would belong to. It belongs to an app.
- **Generality becomes checkable.** "Does the platform assume its test case" stops being a judgement call and becomes a query: does any platform-tier capability mention vocabulary owned by an app? The 6 Aug audit found exactly that leak by hand — `symbia.state.join`'s published manifest documenting itself with `dc1.elec.utility.main.kw`.

## Open questions

1. **Identity's `applications` table.** It exists with full CRUD, zero rows, and portal-shaped columns (`repoUrl`, `appType`, `environment`). It maps far better to *installation* than to *app*. Repurpose or remove — not decided.
2. **Where does a UI surface live?** `EnergyPanel.tsx` is part of the energy app by any reading, but it is a control-center file and the control center is gitignored. An app that carries UI needs a place to carry it.
3. **Can an app require another app?** Nothing needs it yet. Adding `requires.apps` later is easy; getting the semantics wrong now is not.
4. **Config and secrets at install time.** Identity has an encrypted credential vault; the join between installation config and that vault is unspecified.
5. **Export format.** A directory, a signed archive, or a catalog-native bundle. The catalog already has artifacts, signatures and certifications — likely the answer, but unexamined.
