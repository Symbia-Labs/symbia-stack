# Federal Payment Integrity — A Working Symbia Demo

**Audience:** CIO / CISO / Chief Data Officer
**Run:** live on imagine host `imagine:session:74af65810ab01b8d`, 2026-08-16
**Graph:** `payment-integrity-rollup` v1.0.0 — `a1509981-dd19-4665-8d05-55e6ae94f835`
**Execution:** `22e4ac33-85de-4320-94d9-7b98b0e47c1c`

---

## 1. The federal problem, in GAO's own words

For FY2025, 15 agencies reported an estimated **$186 billion** in improper payments across **64 programs** — up $24B from the prior year, with $153B (≈82%) from overpayments. Cumulative estimates since FY2003 total roughly **$3 trillion**.

Then the sentence that this demo is built around:

> "These estimates do not represent the full extent of government-wide improper payments. For instance, the $186 billion does not include certain programs that agencies have determined are susceptible to significant improper payments, such as the Department of Health and Human Services' Temporary Assistance for Needy Families."
> — GAO-26-108694, published Apr 27, 2026

**The government-wide total is a rollup with known-absent members, published as a total.** The caveat exists — in prose, in a footnote, in a report most consumers of the number will never read. The number itself travels without it.

Corroborating the same structural weakness: under PIIA 2019, IGs found that of the 24 agencies representing 99% of improper payment estimates, **half did not comply with at least one criterion** — with findings of inadequate risk assessments at five agencies and *unreliable estimates* at seven.

## 2. What was built

A nine-node graph on the live stack. The relevant node declares which programs constitute a complete government-wide estimate:

```json
{ "id": "rollup", "component": "symbia.state.rollup",
  "config": {
    "expected": ["hhs.medicaid", "hhs.medicare-ffs", "treasury.eitc",
                 "dol.unemployment-insurance", "sba.disaster-assistance", "hhs.tanf"],
    "op": "sum", "keyField": "key", "valueField": "value" } }
```

The total then flows to an arithmetic node (millions → billions), a collector, and a persisted audit log.

> Per-program dollar values below are **illustrative**, in millions. The claim under demonstration is structural, not arithmetic. Only the FY2025 aggregates in §1 are real and cited.

## 3. The observed run

Every row is an actual response from the running graph.

| # | Program reported | Total ($M) | Coverage | Missing | **Lane** |
|---|---|---|---|---|---|
| 1 | hhs.medicaid | 31,200 | 0.167 | 5 programs | `apocryphal` |
| 2 | hhs.medicare-ffs | 62,900 | 0.333 | 4 programs | `apocryphal` |
| 3 | treasury.eitc | 84,800 | 0.500 | 3 programs | `apocryphal` |
| 4 | dol.unemployment-insurance | 90,600 | 0.667 | 2 programs | `apocryphal` |
| 5 | sba.disaster-assistance | **94,000** | **0.833** | **`["hhs.tanf"]`** | **`apocryphal`** |
| 6 | hhs.tanf | 96,600 | 1.000 | `[]` | **`canonical`** |

**Row 5 is the demonstration.** $94.0B is a clean, plausible, board-ready number. Five of six programs reported. Nothing looks wrong. A human reader has no signal that anything is absent.

The platform's answer is not a warning banner or a footnote. It is that the value **is not canonical** and names `hhs.tanf` as the reason, in the value's own structure, where it travels with the number rather than beside it.

Row 6 is the same total with the gap closed — and only then does it become `canonical`.

### The receipt survives the demotion

The downstream arithmetic node is documented as emitting on the `canonical` lane with a recipe receipt. Consuming the incomplete rollup, it emitted:

```json
{ "value": { "result": 94, "expression": "94000 / 1000", "exact": true },
  "lane": "apocryphal",
  "receipt": { "kind": "recipe", "source": "symbia.compute.arithmetic",
               "recipe": { "operation": "{value} / 1000", "inputs": { "value": 94000 } } } }
```

