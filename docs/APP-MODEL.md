# What an app is

*Definition settled 6 Aug 2026. Status: design agreed, not yet implemented.*

## The problem this resolves

Two definitions of "app" already existed in the stack, and they had never met.

**Identity has an `applications` table** with full CRUD routes (`/api/projects/{id}/applications`, `/api/applications/{id}`), backing the "Organization → Project → Application → Service" hierarchy INTENT.md claims. Its columns are `environment`, `appType` (`web | mobile | api | cli`), `repoUrl` — the shape of a *developer-portal record*: information kept **about** an app. It knows nothing about graphs, components or ingresses, and it has **zero rows**. Nothing has ever created one.

**The other definition is emergent.** What makes `energy` an app today is that several catalog resources share a tag and an owning org. Nothing declares them a unit. Remove the `energy` tag and the app ceases to exist, because it never existed as a thing — only as a naming convention. That is the defect pattern this project keeps recording: *a property claimed with no mechanism to enforce it.*

The platform already has a rigorous answer for what a **capability** is — registered, manifested, gated, ledgered (Phases 0–2). An app is the missing aggregate directly above it.

## Definition

> An **app** is a registered, versioned, org-owned bundle of capabilities, which declares what it owns, which of those are public surfaces, and what it deliberately leaves outside the platform.

It is a catalog resource of type `app`, and it enters the system the same way every other capability does: an authenticated, gated, ledgered write. There is no other way to create one — no file convention, no tag, no directory.

### Three rules

1. **Every registered capability belongs to exactly one app.** Graphs, components and ingresses each carry their owning app. A resource with no app is an orphan and is reportable, not tolerated.
2. **The platform is an app.** The runtime's 16 builtin components belong to `apps/platform`. This is not a special case invented to avoid an exception — it is what makes rule 1 hold universally, and it gives the registry a complete ownership graph with no floating nodes.
3. **Ownership is declared twice and reconciled.** The app manifest lists its expected members; each resource records its owning app. Registration compares them in **both** directions and reports:
   - *declared but not registered* — an incomplete install
   - *registered but unclaimed* — a resource that entered outside its app

   This mirrors the method already used for the API validation report, which checked advertised→implemented **and** implemented→advertised. One direction alone cannot distinguish an incomplete app from a smaller one.

## Manifest

```jsonc
{
  "symbia": "app/1.0",
  "key": "apps/energy",
  "name": "Symbia Energy",
  "version": "2.0.0",
  "orgId": "2c29d1dd-…",
  "description": "Data-centre energy monitoring. A forcing function for the platform, not a product.",

  // Expected members. Reconciled against what each resource claims.
  "owns": {
    "graphs":     ["graphs/energy-pipeline", "energy.graph.ingest", "energy.graph.pue"],
    "components": [],
    "ingresses":  ["ingress/energy-pipeline"]
  },

  // What this app exposes. Everything else it owns is internal.
  "surfaces": {
    "ingress": ["ingress/energy-pipeline"],
    "metrics": ["energy.v2.facility_kw", "energy.v2.it_kw", "energy.v2.pue"]
  },

  // Named, with reasons. An app that cannot say what it left outside has not
  // drawn a boundary; it has just stopped writing things down.
  "outside": [
    { "what": "energy/sim", "why": "a real data centre is not a Symbia component, so its twin should not be one either" }
  ],

  // Reserved. See "Deferred: the app as principal".
  "principal": null
}
```

`surfaces` is the load-bearing field. It is the difference between "these resources exist together" and "this is what the app offers" — and it is what a consumer, a UI, or the Phase 4 topology derivation reads.

## Lifecycle

| Action | Meaning |
|---|---|
| **register** | Create the `app` resource. Members may not exist yet; reconciliation reports them as declared-but-missing. |
| **publish** | Mark the app usable. Its standing graphs hydrate and stand up as they do today. |
| **upgrade** | Register a new version. Members change by re-registering the member resources; reconciliation converges the difference. |
| **unpublish** | Stop standing up its graphs. Owned resources remain registered; operator state is retained. |
| **uninstall** | Remove the app and every resource it owns. |

**Uninstall does not delete derived data.** Metrics the app persisted survive it, in the org that owns them. A series is a record of something that happened; removing the app that produced it does not un-happen it. This also means an uninstall/reinstall cycle does not silently orphan the history — the series simply predate the current install, and the operator can see that.

## Deferred: the app as principal

An app does **not** currently act. Its graphs execute as the runtime's system identity, and its ingress is authorised by *membership of the owning org* (Phase 2).

That gate is coarse and known to be so. Both `energy` and `order-margin` are owned by the same org, so today either app's owner can deliver to the other's ingress. Org is the **tenant** boundary; it is not the **app** boundary.

The intended resolution is to make an app a principal: graphs execute *as the app*, derived metrics are attributed to it, and its ingress is gated by capabilities the app holds. The `principal` field exists in the manifest now, unset, so the model does not need rewriting when that lands. It is deliberately not in scope for the first implementation — it touches Identity, and the bundle is useful without it.

## What this makes possible

- **Phase 4 becomes tractable.** Deriving the service/proxy route table from the registry (D5) requires knowing which surfaces exist and who owns them. `surfaces` is exactly that input. Right now the route table is hand-maintained, including the `energy: 5010` entry pointing at a service that was deleted on 6 Aug.
- **The 227-point data model gets an owner.** D2 deferred the `point` resource type partly because it was unclear what a point would belong to. It belongs to an app.
- **Generality becomes checkable.** With apps declared, "does the platform assume its test case" stops being a judgement call and becomes a query: does any `apps/platform` resource mention vocabulary owned by another app? The 6 Aug audit found exactly that leak by hand — `symbia.state.join`'s published manifest documenting itself with `dc1.elec.utility.main.kw`.

## Open questions

1. **Does Identity's `applications` table get repurposed or removed?** It is unused and portal-shaped. Repurposing it as the deployment/environment record for a catalog app is coherent (`apps/energy` in `production`); so is deleting it as an unimplemented claim. Not decided.
2. **Can an app depend on another app?** Nothing needs it yet. Adding `requires` later is easy; getting the semantics wrong now is not.
3. **Where does a UI surface live?** `EnergyPanel.tsx` is part of the energy app by any reasonable reading, but it is a control-center file, and the control center is gitignored. Unresolved.
4. **Config and secrets.** An app will need per-environment configuration. Identity already has an encrypted credential vault; the join between them is unspecified.
