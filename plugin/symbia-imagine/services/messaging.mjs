var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../../messaging/server/src/config.ts
import dotenv from "dotenv";
import { resolveServicePort, resolveServiceUrl, ServiceId } from "@symbia/sys";
var config;
var init_config = __esm({
  "../../messaging/server/src/config.ts"() {
    "use strict";
    dotenv.config();
    config = {
      port: resolveServicePort(ServiceId.MESSAGING),
      databaseUrl: process.env.DATABASE_URL || "",
      identityServiceUrl: resolveServiceUrl(ServiceId.IDENTITY),
      serviceId: process.env.SERVICE_ID || ServiceId.MESSAGING,
      serviceName: process.env.SERVICE_NAME || "Symbia Messaging",
      corsOrigins: (process.env.CORS_ALLOWED_ORIGINS || process.env.CORS_ORIGINS || "*").split(",").map((origin) => origin.trim().replace(/\/$/, "")).filter(Boolean),
      assistantsWebhookUrl: process.env.ASSISTANTS_WEBHOOK_URL || `${resolveServiceUrl(ServiceId.ASSISTANTS)}/api/webhook/messaging`,
      // Rate limiting (disabled by default)
      rateLimitEnabled: process.env.RATE_LIMIT_ENABLED === "true",
      rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10),
      rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100", 10),
      // Timeout configurations
      // Increased webhook timeout to 60s to allow complex assistant processing
      webhookTimeoutMs: parseInt(process.env.WEBHOOK_TIMEOUT_MS || "60000", 10),
      httpRequestTimeoutMs: parseInt(process.env.HTTP_REQUEST_TIMEOUT_MS || "120000", 10),
      // Socket.IO ping configuration
      // pingTimeout should be ~2x pingInterval to handle network jitter
      // pingInterval: How often to send ping packets (25s)
      // pingTimeout: How long to wait for pong before disconnect (60s = 2.4x interval)
      socketPingTimeoutMs: parseInt(process.env.SOCKET_PING_TIMEOUT_MS || "60000", 10),
      socketPingIntervalMs: parseInt(process.env.SOCKET_PING_INTERVAL_MS || "25000", 10)
    };
  }
});

// ../../messaging/server/src/database.ts
import pg from "pg";
import { randomUUID } from "crypto";
import { newDb, DataType } from "pg-mem";
import { attachRLSPoolWrapper } from "@symbia/db";
async function initDatabase() {
  const client = await pool.connect();
  try {
    if (!USE_MEMORY_DB) {
      await client.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    }
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        type VARCHAR(20) NOT NULL CHECK (type IN ('private', 'group')),
        name VARCHAR(255),
        description TEXT,
        org_id VARCHAR(255),
        created_by VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        metadata JSONB DEFAULT '{}'::jsonb
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS participants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        user_id VARCHAR(255) NOT NULL,
        user_type VARCHAR(20) DEFAULT 'user' CHECK (user_type IN ('user', 'agent')),
        role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
        entity_id VARCHAR(255),
        joined_at TIMESTAMP DEFAULT NOW(),
        last_read_at TIMESTAMP,
        UNIQUE(conversation_id, user_id)
      )
    `);
    await client.query(`ALTER TABLE participants ADD COLUMN IF NOT EXISTS entity_id VARCHAR(255)`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        sender_id VARCHAR(255) NOT NULL,
        sender_type VARCHAR(20) DEFAULT 'user',
        content TEXT NOT NULL,
        content_type VARCHAR(50) DEFAULT 'text',
        reply_to UUID REFERENCES messages(id),
        org_id VARCHAR(255),
        run_id UUID,
        trace_id VARCHAR(255),
        sequence BIGINT,
        priority VARCHAR(20) DEFAULT 'normal',
        interruptible BOOLEAN DEFAULT true,
        preempted_by UUID,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP,
        deleted_at TIMESTAMP,
        metadata JSONB DEFAULT '{}'::jsonb
      )
    `);
    await client.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS org_id VARCHAR(255)`);
    await client.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS run_id UUID`);
    await client.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS trace_id VARCHAR(255)`);
    await client.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS sequence BIGINT`);
    await client.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'normal'`);
    await client.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS interruptible BOOLEAN DEFAULT true`);
    await client.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS preempted_by UUID`);
    await client.query(`ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_type_check`);
    await client.query(`ALTER TABLE messages ADD CONSTRAINT messages_sender_type_check CHECK (sender_type IN ('user', 'agent', 'service', 'bot'))`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_participants_conversation ON participants(conversation_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_participants_user ON participants(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_participants_entity ON participants(entity_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(conversation_id, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_messages_sequence ON messages(conversation_id, sequence)`);
    if (USE_MEMORY_DB) {
      const conversationsResult = await client.query("SELECT COUNT(*) as count FROM conversations");
      const conversationCount = parseInt(conversationsResult.rows[0].count);
      if (conversationCount === 0) {
        console.log("Seeding messaging test data...");
        await client.query(`
          INSERT INTO conversations (id, type, name, org_id, created_by, created_at, updated_at)
          VALUES
            ('a50e8400-e29b-41d4-a716-446655440000', 'group', 'Welcome to Symbia', '550e8400-e29b-41d4-a716-446655440000', '650e8400-e29b-41d4-a716-446655440000', NOW() - INTERVAL '60 minutes', NOW()),
            ('a50e8400-e29b-41d4-a716-446655440001', 'group', 'Support Request', '550e8400-e29b-41d4-a716-446655440001', '650e8400-e29b-41d4-a716-446655440002', NOW() - INTERVAL '30 minutes', NOW()),
            ('a50e8400-e29b-41d4-a716-446655440002', 'group', 'Project Planning', '550e8400-e29b-41d4-a716-446655440000', '650e8400-e29b-41d4-a716-446655440001', NOW() - INTERVAL '15 minutes', NOW())
        `);
        await client.query(`
          INSERT INTO participants (conversation_id, user_id, user_type, role, joined_at)
          VALUES
            ('a50e8400-e29b-41d4-a716-446655440000', '650e8400-e29b-41d4-a716-446655440000', 'user', 'owner', NOW() - INTERVAL '60 minutes'),
            ('a50e8400-e29b-41d4-a716-446655440000', 'dev-user', 'user', 'member', NOW() - INTERVAL '60 minutes'),
            ('a50e8400-e29b-41d4-a716-446655440001', '650e8400-e29b-41d4-a716-446655440000', 'user', 'member', NOW() - INTERVAL '30 minutes'),
            ('a50e8400-e29b-41d4-a716-446655440001', 'dev-user', 'user', 'member', NOW() - INTERVAL '30 minutes'),
            ('a50e8400-e29b-41d4-a716-446655440002', '650e8400-e29b-41d4-a716-446655440000', 'user', 'owner', NOW() - INTERVAL '15 minutes'),
            ('a50e8400-e29b-41d4-a716-446655440002', 'dev-user', 'user', 'member', NOW() - INTERVAL '15 minutes')
        `);
        await client.query(`
          INSERT INTO messages (conversation_id, sender_id, sender_type, content, created_at)
          VALUES
            ('a50e8400-e29b-41d4-a716-446655440000', '650e8400-e29b-41d4-a716-446655440000', 'user', 'Welcome to Symbia! This is our collaboration platform.', NOW() - INTERVAL '55 minutes'),
            ('a50e8400-e29b-41d4-a716-446655440000', 'dev-user', 'user', 'Thanks! Excited to get started.', NOW() - INTERVAL '50 minutes'),
            ('a50e8400-e29b-41d4-a716-446655440001', '650e8400-e29b-41d4-a716-446655440000', 'user', 'How can I help you today?', NOW() - INTERVAL '25 minutes'),
            ('a50e8400-e29b-41d4-a716-446655440002', '650e8400-e29b-41d4-a716-446655440000', 'user', 'Lets discuss the project timeline.', NOW() - INTERVAL '10 minutes')
        `);
        console.log("\u2713 Messaging test data seeded (3 conversations, 6 participants, 4 messages)");
      }
    }
    console.log("Database initialized successfully");
  } finally {
    client.release();
  }
}
var Pool, USE_MEMORY_DB, pool, memDb;
var init_database = __esm({
  "../../messaging/server/src/database.ts"() {
    "use strict";
    init_config();
    ({ Pool } = pg);
    USE_MEMORY_DB = process.env.MESSAGING_USE_MEMORY_DB === "true" || !config.databaseUrl;
    memDb = null;
    if (USE_MEMORY_DB) {
      memDb = newDb({ autoCreateForeignKeyIndices: true });
      const mem = memDb;
      mem.public.registerFunction({
        name: "gen_random_uuid",
        returns: DataType.uuid,
        impure: true,
        implementation: () => randomUUID()
      });
      mem.public.registerFunction({
        name: "uuid_generate_v4",
        returns: DataType.uuid,
        impure: true,
        implementation: () => randomUUID()
      });
      mem.public.registerFunction({
        name: "now",
        returns: DataType.timestamptz,
        impure: true,
        implementation: () => /* @__PURE__ */ new Date()
      });
      const adapter = mem.adapters.createPg();
      pool = new adapter.Pool();
      console.log("[DB] Using in-memory database (pg-mem).");
    } else {
      pool = new Pool({
        connectionString: config.databaseUrl
      });
      pool.on("error", (err) => {
        console.error(
          `[messaging] Postgres pool error (backend gone away?): ${err.message}. Continuing; new connections will be attempted on next query.`
        );
      });
      attachRLSPoolWrapper(pool);
    }
  }
});

