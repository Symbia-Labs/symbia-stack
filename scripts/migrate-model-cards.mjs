/**
 * Migrate model cards to the stage-5 shape: a GATED CATALOG WRITE, per the
 * §6.1 ruling — never a bootstrap-file edit.
 *
 *   old: integrations/<provider>/models/<id>   type=integration
 *   new: models/<publisher>/<id>               type=model
 *
 * Publisher comes from the card's own metadata.source.repo when present,
 * else `local`. Selection is deliberately narrow (a migration that can
 * touch an unrelated row is worse than no migration): key must match the
 * old shape AND metadata.provider must equal the models service's provider
 * name.
 *
 * Dry-run by default. `--apply` performs POST-new + DELETE-old, and stops
 * on the first failure rather than continuing past it. Requires a catalog
 * built on or after 15 Aug 2026 (type "model" in the enum) — an older one
 * rejects the POST with a validation error, which this script reports and
 * does NOT work around.
 *
 * Usage:
 *   node scripts/migrate-model-cards.mjs                # report only
 *   node scripts/migrate-model-cards.mjs --apply
 *   CATALOG_URL=http://localhost:5003 PROVIDER=symbia-labs ...
 */
const CATALOG = process.env.CATALOG_URL || "http://localhost:5003";
const PROVIDER = process.env.PROVIDER || "symbia-labs";
const APPLY = process.argv.includes("--apply");
const HEADERS = { "X-Service-Auth": "internal", "Content-Type": "application/json" };

const oldShape = new RegExp(`^integrations/${PROVIDER}/models/([a-z0-9-]+)$`);

const rows = await (await fetch(`${CATALOG}/api/resources`, { headers: HEADERS })).json();
if (!Array.isArray(rows)) {
  console.error("catalog did not return a resource list:", JSON.stringify(rows).slice(0, 200));
  process.exit(1);
}

const candidates = rows.filter(
  (r) => oldShape.test(r.key) && r.metadata?.provider === PROVIDER
);
console.log(`${candidates.length} card(s) in the old shape (of ${rows.length} resources)`);

for (const row of candidates) {
  const id = row.key.match(oldShape)[1];
  const repoOwner = row.metadata?.source?.repo?.split("/")[0];
  const publisher = repoOwner
    ? repoOwner.toLowerCase().replace(/[^a-z0-9._-]/g, "-")
    : "local";
  const newKey = `models/${publisher}/${id}`;

  const collision = rows.find((r) => r.key === newKey);
  if (collision) {
    console.log(`SKIP  ${row.key} -> ${newKey} (target key already exists)`);
    continue;
  }

  console.log(`${APPLY ? "MOVE" : "would move"}  ${row.key} -> ${newKey}`);
  if (!APPLY) continue;

  const created = await fetch(`${CATALOG}/api/resources`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      key: newKey,
      name: row.name,
      description: row.description ?? undefined,
      type: "model",
      status: row.status,
      isBootstrap: false,
      tags: (row.tags ?? []).filter((t) => t !== "model" && t !== "local").concat(publisher === "local" ? ["local"] : [publisher]),
      metadata: row.metadata,
      accessPolicy: row.accessPolicy ?? undefined,
    }),
  });
  if (!created.ok) {
    console.error(`FAILED to create ${newKey}: ${created.status} ${(await created.text()).slice(0, 200)}`);
    console.error("stopping — nothing has been deleted for this row");
    process.exit(1);
  }
  const deleted = await fetch(`${CATALOG}/api/resources/${row.id}`, {
    method: "DELETE",
    headers: HEADERS,
  });
  if (!deleted.ok) {
    console.error(`created ${newKey} but FAILED to delete old row ${row.id}: ${deleted.status} — remove it by hand and re-run`);
    process.exit(1);
  }
  console.log(`  moved (new row created, old ${row.id} deleted)`);
}

console.log(APPLY ? "done" : "dry run — re-run with --apply to write");