The arithmetic is exact and fully recomputable — and the value is still apocryphal. **Correct math over an incomplete input does not launder the input.** For a CIO this is the load-bearing property: the demotion propagates through computation, so a downstream dashboard cannot quietly recover a clean number by dividing.

### The expected set is enforcement, not documentation

An out-of-set program was injected — `dhs.fema-public-assistance`, 7,500:

| Before | After |
|---|---|
| value 96,600 · coverage 1 · present 6 · `canonical` | value 96,600 · coverage 1 · present 6 · `canonical` |

Unchanged. A contributor nobody declared cannot move a canonical federal total. Had this gone the other way, the expected set would have been a comment.

## 4. Measured against predictions registered beforehand

Predictions were written into the catalog **before** any execution, and the ordering is provable from the session ledger rather than from my say-so:

| Ledger seq | Event |
|---|---|
| **1198** | Predictions P1–P5 registered |
| 1220–1236 | The six in-set injections |
| **1243** | Addendum P6–P8 registered |
| 1245 | The out-of-set injection |

| ID | Prediction | Result |
|---|---|---|
| P1 | Incomplete set ⇒ `apocryphal` | **HELD** |
| P2 | Complete set ⇒ `canonical` | **HELD** |
| P3 | `coverage` is a fraction < 1 when incomplete | **HELD** (0.833) |
| P4 | Arithmetic over apocryphal input stays apocryphal | **HELD — my expectation was wrong** |
| P5 | Every collect output carries a `lane` | **HELD** |
| P6 | Out-of-set key excluded from the sum | **HELD** |
| P7 | Lane stays `canonical` after out-of-set arrival | **HELD** |
| P8 | `present` stays 6 | **HELD** |

**I recorded P4 as the one I expected to break.** The component table declares `symbia.compute.arithmetic` out-lane as `canonical` flatly — not `inherit` — so I predicted a compute node would stamp `canonical` over an apocryphal input and launder it. It did not. The declared lane is a ceiling, not an override. I was wrong about the mechanism, and the system is stricter than its own component table reads.

**Control:** two distinct lane values (`apocryphal`, `canonical`) appeared across the runs, so the probe demonstrably distinguishes lanes. A probe reporting one lane everywhere would read identically to success on P1; it did not.

**Running-code check:** the loaded graph was re-fetched from the runtime and its `rollup.expected` array and `toBillions.expression` match what was authored. The measurements describe the code that ran.

## 5. What this does and does not establish

**Does:** that a partial total can be made structurally incapable of presenting as complete; that the demotion survives exact downstream computation; that an undeclared contributor cannot alter a canonical total; and that the ordering of prediction-before-measurement is checkable by a third party from a signed chain.

**Does not:** this ran in **imagine mode**, whose own root response says *"in-memory, ephemeral keys, restart-lossy — a sketch, not a record."* Enforcement is off — canon is checked when grounded, not here. The signing key is ephemeral. Nothing here is an ATO artifact, and a signed record of bad work would be a faithful record of bad work. The dollar figures are illustrative.

## 6. Defects found during the run

1. **Catalog dropped `content` on context creation.** Both prediction resources were created (201) but read back with no `content` field, and `/versions` returned `[]`. The predictions are provable only via the ledger's `requestDigest`, not from the catalog. For a MAP workflow that depends on registered predictions being *readable* later, this matters.
2. **Connector `operationId` collision.** `get_graphs_id_` exists in both catalog and runtime; `symbia_call` routed to catalog and returned "Graph not found" even with `service: "runtime"` passed explicitly. The `service` hint appears to be ignored when `operationId` is supplied. Verification required a direct HTTP call.
3. **`symbia_stack_health` probes the wrong path.** It reports 3/12 healthy by probing `/health`; runtime and messaging serve health at `/api/health` and return 200. `control-center` and `api` are genuinely not mounted on this host, so the "12 total" denominator overstates what this host runs.

---

**Source:** [GAO-26-108694 — Payment Integrity: Agencies' Estimated Improper Payments Increased to $186 Billion in Fiscal Year 2025](https://www.gao.gov/products/gao-26-108694)