// ../../messaging/server/src/models/conversation.ts
var conversation_exports = {};
__export(conversation_exports, {
  ConversationModel: () => ConversationModel
});
var ConversationModel;
var init_conversation = __esm({
  "../../messaging/server/src/models/conversation.ts"() {
    "use strict";
    init_database();
    ConversationModel = {
      async create(input) {
        const result = await pool.query(
          `INSERT INTO conversations (type, name, description, org_id, created_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
          [input.type, input.name, input.description, input.orgId, input.createdBy, input.metadata || {}]
        );
        return result.rows[0];
      },
      async getById(id) {
        const result = await pool.query("SELECT * FROM conversations WHERE id = $1", [id]);
        return result.rows[0] || null;
      },
      async listForUser(userId, orgId) {
        if (orgId) {
          const result2 = await pool.query(
            `SELECT c.* FROM conversations c
         JOIN participants p ON c.id = p.conversation_id
         WHERE p.user_id = $1 AND (c.org_id = $2 OR c.org_id IS NULL)
         ORDER BY c.updated_at DESC`,
            [userId, orgId]
          );
          return result2.rows;
        }
        const result = await pool.query(
          `SELECT c.* FROM conversations c
       JOIN participants p ON c.id = p.conversation_id
       WHERE p.user_id = $1
       ORDER BY c.updated_at DESC`,
          [userId]
        );
        return result.rows;
      },
      async update(id, updates) {
        const fields = [];
        const values = [];
        let idx = 1;
        if (updates.name !== void 0) {
          fields.push(`name = $${idx++}`);
          values.push(updates.name);
        }
        if (updates.description !== void 0) {
          fields.push(`description = $${idx++}`);
          values.push(updates.description);
        }
        if (updates.metadata !== void 0) {
          fields.push(`metadata = $${idx++}`);
          values.push(updates.metadata);
        }
        if (fields.length === 0) {
          return this.getById(id);
        }
        values.push(id);
        const result = await pool.query(
          `UPDATE conversations SET ${fields.join(", ")}, updated_at = NOW()
       WHERE id = $${idx} RETURNING *`,
          values
        );
        return result.rows[0] || null;
      },
      async delete(id) {
        const result = await pool.query("DELETE FROM conversations WHERE id = $1", [id]);
        return (result.rowCount ?? 0) > 0;
      },
      /**
       * Find a conversation by channel metadata
       * Used by the channel bridge to find existing conversations for channel chats
       */
      async findByChannelMetadata(channelType, connectionId, chatId) {
        const result = await pool.query(
          `SELECT * FROM conversations
       WHERE metadata->'channel'->>'type' = $1
         AND metadata->'channel'->>'connectionId' = $2
         AND metadata->'channel'->>'chatId' = $3
       LIMIT 1`,
          [channelType, connectionId, chatId]
        );
        return result.rows[0] || null;
      }
    };
  }
});

// ../../messaging/server/src/routes.ts
init_config();
init_database();
import express from "express";
import path from "path";

// ../../messaging/server/src/auth.ts
init_config();
import {
  createAuthMiddleware,
  isOrgAdmin,
  isOrgMember
} from "@symbia/auth";
import { runWithRLSContext } from "@symbia/db";
var auth = createAuthMiddleware({
  identityServiceUrl: config.identityServiceUrl,
  adminEntitlements: ["messaging:admin", "collaborate:admin"],
  enableImpersonation: true,
  logger: (level, message) => console.log(`[Auth] ${message}`),
  onAuthenticated: (req, _res, next) => {
    const user = req.user;
    if (!user) {
      next();
      return;
    }
    const headerOrg = req.headers["x-org-id"];
    const isMember = (o) => user.organizations?.some((m) => m.id === o);
    const orgId = typeof headerOrg === "string" && (user.isSuperAdmin || isMember(headerOrg)) ? headerOrg : user.orgId || user.organizations?.[0]?.id || "";
    runWithRLSContext(
      {
        orgId,
        userId: user.id,
        isSuperAdmin: user.isSuperAdmin,
        capabilities: user.entitlements || [],
        serviceId: "messaging"
      },
      () => next()
    );
  }
});
var {
  getCurrentUser,
  requireAuth,
  optionalAuth,
  requireAdmin,
  requireSuperAdmin,
  authClient
} = auth;
var introspectToken = authClient.introspectToken;
var verifyApiKey = authClient.verifyApiKey;
var verifySessionCookie = authClient.verifySessionCookie;
var buildIdentityUrl = authClient.buildIdentityUrl;

// ../../messaging/server/src/routes/auth.ts
import { Router } from "express";
var router = Router();
router.post("/login", async (req, res) => {
  try {
    const response = await fetch(buildIdentityUrl("/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(req.body || {})
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      res.setHeader("set-cookie", setCookie);
    }
    const text = await response.text();
    res.status(response.status);
    if (response.headers.get("content-type")?.includes("application/json")) {
      res.type("application/json").send(text);
      return;
    }
    res.send(text);
  } catch (error) {
    console.error("Login proxy failed:", error);
    res.status(502).json({ error: "Identity service unavailable" });
  }
});
router.post("/logout", async (req, res) => {
  try {
    const response = await fetch(buildIdentityUrl("/auth/logout"), {
      method: "POST",
      headers: {
        "Cookie": req.headers.cookie || ""
      }
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      res.setHeader("set-cookie", setCookie);
    }
    const text = await response.text();
    res.status(response.status);
    if (text) {
      res.send(text);
      return;
    }
    res.json({ ok: response.ok });
  } catch (error) {
    console.error("Logout proxy failed:", error);
    res.status(502).json({ error: "Identity service unavailable" });
  }
});
router.get("/session", async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      res.json({ authenticated: false });
      return;
    }
    res.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        type: user.type,
        orgId: user.orgId,
        organizations: user.organizations,
        entitlements: user.entitlements,
        roles: user.roles,
        isSuperAdmin: user.isSuperAdmin
      }
    });
  } catch (error) {
    console.error("Session lookup failed:", error);
    res.status(500).json({ error: "Failed to load session" });
  }
});
var auth_default = router;

// ../../messaging/server/src/routes/conversations.ts
import { Router as Router2 } from "express";
import { v4 as uuidv42 } from "uuid";
init_conversation();

// ../../messaging/server/src/models/participant.ts
init_database();
var ParticipantModel = {
  /**
   * Add a participant to a conversation.
   * Supports both legacy user_id and new entity_id addressing.
   *
   * @param conversationId - The conversation UUID
   * @param userId - Legacy user identifier (e.g., "assistant:log-analyst")
   * @param userType - 'user' or 'agent' (auto-detected if not provided)
   * @param role - Participant role in the conversation
   * @param entityId - Optional Entity UUID from Identity service (ent_xxx format)
   */
  async add(conversationId, userId, userType, role = "member", entityId) {
    const resolvedUserType = userType ?? (userId.startsWith("assistant:") || userId.startsWith("agent:") ? "agent" : "user");
    const result = await pool.query(
      `INSERT INTO participants (conversation_id, user_id, user_type, role, entity_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (conversation_id, user_id) DO UPDATE SET
         role = EXCLUDED.role,
         entity_id = COALESCE(EXCLUDED.entity_id, participants.entity_id)
       RETURNING *`,
      [conversationId, userId, resolvedUserType, role, entityId]
    );
    return result.rows[0];
  },
  async remove(conversationId, userId) {
    const result = await pool.query(
      "DELETE FROM participants WHERE conversation_id = $1 AND user_id = $2",
      [conversationId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  },
  async listForConversation(conversationId) {
    const result = await pool.query(
      "SELECT * FROM participants WHERE conversation_id = $1",
      [conversationId]
    );
    return result.rows;
  },
  async isParticipant(conversationId, userId) {
    const result = await pool.query(
      "SELECT 1 FROM participants WHERE conversation_id = $1 AND user_id = $2",
      [conversationId, userId]
    );
    return result.rows.length > 0;
  },
  async getRole(conversationId, userId) {
    const result = await pool.query(
      "SELECT role FROM participants WHERE conversation_id = $1 AND user_id = $2",
      [conversationId, userId]
    );
    return result.rows[0]?.role || null;
  },
  async updateLastRead(conversationId, userId) {
    await pool.query(
      "UPDATE participants SET last_read_at = NOW() WHERE conversation_id = $1 AND user_id = $2",
      [conversationId, userId]
    );
  },
  async getConversationsForUser(userId) {
    const result = await pool.query(
      "SELECT conversation_id FROM participants WHERE user_id = $1",
      [userId]
    );
    return result.rows.map((r) => r.conversation_id);
  },
  async getAssistantParticipants(conversationId) {
    const result = await pool.query(
      `SELECT * FROM participants
       WHERE conversation_id = $1
       AND user_type = 'agent'
       AND user_id LIKE 'assistant:%'`,
      [conversationId]
    );
    return result.rows;
  },
  isAssistantUserId(userId) {
    return userId.startsWith("assistant:");
  },
  getAssistantKey(userId) {
    if (!userId.startsWith("assistant:")) return null;
    return userId.replace("assistant:", "");
  },
  // ===========================================================================
  // Entity-based methods (for UUID-to-UUID messaging)
  // ===========================================================================
  /**
   * Get participant by entity ID.
   * Used for entity-based message routing.
   */
  async getByEntityId(conversationId, entityId) {
    const result = await pool.query(
      "SELECT * FROM participants WHERE conversation_id = $1 AND entity_id = $2",
      [conversationId, entityId]
    );
    return result.rows[0] || null;
  },
  /**
   * Check if an entity is a participant in a conversation.
   */
  async isEntityParticipant(conversationId, entityId) {
    const result = await pool.query(
      "SELECT 1 FROM participants WHERE conversation_id = $1 AND entity_id = $2",
      [conversationId, entityId]
    );
    return result.rows.length > 0;
  },
  /**
   * Get all conversations for an entity.
   * Used for routing messages to the right conversations.
   */
  async getConversationsForEntity(entityId) {
    const result = await pool.query(
      "SELECT conversation_id FROM participants WHERE entity_id = $1",
      [entityId]
    );
    return result.rows.map((r) => r.conversation_id);
  },
  /**
   * Get all entity IDs participating in a conversation.
   * Used for broadcasting messages via SDN.
   */
  async getEntityIdsForConversation(conversationId) {
    const result = await pool.query(
      "SELECT entity_id FROM participants WHERE conversation_id = $1 AND entity_id IS NOT NULL",
      [conversationId]
    );
    return result.rows.map((r) => r.entity_id);
  },
  /**
   * Update a participant's entity ID.
   * Used when migrating from legacy user_id to entity-based addressing.
   */
  async setEntityId(conversationId, userId, entityId) {
    const result = await pool.query(
      "UPDATE participants SET entity_id = $1 WHERE conversation_id = $2 AND user_id = $3",
      [entityId, conversationId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  },
  /**
   * Bulk update entity IDs for all participants with a given user_id.
   * Used for migrating existing conversations to entity-based addressing.
   */
  async migrateUserIdToEntityId(userId, entityId) {
    const result = await pool.query(
      "UPDATE participants SET entity_id = $1 WHERE user_id = $2 AND entity_id IS NULL",
      [entityId, userId]
    );
    return result.rowCount ?? 0;
  }
};

// ../../messaging/server/src/models/message.ts
init_database();
import { withRLSContext, getCurrentRLSContext } from "@symbia/db";
var MessageModel = {
  async create(input) {
    const runTxn = async (client2) => {
      const conversation = await client2.query(
        "SELECT org_id FROM conversations WHERE id = $1 FOR UPDATE",
        [input.conversationId]
      );
      const orgId = input.orgId ?? conversation.rows[0]?.org_id ?? null;
      const seqResult = await client2.query(
        "SELECT COALESCE(MAX(sequence), 0) + 1 AS seq FROM messages WHERE conversation_id = $1",
        [input.conversationId]
      );
      const sequence = Number(seqResult.rows[0]?.seq || 1);
      const priority = input.priority || "normal";
      const interruptible = input.interruptible ?? true;
      const senderType = input.senderType || "user";
      const messageId = input.id || crypto.randomUUID();
      const insertResult = await client2.query(
        `INSERT INTO messages (
          id,
          conversation_id,
          sender_id,
          sender_type,
          content,
          content_type,
          reply_to,
          org_id,
          run_id,
          trace_id,
          sequence,
          priority,
          interruptible,
          preempted_by,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (id) DO UPDATE SET
          updated_at = NOW()
        RETURNING *`,
        [
          messageId,
          input.conversationId,
          input.senderId,
          senderType,
          input.content,
          input.contentType || "text",
          input.replyTo || null,
          orgId,
          input.runId || null,
          input.traceId || null,
          sequence,
          priority,
          interruptible,
          input.preemptedBy || null,
          input.metadata || {}
        ]
      );
      const message = insertResult.rows[0];
      await client2.query(
        "UPDATE conversations SET updated_at = NOW() WHERE id = $1",
        [input.conversationId]
      );
      if (!message) {
        throw new Error("Failed to create message");
      }
      return message;
    };
    const rlsCtx = getCurrentRLSContext();
    if (rlsCtx) {
      return withRLSContext(pool, rlsCtx, runTxn);
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const message = await runTxn(client);
      await client.query("COMMIT");
      return message;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  },
  async getById(id) {
    const result = await pool.query(
      "SELECT * FROM messages WHERE id = $1 AND deleted_at IS NULL",
      [id]
    );
    return result.rows[0] || null;
  },
  async listForConversation(conversationId, options = {}) {
    const limit = options.limit || 50;
    if (options.before) {
      const result2 = await pool.query(
        `SELECT * FROM messages 
         WHERE conversation_id = $1 AND deleted_at IS NULL AND created_at < $2
         ORDER BY created_at DESC LIMIT $3`,
        [conversationId, options.before, limit]
      );
      return result2.rows;
    }
    if (options.after) {
      const result2 = await pool.query(
        `SELECT * FROM messages 
         WHERE conversation_id = $1 AND deleted_at IS NULL AND created_at > $2
         ORDER BY created_at ASC LIMIT $3`,
        [conversationId, options.after, limit]
      );
      return result2.rows;
    }
    const result = await pool.query(
      `SELECT * FROM messages
       WHERE conversation_id = $1 AND deleted_at IS NULL
       ORDER BY sequence ASC NULLS LAST, created_at ASC LIMIT $2`,
      [conversationId, limit]
    );
    return result.rows;
  },
  async update(id, content) {
    const result = await pool.query(
      `UPDATE messages SET content = $1, updated_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL
       RETURNING *`,
      [content, id]
    );
    return result.rows[0] || null;
  },
  async delete(id) {
    const result = await pool.query(
      "UPDATE messages SET deleted_at = NOW() WHERE id = $1",
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }
};

// ../../messaging/server/src/webhooks.ts
import { v4 as uuidv4 } from "uuid";
import { emitEvent } from "@symbia/relay";
init_conversation();
init_config();
async function notifyAssistants(conversationId, message, senderId, authToken, runId) {
  console.log(`[SDN] ====== NOTIFY ASSISTANTS ======`);
  console.log(`[SDN] Conversation: ${conversationId}`);
  console.log(`[SDN] Sender: ${senderId}`);
  console.log(`[SDN] Message content: ${message.content?.substring(0, 100)}...`);
  const assistants = await ParticipantModel.getAssistantParticipants(conversationId);
  if (assistants.length === 0) {
    console.log(`[SDN] No assistant participants in conversation ${conversationId}`);
    return;
  }
  console.log(`[SDN] Found ${assistants.length} assistant participant(s): ${assistants.map((a) => a.user_id).join(", ")}`);
  const conversation = await ConversationModel.getById(conversationId);
  const flowRunId = runId || `run_msg_${uuidv4()}`;
  console.log(`[SDN] Emitting message.new to ${assistants.length} assistant(s), runId: ${flowRunId}`);
  const senderEntityId = await ParticipantModel.getByEntityId(conversationId, senderId).then((p) => p?.entity_id).catch(() => void 0);
  const recipientEntityIds = await ParticipantModel.getEntityIdsForConversation(conversationId).catch(() => []);
  const eventPayload = {
    conversationId,
    message: {
      id: message.id,
      sender_id: message.sender_id,
      sender_type: message.sender_type,
      content: message.content,
      content_type: message.content_type || "text",
      metadata: message.metadata,
      created_at: message.created_at.toISOString()
    },
    // Entity-based addressing
    senderEntityId: senderEntityId || senderId,
    recipientEntityIds,
    // Legacy: list of assistants for backward compatibility
    assistants: assistants.filter((a) => a.user_id !== senderId).map((a) => ({
      userId: a.user_id,
      key: ParticipantModel.getAssistantKey(a.user_id),
      entityId: a.entity_id
    })),
    orgId: conversation?.org_id,
    // Include auth token in metadata for downstream services
    _auth: authToken ? { token: authToken } : void 0
  };
  const sdnResult = await emitEvent(
    "message.new",
    eventPayload,
    flowRunId,
    {
      // Broadcast to all assistants (contracts determine actual recipients)
      boundary: "intra"
    }
  );
  if (sdnResult) {
    console.log(`[SDN] Event emitted successfully!`);
    console.log(`[SDN] Event ID: ${sdnResult.eventId}`);
    console.log(`[SDN] Trace status: ${sdnResult.trace.status}`);
    console.log(`[SDN] Trace path: ${JSON.stringify(sdnResult.trace.path)}`);
    if (sdnResult.trace.error) {
      console.log(`[SDN] Trace error: ${sdnResult.trace.error}`);
    }
    console.log(`[SDN] ====== END NOTIFY ASSISTANTS ======`);
    return;
  }
  console.log(`[SDN] Network relay not available (null result), falling back to HTTP webhooks`);
  await notifyAssistantsViaHttp(assistants, conversationId, message, senderId, conversation?.org_id, authToken);
}
async function notifyAssistantsViaHttp(assistants, conversationId, message, senderId, orgId, authToken) {
  for (const assistant of assistants) {
    if (assistant.user_id === senderId) continue;
    const assistantKey = ParticipantModel.getAssistantKey(assistant.user_id);
    if (!assistantKey) {
      console.log(`[Webhook] No assistant key found for ${assistant.user_id}`);
      continue;
    }
    const webhookPayload = {
      conversationId,
      message: {
        id: message.id,
        sender_id: message.sender_id,
        sender_type: message.sender_type,
        content: message.content,
        content_type: message.content_type || "text",
        metadata: message.metadata,
        created_at: message.created_at.toISOString()
      },
      assistant: {
        userId: assistant.user_id,
        key: assistantKey,
        entityId: assistant.entity_id
      },
      orgId
    };
    try {
      const headers = {
        "Content-Type": "application/json"
      };
      if (authToken) {
        headers["Authorization"] = authToken;
      }
      console.log(`[Webhook] Sending to ${config.assistantsWebhookUrl} for assistant ${assistantKey}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.webhookTimeoutMs);
      try {
        const response = await fetch(config.assistantsWebhookUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(webhookPayload),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
          console.error(
            `[Webhook] Failed to notify assistant ${assistantKey}: ${response.status} ${response.statusText}`
          );
        } else {
          const result = await response.json();
          console.log(`[Webhook] Notified assistant ${assistantKey}:`, result);
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError instanceof Error && fetchError.name === "AbortError") {
          console.error(`[Webhook] Timeout after ${config.webhookTimeoutMs}ms for assistant ${assistantKey}`);
        } else {
          throw fetchError;
        }
      }
    } catch (err) {
      console.error(`[Webhook] Error notifying assistant ${assistantKey}:`, err);
    }
  }
}

// ../../messaging/server/src/socket.ts
var socketServer = null;
function emitConversationEvent(conversationId, event, payload) {
  if (!socketServer) return;
  socketServer.to(`conversation:${conversationId}`).emit(event, payload);
}

// ../../messaging/server/src/routes/conversations.ts
import { emitEvent as emitEvent2 } from "@symbia/relay";
var router2 = Router2();
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
router2.param("id", (_req, res, next, id) => {
  if (!UUID_RE.test(String(id))) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  next();
});
router2.param("userId", (_req, res, next, userId) => {
  if (!UUID_RE.test(String(userId))) {
    res.status(404).json({ error: "Participant not found" });
    return;
  }
  next();
});
var allowedPriorities = /* @__PURE__ */ new Set(["low", "normal", "high", "critical"]);
function normalizePriority(priority) {
  if (!priority) return void 0;
  return allowedPriorities.has(priority) ? priority : void 0;
}
router2.get("/", requireAuth, async (req, res) => {
  try {
    const orgId = req.query.orgId || req.headers["x-org-id"];
    if (orgId && !isOrgMember(req.user, orgId)) {
      res.status(403).json({ error: "Not authorized for this organization" });
      return;
    }
    const conversations = await ConversationModel.listForUser(req.user.id, orgId);
    res.json(conversations);
  } catch (error) {
    console.error("Error listing conversations:", error);
    res.status(500).json({ error: "Failed to list conversations" });
  }
});
router2.post("/", requireAuth, async (req, res) => {
  try {
    const { type, name, description, metadata, participants } = req.body;
    const orgId = req.body?.orgId || req.headers["x-org-id"];
    if (orgId && !isOrgMember(req.user, orgId)) {
      res.status(403).json({ error: "Not authorized for this organization" });
      return;
    }
    if (!type || !["private", "group"].includes(type)) {
      res.status(400).json({ error: "Invalid conversation type" });
      return;
    }
    if (type === "group" && !name) {
      res.status(400).json({ error: "Group conversations require a name" });
      return;
    }
    const conversation = await ConversationModel.create({
      type,
      name,
      description,
      orgId,
      createdBy: req.user.id,
      metadata
    });
    await ParticipantModel.add(conversation.id, req.user.id, req.user.type, "owner");
    if (participants && Array.isArray(participants)) {
      for (const p of participants) {
        if (p.userId && p.userId !== req.user.id) {
          await ParticipantModel.add(conversation.id, p.userId, p.userType || "user", "member");
        }
      }
    }
    const allParticipants = await ParticipantModel.listForConversation(conversation.id);
    res.status(201).json({ ...conversation, participants: allParticipants });
  } catch (error) {
    console.error("Error creating conversation:", error);
    res.status(500).json({ error: "Failed to create conversation" });
  }
});
router2.get("/:id", requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const isParticipant = await ParticipantModel.isParticipant(id, req.user.id);
    if (!isParticipant) {
      res.status(403).json({ error: "Not a participant in this conversation" });
      return;
    }
    const conversation = await ConversationModel.getById(id);
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const participants = await ParticipantModel.listForConversation(id);
    res.json({ ...conversation, participants });
  } catch (error) {
    console.error("Error getting conversation:", error);
    res.status(500).json({ error: "Failed to get conversation" });
  }
});
router2.patch("/:id", requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const { name, description, metadata } = req.body;
    const role = await ParticipantModel.getRole(id, req.user.id);
    if (!role || !["owner", "admin"].includes(role)) {
      res.status(403).json({ error: "Not authorized to update this conversation" });
      return;
    }
    const conversation = await ConversationModel.update(id, { name, description, metadata });
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    res.json(conversation);
  } catch (error) {
    console.error("Error updating conversation:", error);
    res.status(500).json({ error: "Failed to update conversation" });
  }
});
router2.delete("/:id", requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const role = await ParticipantModel.getRole(id, req.user.id);
    if (role !== "owner") {
      res.status(403).json({ error: "Only the owner can delete this conversation" });
      return;
    }
    const deleted = await ConversationModel.delete(id);
    if (!deleted) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting conversation:", error);
    res.status(500).json({ error: "Failed to delete conversation" });
  }
});
router2.post("/:id/join", requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const conversation = await ConversationModel.getById(id);
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    if (conversation.type === "private") {
      res.status(400).json({ error: "Cannot join a private conversation" });
      return;
    }
    if (conversation.org_id && !isOrgMember(req.user, conversation.org_id)) {
      res.status(403).json({ error: "Not authorized for this organization" });
      return;
    }
    const participant = await ParticipantModel.add(id, req.user.id, req.user.type, "member");
    res.status(201).json(participant);
  } catch (error) {
    console.error("Error joining conversation:", error);
    res.status(500).json({ error: "Failed to join conversation" });
  }
});
router2.post("/:id/leave", requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const role = await ParticipantModel.getRole(id, req.user.id);
    if (role === "owner") {
      res.status(400).json({ error: "Owner cannot leave the conversation. Transfer ownership or delete it." });
      return;
    }
    const removed = await ParticipantModel.remove(id, req.user.id);
    if (!removed) {
      res.status(404).json({ error: "Not a participant in this conversation" });
      return;
    }
    res.status(204).send();
  } catch (error) {
    console.error("Error leaving conversation:", error);
    res.status(500).json({ error: "Failed to leave conversation" });
  }
});
router2.post("/:id/participants", requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const { userId, userType } = req.body;
    if (!userId) {
      res.status(400).json({ error: "userId is required" });
      return;
    }
    const role = await ParticipantModel.getRole(id, req.user.id);
    if (!role || !["owner", "admin"].includes(role)) {
      res.status(403).json({ error: "Not authorized to add participants" });
      return;
    }
    const participant = await ParticipantModel.add(id, userId, userType, "member");
    res.status(201).json(participant);
  } catch (error) {
    console.error("Error adding participant:", error);
    res.status(500).json({ error: "Failed to add participant" });
  }
});
router2.delete("/:id/participants/:userId", requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const userId = req.params.userId;
    const role = await ParticipantModel.getRole(id, req.user.id);
    if (!role || !["owner", "admin"].includes(role)) {
      res.status(403).json({ error: "Not authorized to remove participants" });
      return;
    }
    const targetRole = await ParticipantModel.getRole(id, userId);
    if (targetRole === "owner") {
      res.status(400).json({ error: "Cannot remove the owner" });
      return;
    }
    const removed = await ParticipantModel.remove(id, userId);
    if (!removed) {
      res.status(404).json({ error: "Participant not found" });
      return;
    }
    res.status(204).send();
  } catch (error) {
    console.error("Error removing participant:", error);
    res.status(500).json({ error: "Failed to remove participant" });
  }
});
router2.get("/:id/messages", requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const { limit, before, after } = req.query;
    const isParticipant = await ParticipantModel.isParticipant(id, req.user.id);
    if (!isParticipant) {
      res.status(403).json({ error: "Not a participant in this conversation" });
      return;
    }
    const messages = await MessageModel.listForConversation(id, {
      limit: limit ? parseInt(limit, 10) : void 0,
      before: before ? new Date(before) : void 0,
      after: after ? new Date(after) : void 0
    });
    await ParticipantModel.updateLastRead(id, req.user.id);
    res.json(messages);
  } catch (error) {
    console.error("Error getting messages:", error);
    res.status(500).json({ error: "Failed to get messages" });
  }
});
router2.post("/:id/messages", requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const { content, contentType, replyTo, metadata, id: messageId, runId, traceId, priority, interruptible, preemptedBy } = req.body;
    if (!content) {
      res.status(400).json({ error: "Message content is required" });
      return;
    }
    if (contentType === "event") {
      res.status(400).json({ error: "Use /control for stream events" });
      return;
    }
    let isParticipant = await ParticipantModel.isParticipant(id, req.user.id);
    if (!isParticipant && req.user.type === "agent") {
      try {
        await ParticipantModel.add(id, req.user.id, "agent", "member");
        console.log(`[Messages] Auto-added agent ${req.user.id} to conversation ${id}`);
        isParticipant = true;
      } catch (addError) {
        console.error(`[Messages] Failed to auto-add agent ${req.user.id}:`, addError);
      }
    }
    if (!isParticipant) {
      res.status(403).json({ error: "Not a participant in this conversation" });
      return;
    }
    const message = await MessageModel.create({
      conversationId: id,
      senderId: req.user.id,
      senderType: req.user.type,
      id: messageId,
      content,
      contentType,
      replyTo,
      metadata,
      runId,
      traceId,
      priority: normalizePriority(priority),
      interruptible,
      preemptedBy
    });
    console.log("[REST Message] Broadcasting message:new to room conversation:" + id, {
      messageId: message.id,
      senderId: message.sender_id,
      senderType: message.sender_type
    });
    emitConversationEvent(id, "message:new", message);
    if (req.user.type !== "agent") {
      const authToken = req.headers.authorization;
      notifyAssistants(id, message, req.user.id, authToken).catch((err) => {
        console.error("[Webhook] Failed to notify assistants:", err);
      });
    } else {
      const conversation = await ConversationModel.getById(id);
      const channelMetadata = conversation?.metadata?.channel;
      if (channelMetadata?.connectionId) {
        const runId2 = uuidv42();
        console.log(`[SDN] Agent message to channel-linked conversation ${id}, emitting message.new`);
        emitEvent2("message.new", {
          conversationId: id,
          message: {
            id: message.id,
            sender_id: message.sender_id,
            sender_type: message.sender_type,
            content: message.content,
            content_type: message.content_type,
            metadata: message.metadata,
            created_at: message.created_at
          },
          channel: channelMetadata
        }, runId2, { boundary: "intra" }).catch((err) => {
          console.error("[SDN] Failed to emit message.new:", err);
        });
      }
    }
    res.status(201).json(message);
  } catch (error) {
    console.error("Error creating message:", error);
    res.status(500).json({ error: "Failed to create message" });
  }
});
router2.post("/:id/control", requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const { event, target, reason, metadata, runId, traceId, preemptedBy } = req.body;
    if (!event || typeof event !== "string") {
      res.status(400).json({ error: "Control event is required" });
      return;
    }
    const isParticipant = await ParticipantModel.isParticipant(id, req.user.id);
    if (!isParticipant) {
      res.status(403).json({ error: "Not a participant in this conversation" });
      return;
    }
    const requiresRoute = event === "stream.handoff" || event === "stream.route";
    const entitlement = requiresRoute ? "cap:messaging.route" : "cap:messaging.interrupt";
    const hasEntitlement = req.user.isSuperAdmin || req.user.entitlements.includes(entitlement);
    if (!hasEntitlement) {
      res.status(403).json({ error: "Not authorized to send control events" });
      return;
    }
    const payload = {
      event,
      conversationId: id,
      target,
      reason,
      preemptedBy,
      runId,
      traceId,
      effectiveAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const controlMessage = await MessageModel.create({
      conversationId: id,
      senderId: req.user.id,
      senderType: req.user.type,
      content: event,
      contentType: "event",
      metadata: { ...metadata, control: payload },
      runId,
      traceId,
      priority: "high",
      interruptible: false,
      preemptedBy
    });
    emitConversationEvent(id, event, payload);
    res.status(201).json(controlMessage);
  } catch (error) {
    console.error("Error sending control event:", error);
    res.status(500).json({ error: "Failed to send control event" });
  }
});
var conversations_default = router2;

