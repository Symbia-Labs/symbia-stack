import { createRequire as __symbiaCreateRequire } from "node:module";globalThis.require ??= __symbiaCreateRequire(import.meta.url);

// build/plugin/symbia-imagine/vendor/symbia-seed/dist/index.js
async function seedAllServices(dbs, schemas, config = {}) {
  const { seedIdentityData } = await import("./identity-4IHMNRHI.mjs");
  const { seedMessagingData } = await import("./messaging-HXOZ3ZVW.mjs");
  const { seedAssistantsData } = await import("./assistants-R7LUYXOH.mjs");
  console.log("[SEED] Starting comprehensive seed across all services...");
  const identityResult = await seedIdentityData(dbs.identity, schemas.identity, config);
  const results = { identity: identityResult };
  if (dbs.messaging && schemas.messaging) {
    results.messaging = await seedMessagingData(dbs.messaging, schemas.messaging, config);
  }
  if (dbs.assistants && schemas.assistants) {
    results.assistants = await seedAssistantsData(dbs.assistants, schemas.assistants, config);
  }
  console.log("[SEED] \u2713 All services seeded successfully");
  return results;
}

export {
  seedAllServices
};
