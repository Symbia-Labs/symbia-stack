import pg from 'pg';
import { randomUUID } from 'crypto';
import { newDb, DataType, IMemoryDb } from 'pg-mem';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { config } from './config.js';

const { Pool } = pg;

const USE_MEMORY_DB =
  process.env.MESSAGING_USE_MEMORY_DB === 'true' || !config.databaseUrl;

let pool: pg.Pool;
let memDb: IMemoryDb | null = null;

if (USE_MEMORY_DB) {
  memDb = newDb({ autoCreateForeignKeyIndices: true });
  const mem = memDb;

  mem.public.registerFunction({
    name: 'gen_random_uuid',
    returns: DataType.uuid,
    impure: true,
    implementation: () => randomUUID(),
  });
  mem.public.registerFunction({
    name: 'uuid_generate_v4',
    returns: DataType.uuid,
    impure: true,
    implementation: () => randomUUID(),
  });
  mem.public.registerFunction({
    name: 'now',
    returns: DataType.timestamptz,
    impure: true,
    implementation: () => new Date(),
  });

  const adapter = mem.adapters.createPg();
  pool = new adapter.Pool();
  console.log('[DB] Using in-memory database (pg-mem).');
} else {
  pool = new Pool({
    connectionString: config.databaseUrl,
  });
}

export async function initDatabase(): Promise<void> {
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

    // Add entity_id column if not exists (for existing databases)
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

    // Seed test data for in-memory database
    if (USE_MEMORY_DB) {
      const conversationsResult = await client.query('SELECT COUNT(*) as count FROM conversations');
      const conversationCount = parseInt(conversationsResult.rows[0].count);

      if (conversationCount === 0) {
        console.log('Seeding messaging test data...');

        // Insert conversations
        await client.query(`
          INSERT INTO conversations (id, type, name, org_id, created_by, created_at, updated_at)
          VALUES
            ('a50e8400-e29b-41d4-a716-446655440000', 'group', 'Welcome to Symbia', '550e8400-e29b-41d4-a716-446655440000', '650e8400-e29b-41d4-a716-446655440000', NOW() - INTERVAL '60 minutes', NOW()),
            ('a50e8400-e29b-41d4-a716-446655440001', 'group', 'Support Request', '550e8400-e29b-41d4-a716-446655440001', '650e8400-e29b-41d4-a716-446655440002', NOW() - INTERVAL '30 minutes', NOW()),
            ('a50e8400-e29b-41d4-a716-446655440002', 'group', 'Project Planning', '550e8400-e29b-41d4-a716-446655440000', '650e8400-e29b-41d4-a716-446655440001', NOW() - INTERVAL '15 minutes', NOW())
        `);

        // Insert participants (admin user + dev-user in all conversations)
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

        // Insert sample messages
        await client.query(`
          INSERT INTO messages (conversation_id, sender_id, sender_type, content, created_at)
          VALUES
            ('a50e8400-e29b-41d4-a716-446655440000', '650e8400-e29b-41d4-a716-446655440000', 'user', 'Welcome to Symbia! This is our collaboration platform.', NOW() - INTERVAL '55 minutes'),
            ('a50e8400-e29b-41d4-a716-446655440000', 'dev-user', 'user', 'Thanks! Excited to get started.', NOW() - INTERVAL '50 minutes'),
            ('a50e8400-e29b-41d4-a716-446655440001', '650e8400-e29b-41d4-a716-446655440000', 'user', 'How can I help you today?', NOW() - INTERVAL '25 minutes'),
            ('a50e8400-e29b-41d4-a716-446655440002', '650e8400-e29b-41d4-a716-446655440000', 'user', 'Lets discuss the project timeline.', NOW() - INTERVAL '10 minutes')
        `);

        console.log('✓ Messaging test data seeded (3 conversations, 6 participants, 4 messages)');
      }
    }

    console.log('Database initialized successfully');
  } finally {
    client.release();
  }
}

/**
 * Export in-memory database to a JSON file
 */
export async function exportToFile(filePath: string): Promise<boolean> {
  if (!USE_MEMORY_DB || !memDb) {
    console.log('[messaging] Skipping export - not using in-memory database');
    return false;
  }

  try {
    // Ensure directory exists
    mkdirSync(dirname(filePath), { recursive: true });

    // Query all tables and export as JSON
    const client = await pool.connect();
    try {
      const conversations = await client.query('SELECT * FROM conversations');
      const participants = await client.query('SELECT * FROM participants');
      const messages = await client.query('SELECT * FROM messages');

      const backup = {
        exportedAt: new Date().toISOString(),
        tables: {
          conversations: conversations.rows,
          participants: participants.rows,
          messages: messages.rows,
        },
      };

      writeFileSync(filePath, JSON.stringify(backup, null, 2));
      console.log(`[messaging] Database exported to ${filePath}`);
      return true;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[messaging] Failed to export database:', error);
    return false;
  }
}

export const isMemory = USE_MEMORY_DB;

export { pool };
