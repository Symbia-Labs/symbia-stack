# Catalog Scripts

Convenience scripts for syncing and managing registry data in the Symbia Object Service.

All scripts expect:
- `OBJECT_SERVICE_API_KEY` (required for writes)
- `OBJECT_SERVICE_URL` (optional, defaults to `https://symbia-object-service.replit.app/api`)

## Scripts

- `build.ts`  
  Local build helper for the catalog.

- `sync-components-to-object-service.js`  
  Syncs `core/docs/component-definitions.normalized.json` into the registry.

- `sync-context-to-object-service.js`  
  Syncs `core/docs/context-definitions.normalized.json` into the registry.

- `attach-executor-artifacts.js`  
  Uploads executor artifacts from `core/components-export.json` and links them to executor resources.  
  Optional env: `OBJECT_SERVICE_ARTIFACT_MIME` (default `text/plain`).

- `normalize-registry-display-names.js`  
  Normalizes display names for components/contexts/executors and applies default executor tags.  
  Flags: `--scope components|contexts|executors|all`, `--executor-tag <tag>`, `--delay-ms <ms>`.

- `tag-registry-resources.js`  
  Applies `pack:*` and `group:*` tags across registry resources.  
  Flags: `--scope component|context|graph|executor|all`, `--delay-ms <ms>`.

- `set-bootstrap-by-pack.js`  
  Sets `isBootstrap` based on `pack:Core` (components/contexts).  
  Flags: `--include-graphs`, `--delay-ms <ms>`.

- `set-access-policy-by-pack.js`  
  Sets read access policy based on `pack:*` tags (Core/Free public, Premium gated).  
  Flags: `--scope component,context|all`, `--delay-ms <ms>`.

## Common Flags

- `--dry-run` (no writes)
- `--verbose` (extra logging)
- `--delay-ms <ms>` (rate limit buffer)

## Examples

```bash
export OBJECT_SERVICE_API_KEY="sos_..."

node catalog/scripts/sync-components-to-object-service.js
node catalog/scripts/sync-context-to-object-service.js

node catalog/scripts/normalize-registry-display-names.js --scope executors \
  --executor-tag runtime:node --executor-tag env:server

node catalog/scripts/tag-registry-resources.js

node catalog/scripts/set-bootstrap-by-pack.js
```
