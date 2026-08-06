# Examples

Worked examples that exercise the platform through its public API, in domains
deliberately unrelated to each other.

## Why this directory exists

`energy/` is a **forcing function, not the product**. It was built to find out
what the platform could not do, and its defect ledger
([`energy/API-MEASUREMENTS.md`](../energy/API-MEASUREMENTS.md)) is the real
deliverable of that exercise. But a single exercising application creates a
standing risk: the platform quietly grows the shape of its only test case, and
nobody notices because the only thing that runs on it is the thing it grew
around.

That had already started. Two examples caught in the 6 Aug 2026 audit:

- `symbia.state.join`'s published manifest — the contract every consumer of the
  platform reads — documented its `config.select` with
  `{"facility_kw": "dc1.elec.utility.main.kw"}`. A general-purpose stream
  operator was describing itself in data-centre electrical vocabulary.
- `symbia.state.latest`, `.join` and `.rollup` all defaulted `config.keyField`
  to `"point"` — a term from telemetry historians. Any graph in any other
  domain inherited a default named after the test case's world, and the energy
  graphs relied on that default rather than declaring their own vocabulary.

Both are fixed: the default is now `"key"`, and `energy-pipeline` declares
`"keyField": "point"` explicitly, because a domain's vocabulary belongs to the
application, not to the engine.

## The examples

| Graph | Domain | What it shows |
|---|---|---|
| [`graphs/order-margin.graph.json`](graphs/order-margin.graph.json) | commerce | The same registration → hydration → gated ingress → durable state → metric sink path the energy pipeline uses, with no energy vocabulary anywhere. Uses the default `keyField`, so it also demonstrates that the neutral default is usable as-is. |

## Running one

Graphs enter the platform by registration, never by being placed in a
directory. The runtime hydrates published graphs from the catalog and stands up
those declaring `role: pipeline`.

```bash
# Register (the org owns the graph, authorises its ingress, and owns the
# metrics it derives)
node scripts/register-graph.mjs examples/graphs/order-margin.graph.json \
  --role pipeline --org "$YOUR_ORG_ID"

# Deliver. One POST; the engine owns hydration, lifecycle and dispatch.
curl -X POST http://localhost:5006/api/ingress/order-margin \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '[{"key":"orders.revenue","value":1000},
       {"key":"orders.fulfilment_cost","value":420}]'
```

The join completes once both keys have been seen, margin is derived
`(1000 - 420) / 1000 = 0.58`, and both series are written to the Logging
service under the owning org.

## Adding an example

Prefer a domain nothing else in the repo uses. The value of an example here is
proportional to how little it resembles the others — an example that shares the
energy pipeline's vocabulary tests almost nothing that energy does not already
test.