// ../../messaging/server/src/routes/admin.ts
import { Router as Router3 } from "express";
init_conversation();
init_database();
var router3 = Router3();
var UUID_RE2 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
router3.param("id", (_req, res, next, id) => {
  if (!UUID_RE2.test(String(id))) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  next();
});
router3.param("userId", (_req, res, next, userId) => {
  if (!UUID_RE2.test(String(userId))) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  next();
});
router3.get("/conversations", requireAdmin, async (req, res) => {
  try {
    const { orgId, type, limit = "50", offset = "0" } = req.query;
    if (orgId && !req.user.isSuperAdmin && !isOrgAdmin(req.user, orgId)) {
      res.status(403).json({ error: "Not authorized for this organization" });
      return;
    }
    let query = "SELECT * FROM conversations WHERE 1=1";
    let countQuery = "SELECT COUNT(*) FROM conversations WHERE 1=1";
    const params = [];
    const countParams = [];
    let paramIdx = 1;
    let countParamIdx = 1;
    if (orgId) {
      query += ` AND org_id = $${paramIdx++}`;
      countQuery += ` AND org_id = $${countParamIdx++}`;
      params.push(orgId);
      countParams.push(orgId);
    }
    if (type) {
      query += ` AND type = $${paramIdx++}`;
      countQuery += ` AND type = $${countParamIdx++}`;
      params.push(type);
      countParams.push(type);
    }
    query += ` ORDER BY updated_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(parseInt(limit, 10), parseInt(offset, 10));
    const result = await pool.query(query, params);
    const countResult = await pool.query(countQuery, countParams);
    res.json({
      conversations: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10)
    });
  } catch (error) {
    console.error("Error listing all conversations:", error);
    res.status(500).json({ error: "Failed to list conversations" });
  }
});
router3.get("/conversations/:id", requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const conversation = await ConversationModel.getById(id);
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    if (conversation.org_id && !req.user.isSuperAdmin && !isOrgAdmin(req.user, conversation.org_id)) {
      res.status(403).json({ error: "Not authorized for this organization" });
      return;
    }
    const participants = await ParticipantModel.listForConversation(id);
    const messages = await MessageModel.listForConversation(id, { limit: 100 });
    res.json({
      ...conversation,
      participants,
      recentMessages: messages
    });
  } catch (error) {
    console.error("Error getting conversation:", error);
    res.status(500).json({ error: "Failed to get conversation" });
  }
});
router3.delete("/conversations/:id", requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const conversation = await ConversationModel.getById(id);
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    if (conversation.org_id && !req.user.isSuperAdmin && !isOrgAdmin(req.user, conversation.org_id)) {
      res.status(403).json({ error: "Not authorized for this organization" });
      return;
    }
    await ConversationModel.delete(id);
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting conversation:", error);
    res.status(500).json({ error: "Failed to delete conversation" });
  }
});
router3.get("/users/:userId/conversations", requireAdmin, async (req, res) => {
  try {
    const userId = req.params.userId;
    const conversations = await ConversationModel.listForUser(userId);
    res.json(conversations);
  } catch (error) {
    console.error("Error listing user conversations:", error);
    res.status(500).json({ error: "Failed to list user conversations" });
  }
});
router3.post("/conversations/:id/participants", requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const { userId, userType, role } = req.body;
    if (!userId) {
      res.status(400).json({ error: "userId is required" });
      return;
    }
    const conversation = await ConversationModel.getById(id);
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    if (conversation.org_id && !req.user.isSuperAdmin && !isOrgAdmin(req.user, conversation.org_id)) {
      res.status(403).json({ error: "Not authorized for this organization" });
      return;
    }
    const participant = await ParticipantModel.add(id, userId, userType || "user", role || "member");
    res.status(201).json(participant);
  } catch (error) {
    console.error("Error adding participant:", error);
    res.status(500).json({ error: "Failed to add participant" });
  }
});
router3.delete("/conversations/:id/participants/:userId", requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const userId = req.params.userId;
    const conversation = await ConversationModel.getById(id);
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    if (conversation.org_id && !req.user.isSuperAdmin && !isOrgAdmin(req.user, conversation.org_id)) {
      res.status(403).json({ error: "Not authorized for this organization" });
      return;
    }
    const removed = await ParticipantModel.remove(id, userId);
    if (!removed) {
      res.status(404).json({ error: "Participant not found" });
      return;
    }
    res.status(204).send();
  } catch (error) {
    console.error("Error removing participant:", error);
    res.status(500).json({ error: "Failed to remove participant" });
  }
});
router3.get("/stats", requireAdmin, async (req, res) => {
  try {
    const { orgId, type } = req.query;
    if (orgId && !req.user.isSuperAdmin && !isOrgAdmin(req.user, orgId)) {
      res.status(403).json({ error: "Not authorized for this organization" });
      return;
    }
    let convWhereClause = "WHERE 1=1";
    const convParams = [];
    let paramIdx = 1;
    if (orgId) {
      convWhereClause += ` AND org_id = $${paramIdx++}`;
      convParams.push(orgId);
    }
    if (type) {
      convWhereClause += ` AND type = $${paramIdx++}`;
      convParams.push(type);
    }
    const conversationsResult = await pool.query(
      `SELECT COUNT(*) FROM conversations ${convWhereClause}`,
      convParams
    );
    const messagesResult = await pool.query(
      `SELECT COUNT(*) FROM messages m 
       JOIN conversations c ON m.conversation_id = c.id 
       ${convWhereClause.replace("WHERE", "WHERE")}`.replace("org_id", "c.org_id").replace("type", "c.type"),
      convParams
    );
    const participantsResult = await pool.query(
      `SELECT COUNT(DISTINCT p.user_id) FROM participants p
       JOIN conversations c ON p.conversation_id = c.id
       ${convWhereClause.replace("WHERE", "WHERE")}`.replace("org_id", "c.org_id").replace("type", "c.type"),
      convParams
    );
    const activeConvWhereClause = convWhereClause + ` AND updated_at > NOW() - INTERVAL '24 hours'`;
    const activeResult = await pool.query(
      `SELECT COUNT(*) FROM conversations ${activeConvWhereClause}`,
      convParams
    );
    res.json({
      totalConversations: parseInt(conversationsResult.rows[0].count, 10),
      totalMessages: parseInt(messagesResult.rows[0].count, 10),
      uniqueParticipants: parseInt(participantsResult.rows[0].count, 10),
      activeConversations24h: parseInt(activeResult.rows[0].count, 10),
      filters: { orgId: orgId || null, type: type || null }
    });
  } catch (error) {
    console.error("Error getting stats:", error);
    res.status(500).json({ error: "Failed to get stats" });
  }
});
var admin_default = router3;

// ../../messaging/server/src/doc-routes.ts
import { registerDocRoutes } from "@symbia/md";

// ../../messaging/server/src/openapi.ts
var openApiSpec = {
  "openapi": "3.1.0",
  "info": {
    "title": "Symbia Messaging API",
    "version": "1.0.0",
    "description": "Real-time messaging bus for users, agents, and services.\n\nScope headers (optional): X-Org-Id, X-Service-Id, X-Env, X-Environment, X-Data-Class, X-Policy-Ref.\n\nWebSocket events:\nClient: join:conversation, leave:conversation, message:send, message:edit, message:delete, control:send, typing:start, typing:stop, presence:update.\nServer: message:new, message:updated, message:deleted, typing:started, typing:stopped, presence:changed, stream.pause, stream.resume, stream.preempt, stream.route, stream.handoff, stream.cancel, stream.priority."
  },
  "servers": [
    {
      "url": "/api",
      "description": "Messaging API"
    }
  ],
  "tags": [
    {
      "name": "health"
    },
    {
      "name": "bootstrap"
    },
    {
      "name": "auth"
    },
    {
      "name": "conversations"
    },
    {
      "name": "messages"
    },
    {
      "name": "control"
    },
    {
      "name": "participants"
    },
    {
      "name": "admin"
    }
  ],
  "security": [
    {
      "bearerAuth": []
    },
    {
      "apiKeyAuth": []
    },
    {
      "cookieAuthToken": []
    },
    {
      "cookieAuthSession": []
    }
  ],
  "paths": {
    "/health": {
      "get": {
        "tags": [
          "health"
        ],
        "summary": "Health check",
        "security": [],
        "responses": {
          "200": {
            "description": "Service health",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Health"
                }
              }
            }
          }
        }
      }
    },
    "/bootstrap": {
      "get": {
        "tags": [
          "bootstrap"
        ],
        "summary": "Service bootstrap",
        "security": [],
        "responses": {
          "200": {
            "description": "Service metadata",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Bootstrap"
                }
              }
            }
          }
        }
      }
    },
    "/auth/login": {
      "post": {
        "tags": [
          "auth"
        ],
        "summary": "Login (proxy to Identity)",
        "security": [],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/AuthLoginRequest"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Login response",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/AuthLoginResponse"
                }
              }
            }
          }
        }
      }
    },
    "/auth/logout": {
      "post": {
        "tags": [
          "auth"
        ],
        "summary": "Logout (proxy to Identity)",
        "responses": {
          "200": {
            "description": "Logged out"
          }
        }
      }
    },
    "/auth/session": {
      "get": {
        "tags": [
          "auth"
        ],
        "summary": "Get session",
        "security": [],
        "responses": {
          "200": {
            "description": "Session status",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/AuthSession"
                }
              }
            }
          }
        }
      }
    },
    "/conversations": {
      "get": {
        "tags": [
          "conversations"
        ],
        "summary": "List conversations",
        "parameters": [
          {
            "name": "orgId",
            "in": "query",
            "schema": {
              "type": "string"
            },
            "required": false
          }
        ],
        "responses": {
          "200": {
            "description": "Conversation list",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {
                    "$ref": "#/components/schemas/Conversation"
                  }
                }
              }
            }
          }
        }
      },
      "post": {
        "tags": [
          "conversations"
        ],
        "summary": "Create a conversation",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/CreateConversationRequest"
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Conversation created",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ConversationWithParticipants"
                }
              }
            }
          }
        }
      }
    },
    "/conversations/{id}": {
      "get": {
        "tags": [
          "conversations"
        ],
        "summary": "Get conversation",
        "parameters": [
          {
            "$ref": "#/components/parameters/ConversationId"
          }
        ],
        "responses": {
          "200": {
            "description": "Conversation with participants",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ConversationWithParticipants"
                }
              }
            }
          },
          "404": {
            "$ref": "#/components/responses/NotFound"
          }
        }
      },
      "patch": {
        "tags": [
          "conversations"
        ],
        "summary": "Update conversation",
        "parameters": [
          {
            "$ref": "#/components/parameters/ConversationId"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/UpdateConversationRequest"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Conversation updated",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Conversation"
                }
              }
            }
          },
          "404": {
            "$ref": "#/components/responses/NotFound"
          }
        }
      },
      "delete": {
        "tags": [
          "conversations"
        ],
        "summary": "Delete conversation",
        "parameters": [
          {
            "$ref": "#/components/parameters/ConversationId"
          }
        ],
        "responses": {
          "204": {
            "description": "Deleted"
          },
          "404": {
            "$ref": "#/components/responses/NotFound"
          }
        }
      }
    },
    "/conversations/{id}/join": {
      "post": {
        "tags": [
          "participants"
        ],
        "summary": "Join conversation",
        "parameters": [
          {
            "$ref": "#/components/parameters/ConversationId"
          }
        ],
        "responses": {
          "201": {
            "description": "Joined",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Participant"
                }
              }
            }
          }
        }
      }
    },
    "/conversations/{id}/leave": {
      "post": {
        "tags": [
          "participants"
        ],
        "summary": "Leave conversation",
        "parameters": [
          {
            "$ref": "#/components/parameters/ConversationId"
          }
        ],
        "responses": {
          "204": {
            "description": "Left"
          }
        }
      }
    },
    "/conversations/{id}/participants": {
      "post": {
        "tags": [
          "participants"
        ],
        "summary": "Add participant",
        "parameters": [
          {
            "$ref": "#/components/parameters/ConversationId"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/AddParticipantRequest"
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Participant added",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Participant"
                }
              }
            }
          }
        }
      }
    },
    "/conversations/{id}/participants/{userId}": {
      "delete": {
        "tags": [
          "participants"
        ],
        "summary": "Remove participant",
        "parameters": [
          {
            "$ref": "#/components/parameters/ConversationId"
          },
          {
            "$ref": "#/components/parameters/UserId"
          }
        ],
        "responses": {
          "204": {
            "description": "Removed"
          },
          "404": {
            "$ref": "#/components/responses/NotFound"
          }
        }
      }
    },
    "/conversations/{id}/messages": {
      "get": {
        "tags": [
          "messages"
        ],
        "summary": "List messages",
        "parameters": [
          {
            "$ref": "#/components/parameters/ConversationId"
          },
          {
            "name": "limit",
            "in": "query",
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 200
            },
            "required": false
          },
          {
            "name": "before",
            "in": "query",
            "schema": {
              "type": "string",
              "format": "date-time"
            },
            "required": false
          },
          {
            "name": "after",
            "in": "query",
            "schema": {
              "type": "string",
              "format": "date-time"
            },
            "required": false
          }
        ],
        "responses": {
          "200": {
            "description": "Message list",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {
                    "$ref": "#/components/schemas/Message"
                  }
                }
              }
            }
          }
        }
      },
      "post": {
        "tags": [
          "messages"
        ],
        "summary": "Send message",
        "parameters": [
          {
            "$ref": "#/components/parameters/ConversationId"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/CreateMessageRequest"
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Message created",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Message"
                }
              }
            }
          }
        }
      }
    },
    "/conversations/{id}/control": {
      "post": {
        "tags": [
          "control"
        ],
        "summary": "Send control event",
        "parameters": [
          {
            "$ref": "#/components/parameters/ConversationId"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/CreateControlRequest"
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Control message created",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Message"
                }
              }
            }
          }
        }
      }
    },
    "/admin/conversations": {
      "get": {
        "tags": [
          "admin"
        ],
        "summary": "List conversations (admin)",
        "parameters": [
          {
            "name": "orgId",
            "in": "query",
            "schema": {
              "type": "string"
            },
            "required": false
          },
          {
            "name": "type",
            "in": "query",
            "schema": {
              "type": "string",
              "enum": [
                "private",
                "group"
              ]
            },
            "required": false
          },
          {
            "name": "limit",
            "in": "query",
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 200
            },
            "required": false
          },
          {
            "name": "offset",
            "in": "query",
            "schema": {
              "type": "integer",
              "minimum": 0
            },
            "required": false
          }
        ],
        "responses": {
          "200": {
            "description": "Paginated conversations",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/AdminConversationList"
                }
              }
            }
          }
        }
      }
    },
    "/admin/conversations/{id}": {
      "get": {
        "tags": [
          "admin"
        ],
        "summary": "Get conversation (admin)",
        "parameters": [
          {
            "$ref": "#/components/parameters/ConversationId"
          }
        ],
        "responses": {
          "200": {
            "description": "Conversation with participants and recent messages",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/AdminConversationDetail"
                }
              }
            }
          },
          "404": {
            "$ref": "#/components/responses/NotFound"
          }
        }
      },
      "delete": {
        "tags": [
          "admin"
        ],
        "summary": "Delete conversation (admin)",
        "parameters": [
          {
            "$ref": "#/components/parameters/ConversationId"
          }
        ],
        "responses": {
          "204": {
            "description": "Deleted"
          },
          "404": {
            "$ref": "#/components/responses/NotFound"
          }
        }
      }
    },
    "/admin/users/{userId}/conversations": {
      "get": {
        "tags": [
          "admin"
        ],
        "summary": "List user conversations (admin)",
        "parameters": [
          {
            "$ref": "#/components/parameters/UserId"
          }
        ],
        "responses": {
          "200": {
            "description": "Conversation list",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {
                    "$ref": "#/components/schemas/Conversation"
                  }
                }
              }
            }
          }
        }
      }
    },
    "/admin/conversations/{id}/participants": {
      "post": {
        "tags": [
          "admin"
        ],
        "summary": "Add participant (admin)",
        "parameters": [
          {
            "$ref": "#/components/parameters/ConversationId"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/AdminAddParticipantRequest"
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Participant added",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Participant"
                }
              }
            }
          }
        }
      }
    },
    "/admin/conversations/{id}/participants/{userId}": {
      "delete": {
        "tags": [
          "admin"
        ],
        "summary": "Remove participant (admin)",
        "parameters": [
          {
            "$ref": "#/components/parameters/ConversationId"
          },
          {
            "$ref": "#/components/parameters/UserId"
          }
        ],
        "responses": {
          "204": {
            "description": "Removed"
          },
          "404": {
            "$ref": "#/components/responses/NotFound"
          }
        }
      }
    },
    "/admin/stats": {
      "get": {
        "tags": [
          "admin"
        ],
        "summary": "Service stats (admin)",
        "parameters": [
          {
            "name": "orgId",
            "in": "query",
            "schema": {
              "type": "string"
            },
            "required": false
          }
        ],
        "responses": {
          "200": {
            "description": "Statistics",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/AdminStats"
                }
              }
            }
          }
        }
      }
    }
  },
  "components": {
    "securitySchemes": {
      "bearerAuth": {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT"
      },
      "apiKeyAuth": {
        "type": "apiKey",
        "in": "header",
        "name": "X-API-Key"
      },
      "cookieAuthToken": {
        "type": "apiKey",
        "in": "cookie",
        "name": "token"
      },
      "cookieAuthSession": {
        "type": "apiKey",
        "in": "cookie",
        "name": "symbia_session"
      }
    },
    "parameters": {
      "ConversationId": {
        "name": "id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string",
          "format": "uuid"
        }
      },
      "UserId": {
        "name": "userId",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    },
    "responses": {
      "NotFound": {
        "description": "Not found",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Error"
            }
          }
        }
      }
    },
    "schemas": {
      "Health": {
        "type": "object",
        "properties": {
          "status": {
            "type": "string"
          },
          "service": {
            "type": "string"
          }
        },
        "required": [
          "status",
          "service"
        ]
      },
      "Bootstrap": {
        "type": "object",
        "properties": {
          "service": {
            "type": "string"
          },
          "version": {
            "type": "string"
          },
          "description": {
            "type": "string"
          },
          "docsUrls": {
            "type": "object"
          },
          "endpoints": {
            "type": "object"
          },
          "authentication": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "websocketEvents": {
            "type": "object"
          }
        },
        "required": [
          "service",
          "version"
        ]
      },
      "Conversation": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "type": {
            "type": "string",
            "enum": [
              "private",
              "group"
            ]
          },
          "name": {
            "type": "string",
            "nullable": true
          },
          "description": {
            "type": "string",
            "nullable": true
          },
          "org_id": {
            "type": "string",
            "nullable": true
          },
          "created_by": {
            "type": "string"
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          },
          "updated_at": {
            "type": "string",
            "format": "date-time"
          },
          "metadata": {
            "type": "object"
          }
        },
        "required": [
          "id",
          "type",
          "created_by",
          "created_at",
          "updated_at"
        ]
      },
      "Participant": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "conversation_id": {
            "type": "string",
            "format": "uuid"
          },
          "user_id": {
            "type": "string"
          },
          "user_type": {
            "type": "string",
            "enum": [
              "user",
              "agent"
            ]
          },
          "role": {
            "type": "string",
            "enum": [
              "owner",
              "admin",
              "member"
            ]
          },
          "joined_at": {
            "type": "string",
            "format": "date-time"
          },
          "last_read_at": {
            "type": "string",
            "format": "date-time",
            "nullable": true
          }
        },
        "required": [
          "id",
          "conversation_id",
          "user_id",
          "user_type",
          "role",
          "joined_at"
        ]
      },
      "Message": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "conversation_id": {
            "type": "string",
            "format": "uuid"
          },
          "sender_id": {
            "type": "string"
          },
          "sender_type": {
            "type": "string",
            "enum": [
              "user",
              "agent",
              "service",
              "bot"
            ]
          },
          "content": {
            "type": "string"
          },
          "content_type": {
            "type": "string"
          },
          "reply_to": {
            "type": "string",
            "format": "uuid",
            "nullable": true
          },
          "org_id": {
            "type": "string",
            "nullable": true
          },
          "run_id": {
            "type": "string",
            "format": "uuid",
            "nullable": true
          },
          "trace_id": {
            "type": "string",
            "nullable": true
          },
          "sequence": {
            "type": "integer",
            "nullable": true
          },
          "priority": {
            "type": "string",
            "enum": [
              "low",
              "normal",
              "high",
              "critical"
            ],
            "nullable": true
          },
          "interruptible": {
            "type": "boolean",
            "nullable": true
          },
          "preempted_by": {
            "type": "string",
            "format": "uuid",
            "nullable": true
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          },
          "updated_at": {
            "type": "string",
            "format": "date-time",
            "nullable": true
          },
          "deleted_at": {
            "type": "string",
            "format": "date-time",
            "nullable": true
          },
          "metadata": {
            "type": "object"
          }
        },
        "required": [
          "id",
          "conversation_id",
          "sender_id",
          "sender_type",
          "content",
          "content_type",
          "created_at"
        ]
      },
      "ConversationWithParticipants": {
        "type": "object",
        "allOf": [
          {
            "$ref": "#/components/schemas/Conversation"
          },
          {
            "type": "object",
            "properties": {
              "participants": {
                "type": "array",
                "items": {
                  "$ref": "#/components/schemas/Participant"
                }
              }
            }
          }
        ]
      },
      "CreateConversationRequest": {
        "type": "object",
        "properties": {
          "type": {
            "type": "string",
            "enum": [
              "private",
              "group"
            ]
          },
          "name": {
            "type": "string"
          },
          "description": {
            "type": "string"
          },
          "orgId": {
            "type": "string"
          },
          "metadata": {
            "type": "object"
          },
          "participants": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "userId": {
                  "type": "string"
                },
                "userType": {
                  "type": "string",
                  "enum": [
                    "user",
                    "agent"
                  ]
                }
              },
              "required": [
                "userId"
              ]
            }
          }
        },
        "required": [
          "type"
        ]
      },
      "UpdateConversationRequest": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string"
          },
          "description": {
            "type": "string"
          },
          "metadata": {
            "type": "object"
          }
        }
      },
      "AddParticipantRequest": {
        "type": "object",
        "properties": {
          "userId": {
            "type": "string"
          },
          "userType": {
            "type": "string",
            "enum": [
              "user",
              "agent"
            ]
          }
        },
        "required": [
          "userId"
        ]
      },
      "AdminAddParticipantRequest": {
        "type": "object",
        "properties": {
          "userId": {
            "type": "string"
          },
          "userType": {
            "type": "string",
            "enum": [
              "user",
              "agent"
            ]
          },
          "role": {
            "type": "string",
            "enum": [
              "owner",
              "admin",
              "member"
            ]
          }
        },
        "required": [
          "userId",
          "role"
        ]
      },
      "CreateMessageRequest": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "content": {
            "type": "string"
          },
          "contentType": {
            "type": "string"
          },
          "replyTo": {
            "type": "string",
            "format": "uuid"
          },
          "metadata": {
            "type": "object"
          },
          "runId": {
            "type": "string",
            "format": "uuid"
          },
          "traceId": {
            "type": "string"
          },
          "priority": {
            "type": "string",
            "enum": [
              "low",
              "normal",
              "high",
              "critical"
            ]
          },
          "interruptible": {
            "type": "boolean"
          },
          "preemptedBy": {
            "type": "string",
            "format": "uuid"
          }
        },
        "required": [
          "content"
        ]
      },
      "CreateControlRequest": {
        "type": "object",
        "properties": {
          "event": {
            "type": "string",
            "enum": [
              "stream.pause",
              "stream.resume",
              "stream.preempt",
              "stream.route",
              "stream.handoff",
              "stream.cancel",
              "stream.priority"
            ]
          },
          "target": {
            "type": "object",
            "properties": {
              "principalId": {
                "type": "string"
              },
              "principalType": {
                "type": "string",
                "enum": [
                  "user",
                  "agent",
                  "service",
                  "bot"
                ]
              }
            }
          },
          "reason": {
            "type": "string"
          },
          "preemptedBy": {
            "type": "string",
            "format": "uuid"
          },
          "runId": {
            "type": "string",
            "format": "uuid"
          },
          "traceId": {
            "type": "string"
          },
          "metadata": {
            "type": "object"
          }
        },
        "required": [
          "event"
        ]
      },
      "AuthLoginRequest": {
        "type": "object",
        "properties": {
          "email": {
            "type": "string"
          },
          "password": {
            "type": "string"
          }
        },
        "required": [
          "email",
          "password"
        ]
      },
      "AuthLoginResponse": {
        "type": "object",
        "properties": {
          "token": {
            "type": "string"
          },
          "user": {
            "type": "object"
          }
        }
      },
      "AuthSession": {
        "type": "object",
        "properties": {
          "authenticated": {
            "type": "boolean"
          },
          "user": {
            "type": "object",
            "nullable": true
          }
        },
        "required": [
          "authenticated"
        ]
      },
      "AdminConversationList": {
        "type": "object",
        "properties": {
          "items": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/Conversation"
            }
          },
          "limit": {
            "type": "integer"
          },
          "offset": {
            "type": "integer"
          },
          "total": {
            "type": "integer"
          }
        },
        "required": [
          "items"
        ]
      },
      "AdminConversationDetail": {
        "type": "object",
        "properties": {
          "conversation": {
            "$ref": "#/components/schemas/Conversation"
          },
          "participants": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/Participant"
            }
          },
          "recentMessages": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/Message"
            }
          }
        },
        "required": [
          "conversation",
          "participants"
        ]
      },
      "AdminStats": {
        "type": "object",
        "properties": {
          "totalConversations": {
            "type": "integer"
          },
          "totalMessages": {
            "type": "integer"
          },
          "uniqueParticipants": {
            "type": "integer"
          },
          "activeConversations24h": {
            "type": "integer"
          }
        },
        "required": [
          "totalConversations",
          "totalMessages",
          "uniqueParticipants",
          "activeConversations24h"
        ]
      },
      "Error": {
        "type": "object",
        "properties": {
          "error": {
            "type": "string"
          }
        },
        "required": [
          "error"
        ]
      }
    }
  }
};
{
  const __autoDocumentedPaths = {
    "/auth/config": {
      "get": {
        "tags": [
          "Auth"
        ],
        "summary": "Get config",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/auth/me": {
      "get": {
        "tags": [
          "Auth"
        ],
        "summary": "Get me",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/bootstrap/service": {
      "get": {
        "tags": [
          "Bootstrap"
        ],
        "summary": "Get service",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/stats": {
      "get": {
        "tags": [
          "Stats"
        ],
        "summary": "List stats",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    }
  };
  const __paths = openApiSpec.paths;
  for (const [key, ops] of Object.entries(__autoDocumentedPaths)) {
    __paths[key] = { ...__paths[key] || {}, ...ops };
  }
}

// ../../messaging/server/src/doc-routes.ts
function setupDocRoutes(app) {
  registerDocRoutes(app, {
    spec: openApiSpec,
    docsRoot: "docs",
    includeWellKnown: false
  });
}

// ../../messaging/server/src/routes.ts
var docsDir = path.resolve(process.cwd(), "docs");
async function registerRoutes(_server, app) {
  await initDatabase();
  app.use("/docs", express.static(docsDir));
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    next();
  });
  setupDocRoutes(app);
  app.get("/api/auth/config", (_req, res) => {
    const identityBase = config.identityServiceUrl.replace(/\/$/, "");
    res.json({
      identityServiceUrl: identityBase,
      loginUrl: `${identityBase}/login`,
      logoutUrl: `${identityBase}/api/auth/logout`
    });
  });
  app.get("/api/auth/me", async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    res.json({
      user,
      organizations: user.organizations || []
    });
  });
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  });
  app.get(["/api/bootstrap", "/api/bootstrap/service"], optionalAuth, (_req, res) => {
    res.json({
      service: config.serviceId,
      version: "1.0.0",
      description: "Real-time messaging bus for users and agents",
      docsUrls: {
        openapi: "/docs/openapi.json",
        llms: "/docs/llms.txt",
        llmsFull: "/docs/llms-full.txt",
        openapiDirect: "/api/openapi.json",
        openapiApi: "/api/docs/openapi.json",
        llmsApi: "/api/docs/llms.txt",
        llmsFullApi: "/api/docs/llms-full.txt"
      },
      endpoints: {
        auth: "/api/auth",
        rest: "/api/conversations",
        admin: "/api/admin",
        websocket: "/"
      },
      authentication: [
        "Bearer token (JWT)",
        "API key (X-API-Key header)",
        "Session cookie (token or symbia_session)"
      ],
      websocketEvents: {
        client: [
          "join:conversation",
          "leave:conversation",
          "message:send",
          "message:edit",
          "message:delete",
          "control:send",
          "typing:start",
          "typing:stop",
          "presence:update"
        ],
        server: [
          "message:new",
          "message:updated",
          "message:deleted",
          "stream.pause",
          "stream.resume",
          "stream.preempt",
          "stream.route",
          "stream.handoff",
          "stream.cancel",
          "stream.priority",
          "typing:started",
          "typing:stopped",
          "presence:changed"
        ]
      }
    });
  });
  app.get("/api/stats", async (_req, res) => {
    try {
      const conversationsResult = await pool.query("SELECT COUNT(*) FROM conversations");
      const messagesResult = await pool.query("SELECT COUNT(*) FROM messages");
      const participantsResult = await pool.query("SELECT COUNT(DISTINCT user_id) FROM participants");
      res.json({
        totalConversations: parseInt(conversationsResult.rows[0].count, 10),
        totalMessages: parseInt(messagesResult.rows[0].count, 10),
        uniqueParticipants: parseInt(participantsResult.rows[0].count, 10)
      });
    } catch (error) {
      console.error("Error getting stats:", error);
      res.status(500).json({ error: "Failed to get stats" });
    }
  });
  app.get("/api/internal/conversations/by-channel", async (req, res) => {
    const serviceId = req.headers["x-service-id"];
    if (!serviceId) {
      res.status(401).json({ error: "X-Service-Id header required" });
      return;
    }
    const { channelType, connectionId, chatId } = req.query;
    if (!channelType || !connectionId || !chatId) {
      res.status(400).json({ error: "channelType, connectionId, and chatId query params required" });
      return;
    }
    try {
      const { ConversationModel: ConversationModel2 } = await Promise.resolve().then(() => (init_conversation(), conversation_exports));
      const conversation = await ConversationModel2.findByChannelMetadata(
        channelType,
        connectionId,
        chatId
      );
      if (conversation) {
        res.json({ conversationId: conversation.id, conversation });
      } else {
        res.json({ conversationId: null });
      }
    } catch (error) {
      console.error("Error finding conversation by channel:", error);
      res.status(500).json({ error: "Failed to find conversation" });
    }
  });
  app.use("/api/conversations", conversations_default);
  app.use("/api/auth", auth_default);
  app.use("/api/admin", admin_default);
  app.get("/symbia-namespace", async (_req, res) => {
    res.json({
      namespace: "messaging",
      version: "1.0.0",
      description: "Real-time messaging and conversations",
      properties: {
        "conversations.count": { type: "number", description: "Total conversation count" },
        "messages.count": { type: "number", description: "Total message count" },
        "connections.active": { type: "number", description: "Active WebSocket connections" }
      }
    });
  });
}
export {
  registerRoutes
};
