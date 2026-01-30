import { pgTable, uuid, varchar, text, timestamp, jsonb, boolean, integer, pgEnum, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const orgs = pgTable('orgs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  settings: jsonb('settings').default({}),
  entitlements: jsonb('entitlements').default([]),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  slugIdx: uniqueIndex('orgs_slug_idx').on(table.slug),
}));

export const membershipRoleEnum = pgEnum('membership_role', ['owner', 'admin', 'member', 'viewer']);

export const orgMemberships = pgTable('org_memberships', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  role: membershipRoleEnum('role').default('member').notNull(),
  permissions: jsonb('permissions').default([]),
  invitedBy: uuid('invited_by').references(() => users.id),
  invitedAt: timestamp('invited_at'),
  acceptedAt: timestamp('accepted_at'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orgUserIdx: uniqueIndex('memberships_org_user_idx').on(table.orgId, table.userId),
}));

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  externalId: varchar('external_id', { length: 255 }).unique(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  displayName: varchar('display_name', { length: 255 }),
  avatarUrl: text('avatar_url'),
  metadata: jsonb('metadata').default({}),
  lastSeenAt: timestamp('last_seen_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  emailIdx: uniqueIndex('users_email_idx').on(table.email),
  externalIdIdx: index('users_external_id_idx').on(table.externalId),
}));

export const conversationStatusEnum = pgEnum('conversation_status', ['active', 'waiting', 'handoff', 'resolved', 'archived']);

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }).notNull(),
  title: varchar('title', { length: 500 }),
  status: conversationStatusEnum('status').default('active'),
  channel: varchar('channel', { length: 50 }).default('web'),
  metadata: jsonb('metadata').default({}),
  currentSequenceId: uuid('current_sequence_id'),
  currentStepId: uuid('current_step_id'),
  resolvedAt: timestamp('resolved_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orgStatusIdx: index('conversations_org_status_idx').on(table.orgId, table.status),
  orgCreatedIdx: index('conversations_org_created_idx').on(table.orgId, table.createdAt),
}));

export const participantRoleEnum = pgEnum('participant_role', ['user', 'agent', 'actor', 'system']);

export const conversationParticipants = pgTable('conversation_participants', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }).notNull(),
  orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id),
  role: participantRoleEnum('role').notNull(),
  isActive: boolean('is_active').default(true),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
  leftAt: timestamp('left_at'),
  metadata: jsonb('metadata').default({}),
}, (table) => ({
  convUserIdx: uniqueIndex('participants_conv_user_idx').on(table.conversationId, table.userId),
}));

export const eventTypeEnum = pgEnum('event_type', ['message', 'status_change', 'handoff', 'context_update', 'participant_join', 'participant_leave', 'sequence_start', 'sequence_step', 'sequence_end', 'error']);

export const conversationEvents = pgTable('conversation_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }).notNull(),
  orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }).notNull(),
  eventType: eventTypeEnum('event_type').notNull(),
  actorId: uuid('actor_id').references(() => users.id),
  actorRole: participantRoleEnum('actor_role'),
  payload: jsonb('payload').notNull(),
  sequenceNumber: integer('sequence_number').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  convSeqIdx: index('events_conv_seq_idx').on(table.conversationId, table.sequenceNumber),
  orgCreatedIdx: index('events_org_created_idx').on(table.orgId, table.createdAt),
}));

export const contextSnapshots = pgTable('context_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }).notNull(),
  orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }).notNull(),
  snapshotType: varchar('snapshot_type', { length: 50 }).notNull(),
  identityContext: jsonb('identity_context').default({}),
  catalogContext: jsonb('catalog_context').default({}),
  conversationSummary: text('conversation_summary'),
  customContext: jsonb('custom_context').default({}),
  version: integer('version').default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  convVersionIdx: index('snapshots_conv_version_idx').on(table.conversationId, table.version),
}));

export const messageRoleEnum = pgEnum('message_role', ['user', 'assistant', 'system', 'agent']);

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }).notNull(),
  orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }).notNull(),
  participantId: uuid('participant_id').references(() => conversationParticipants.id),
  role: messageRoleEnum('role').notNull(),
  content: text('content').notNull(),
  metadata: jsonb('metadata').default({}),
  tokenCount: integer('token_count'),
  modelUsed: varchar('model_used', { length: 100 }),
  providerId: uuid('provider_id').references(() => llmProviders.id),
  promptSequenceStepId: uuid('prompt_sequence_step_id').references(() => promptSequenceSteps.id),
  latencyMs: integer('latency_ms'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  convCreatedIdx: index('messages_conv_created_idx').on(table.conversationId, table.createdAt),
  orgCreatedIdx: index('messages_org_created_idx').on(table.orgId, table.createdAt),
}));

// @deprecated Use promptGraphs instead - this table is being phased out
export const promptSequences = pgTable('prompt_sequences', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  version: integer('version').default(1),
  isActive: boolean('is_active').default(true),
  isPublished: boolean('is_published').default(false),
  triggerConditions: jsonb('trigger_conditions').default({}),
  metadata: jsonb('metadata').default({}),
  createdBy: uuid('created_by').references(() => users.id),
  publishedAt: timestamp('published_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orgNameVersionIdx: uniqueIndex('sequences_org_name_version_idx').on(table.orgId, table.name, table.version),
  orgActiveIdx: index('sequences_org_active_idx').on(table.orgId, table.isActive),
}));

export const stepTypeEnum = pgEnum('step_type', ['prompt', 'condition', 'tool', 'handoff', 'wait', 'branch', 'end']);

// @deprecated Use promptGraphs instead - this table is being phased out
export const promptSequenceSteps = pgTable('prompt_sequence_steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  sequenceId: uuid('sequence_id').references(() => promptSequences.id, { onDelete: 'cascade' }).notNull(),
  orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  stepType: stepTypeEnum('step_type').notNull(),
  orderIndex: integer('order_index').notNull(),
  promptTemplate: text('prompt_template'),
  systemPrompt: text('system_prompt'),
  modelConfig: jsonb('model_config').default({}),
  conditions: jsonb('conditions').default([]),
  nextStepOnSuccess: uuid('next_step_on_success'),
  nextStepOnFailure: uuid('next_step_on_failure'),
  toolConfig: jsonb('tool_config'),
  contextInjectors: jsonb('context_injectors').default([]),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  seqOrderIdx: uniqueIndex('steps_seq_order_idx').on(table.sequenceId, table.orderIndex),
}));

export const providerTypeEnum = pgEnum('provider_type', ['openai', 'anthropic', 'azure', 'google', 'custom']);

export const llmProviders = pgTable('llm_providers', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  providerType: providerTypeEnum('provider_type').notNull(),
  apiKeyEncrypted: text('api_key_encrypted'),
  baseUrl: text('base_url'),
  defaultModel: varchar('default_model', { length: 100 }),
  models: jsonb('models').default([]),
  routingWeight: integer('routing_weight').default(100),
  fallbackOrder: integer('fallback_order').default(0),
  isActive: boolean('is_active').default(true),
  rateLimits: jsonb('rate_limits').default({}),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orgActiveIdx: index('providers_org_active_idx').on(table.orgId, table.isActive),
}));

export const providerUsageLogs = pgTable('provider_usage_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  providerId: uuid('provider_id').references(() => llmProviders.id, { onDelete: 'cascade' }).notNull(),
  orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }).notNull(),
  conversationId: uuid('conversation_id').references(() => conversations.id),
  messageId: uuid('message_id').references(() => messages.id),
  model: varchar('model', { length: 100 }).notNull(),
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  totalTokens: integer('total_tokens'),
  latencyMs: integer('latency_ms'),
  success: boolean('success').default(true),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  orgCreatedIdx: index('usage_org_created_idx').on(table.orgId, table.createdAt),
  providerCreatedIdx: index('usage_provider_created_idx').on(table.providerId, table.createdAt),
}));

export const handoffStatusEnum = pgEnum('handoff_status', ['pending', 'assigned', 'in_progress', 'resolved', 'cancelled', 'expired']);

export const handoffRequests = pgTable('handoff_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }).notNull(),
  orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }).notNull(),
  requestedBy: uuid('requested_by').references(() => users.id),
  assignedTo: uuid('assigned_to').references(() => users.id),
  status: handoffStatusEnum('status').default('pending'),
  reason: text('reason'),
  priority: integer('priority').default(0),
  contextSummary: text('context_summary'),
  contextSnapshotId: uuid('context_snapshot_id').references(() => contextSnapshots.id),
  tags: jsonb('tags').default([]),
  metadata: jsonb('metadata').default({}),
  assignedAt: timestamp('assigned_at'),
  resolvedAt: timestamp('resolved_at'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orgStatusIdx: index('handoff_org_status_idx').on(table.orgId, table.status),
  assignedStatusIdx: index('handoff_assigned_status_idx').on(table.assignedTo, table.status),
}));

export const contextSourceTypeEnum = pgEnum('context_source_type', ['identity', 'catalog', 'custom', 'webhook', 'database']);

export const contextSources = pgTable('context_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  sourceType: contextSourceTypeEnum('source_type').notNull(),
  config: jsonb('config').default({}),
  isActive: boolean('is_active').default(true),
  refreshInterval: integer('refresh_interval'),
  lastRefreshedAt: timestamp('last_refreshed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const inferredContexts = pgTable('inferred_contexts', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }).notNull(),
  orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }).notNull(),
  contextType: varchar('context_type', { length: 100 }).notNull(),
  data: jsonb('data').notNull(),
  confidence: integer('confidence'),
  sourceId: uuid('source_id').references(() => contextSources.id),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  convTypeIdx: index('inferred_conv_type_idx').on(table.conversationId, table.contextType),
}));

export const catalogBindings = pgTable('catalog_bindings', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }).notNull(),
  catalogItemId: varchar('catalog_item_id', { length: 255 }).notNull(),
  catalogItemType: varchar('catalog_item_type', { length: 100 }).notNull(),
  localAlias: varchar('local_alias', { length: 255 }),
  config: jsonb('config').default({}),
  isActive: boolean('is_active').default(true),
  syncedAt: timestamp('synced_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orgItemIdx: uniqueIndex('catalog_org_item_idx').on(table.orgId, table.catalogItemId),
}));

export const messagingChannelTypeEnum = pgEnum('messaging_channel_type', ['email', 'sms', 'webhook', 'slack', 'teams', 'push']);

export const messagingChannels = pgTable('messaging_channels', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  channelType: messagingChannelTypeEnum('channel_type').notNull(),
  config: jsonb('config').default({}),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const notificationStatusEnum = pgEnum('notification_status', ['pending', 'sent', 'delivered', 'failed', 'cancelled']);

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }).notNull(),
  channelId: uuid('channel_id').references(() => messagingChannels.id),
  recipientId: uuid('recipient_id').references(() => users.id),
  conversationId: uuid('conversation_id').references(() => conversations.id),
  notificationType: varchar('notification_type', { length: 100 }).notNull(),
  subject: varchar('subject', { length: 500 }),
  content: text('content').notNull(),
  metadata: jsonb('metadata').default({}),
  status: notificationStatusEnum('status').default('pending'),
  sentAt: timestamp('sent_at'),
  deliveredAt: timestamp('delivered_at'),
  failedAt: timestamp('failed_at'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  orgStatusIdx: index('notifications_org_status_idx').on(table.orgId, table.status),
  recipientCreatedIdx: index('notifications_recipient_created_idx').on(table.recipientId, table.createdAt),
}));

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id),
  action: varchar('action', { length: 100 }).notNull(),
  resourceType: varchar('resource_type', { length: 100 }).notNull(),
  resourceId: uuid('resource_id'),
  changes: jsonb('changes'),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  orgCreatedIdx: index('audit_org_created_idx').on(table.orgId, table.createdAt),
  userCreatedIdx: index('audit_user_created_idx').on(table.userId, table.createdAt),
  resourceIdx: index('audit_resource_idx').on(table.resourceType, table.resourceId),
}));

export const orgsRelations = relations(orgs, ({ many }) => ({
  memberships: many(orgMemberships),
  conversations: many(conversations),
  promptSequences: many(promptSequences),
  llmProviders: many(llmProviders),
  catalogBindings: many(catalogBindings),
  messagingChannels: many(messagingChannels),
}));

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(orgMemberships),
  participations: many(conversationParticipants),
}));

export const orgMembershipsRelations = relations(orgMemberships, ({ one }) => ({
  org: one(orgs, { fields: [orgMemberships.orgId], references: [orgs.id] }),
  user: one(users, { fields: [orgMemberships.userId], references: [users.id] }),
  inviter: one(users, { fields: [orgMemberships.invitedBy], references: [users.id] }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  org: one(orgs, { fields: [conversations.orgId], references: [orgs.id] }),
  currentSequence: one(promptSequences, { fields: [conversations.currentSequenceId], references: [promptSequences.id] }),
  currentStep: one(promptSequenceSteps, { fields: [conversations.currentStepId], references: [promptSequenceSteps.id] }),
  participants: many(conversationParticipants),
  events: many(conversationEvents),
  messages: many(messages),
  handoffRequests: many(handoffRequests),
  inferredContexts: many(inferredContexts),
  contextSnapshots: many(contextSnapshots),
}));

export const conversationParticipantsRelations = relations(conversationParticipants, ({ one }) => ({
  conversation: one(conversations, { fields: [conversationParticipants.conversationId], references: [conversations.id] }),
  org: one(orgs, { fields: [conversationParticipants.orgId], references: [orgs.id] }),
  user: one(users, { fields: [conversationParticipants.userId], references: [users.id] }),
}));

export const conversationEventsRelations = relations(conversationEvents, ({ one }) => ({
  conversation: one(conversations, { fields: [conversationEvents.conversationId], references: [conversations.id] }),
  org: one(orgs, { fields: [conversationEvents.orgId], references: [orgs.id] }),
  actor: one(users, { fields: [conversationEvents.actorId], references: [users.id] }),
}));

export const contextSnapshotsRelations = relations(contextSnapshots, ({ one }) => ({
  conversation: one(conversations, { fields: [contextSnapshots.conversationId], references: [conversations.id] }),
  org: one(orgs, { fields: [contextSnapshots.orgId], references: [orgs.id] }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, { fields: [messages.conversationId], references: [conversations.id] }),
  org: one(orgs, { fields: [messages.orgId], references: [orgs.id] }),
  participant: one(conversationParticipants, { fields: [messages.participantId], references: [conversationParticipants.id] }),
  provider: one(llmProviders, { fields: [messages.providerId], references: [llmProviders.id] }),
  promptStep: one(promptSequenceSteps, { fields: [messages.promptSequenceStepId], references: [promptSequenceSteps.id] }),
}));

export const promptSequencesRelations = relations(promptSequences, ({ one, many }) => ({
  org: one(orgs, { fields: [promptSequences.orgId], references: [orgs.id] }),
  createdByUser: one(users, { fields: [promptSequences.createdBy], references: [users.id] }),
  steps: many(promptSequenceSteps),
}));

export const promptSequenceStepsRelations = relations(promptSequenceSteps, ({ one }) => ({
  sequence: one(promptSequences, { fields: [promptSequenceSteps.sequenceId], references: [promptSequences.id] }),
  org: one(orgs, { fields: [promptSequenceSteps.orgId], references: [orgs.id] }),
}));

export const llmProvidersRelations = relations(llmProviders, ({ one, many }) => ({
  org: one(orgs, { fields: [llmProviders.orgId], references: [orgs.id] }),
  usageLogs: many(providerUsageLogs),
}));

export const providerUsageLogsRelations = relations(providerUsageLogs, ({ one }) => ({
  provider: one(llmProviders, { fields: [providerUsageLogs.providerId], references: [llmProviders.id] }),
  org: one(orgs, { fields: [providerUsageLogs.orgId], references: [orgs.id] }),
  conversation: one(conversations, { fields: [providerUsageLogs.conversationId], references: [conversations.id] }),
  message: one(messages, { fields: [providerUsageLogs.messageId], references: [messages.id] }),
}));

export const handoffRequestsRelations = relations(handoffRequests, ({ one }) => ({
  conversation: one(conversations, { fields: [handoffRequests.conversationId], references: [conversations.id] }),
  org: one(orgs, { fields: [handoffRequests.orgId], references: [orgs.id] }),
  requestedByUser: one(users, { fields: [handoffRequests.requestedBy], references: [users.id] }),
  assignedUser: one(users, { fields: [handoffRequests.assignedTo], references: [users.id] }),
  contextSnapshot: one(contextSnapshots, { fields: [handoffRequests.contextSnapshotId], references: [contextSnapshots.id] }),
}));

export const contextSourcesRelations = relations(contextSources, ({ one, many }) => ({
  org: one(orgs, { fields: [contextSources.orgId], references: [orgs.id] }),
  inferredContexts: many(inferredContexts),
}));

export const inferredContextsRelations = relations(inferredContexts, ({ one }) => ({
  conversation: one(conversations, { fields: [inferredContexts.conversationId], references: [conversations.id] }),
  org: one(orgs, { fields: [inferredContexts.orgId], references: [orgs.id] }),
  source: one(contextSources, { fields: [inferredContexts.sourceId], references: [contextSources.id] }),
}));

export const catalogBindingsRelations = relations(catalogBindings, ({ one }) => ({
  org: one(orgs, { fields: [catalogBindings.orgId], references: [orgs.id] }),
}));

export const messagingChannelsRelations = relations(messagingChannels, ({ one, many }) => ({
  org: one(orgs, { fields: [messagingChannels.orgId], references: [orgs.id] }),
  notifications: many(notifications),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  org: one(orgs, { fields: [notifications.orgId], references: [orgs.id] }),
  channel: one(messagingChannels, { fields: [notifications.channelId], references: [messagingChannels.id] }),
  recipient: one(users, { fields: [notifications.recipientId], references: [users.id] }),
  conversation: one(conversations, { fields: [notifications.conversationId], references: [conversations.id] }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  org: one(orgs, { fields: [auditLogs.orgId], references: [orgs.id] }),
  user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
}));

// ============================================================================
// GRAPH-BASED PROMPT MODEL (New - replaces promptSequences/promptSequenceSteps)
// ============================================================================

export const promptGraphs = pgTable('prompt_graphs', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  version: integer('version').default(1).notNull(),
  graphJson: jsonb('graph_json').notNull(), // { components: [], edges: [] }
  isPublished: boolean('is_published').default(false),
  triggerConditions: jsonb('trigger_conditions').default({}),
  logLevel: varchar('log_level', { length: 20 }).default('warn'), // debug, info, warn, error
  createdBy: uuid('created_by').references(() => users.id),
  publishedAt: timestamp('published_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orgNameVersionIdx: uniqueIndex('graphs_org_name_version_idx').on(table.orgId, table.name, table.version),
  orgPublishedIdx: index('graphs_org_published_idx').on(table.orgId, table.isPublished),
}));

export const compiledGraphs = pgTable('compiled_graphs', {
  id: uuid('id').primaryKey().defaultRandom(),
  graphId: uuid('graph_id').references(() => promptGraphs.id, { onDelete: 'cascade' }).notNull(),
  version: integer('version').notNull(),
  bytecode: text('bytecode').notNull(), // Compiled/IR representation
  checksum: varchar('checksum', { length: 64 }),
  compiledAt: timestamp('compiled_at').defaultNow().notNull(),
}, (table) => ({
  graphVersionIdx: uniqueIndex('compiled_graph_version_idx').on(table.graphId, table.version),
}));

export const graphRunStatusEnum = pgEnum('graph_run_status', ['running', 'paused', 'waiting', 'completed', 'failed', 'cancelled']);
export const graphRunPriorityEnum = pgEnum('graph_run_priority', ['low', 'normal', 'high', 'critical']);

export const graphRuns = pgTable('graph_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  graphId: uuid('graph_id').references(() => promptGraphs.id, { onDelete: 'set null' }),
  compiledGraphId: uuid('compiled_graph_id').references(() => compiledGraphs.id),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }),
  orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }).notNull(),
  traceId: varchar('trace_id', { length: 64 }),
  state: jsonb('state').default({}), // Current positions, outputs, queued messages
  status: graphRunStatusEnum('status').default('running'),
  priority: graphRunPriorityEnum('priority').default('normal'),
  metadata: jsonb('metadata').default({}),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orgStatusIdx: index('runs_org_status_idx').on(table.orgId, table.status),
  conversationIdx: index('runs_conversation_idx').on(table.conversationId),
  traceIdx: index('runs_trace_idx').on(table.traceId),
}));

export const runLogLevelEnum = pgEnum('run_log_level', ['debug', 'info', 'warn', 'error']);

export const runLogs = pgTable('run_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').references(() => graphRuns.id, { onDelete: 'cascade' }).notNull(),
  level: runLogLevelEnum('level').default('info'),
  nodeId: varchar('node_id', { length: 100 }),
  message: text('message').notNull(),
  data: jsonb('data'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  runLevelIdx: index('logs_run_level_idx').on(table.runId, table.level),
  runCreatedIdx: index('logs_run_created_idx').on(table.runId, table.createdAt),
}));

// ============================================================================
// MESSAGING INTEGRATION
// ============================================================================

export const principalTypeEnum = pgEnum('principal_type', ['user', 'agent', 'service', 'assistant']);

export const agentPrincipals = pgTable('bot_principals', {
  id: uuid('id').primaryKey().defaultRandom(),
  principalId: varchar('principal_id', { length: 255 }).notNull().unique(),
  orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }).notNull(),
  principalType: principalTypeEnum('principal_type').default('agent'),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  defaultGraphId: uuid('default_graph_id').references(() => promptGraphs.id),
  capabilities: jsonb('capabilities').default([]), // ['cap:messaging.interrupt', 'cap:messaging.route']
  webhooks: jsonb('webhooks').default({}), // { message: 'url', control: 'url' }
  assistantConfig: jsonb('assistant_config').default({}), // For assistant-type principals: { endpoint, model, etc. }
  isActive: boolean('is_active').default(true),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orgPrincipalIdx: uniqueIndex('bot_org_principal_idx').on(table.orgId, table.principalId),
  principalTypeIdx: index('bot_principal_type_idx').on(table.principalType),
}));

// Backward compatibility alias
export const actorPrincipals = agentPrincipals;

// Relations for new tables
export const promptGraphsRelations = relations(promptGraphs, ({ one, many }) => ({
  org: one(orgs, { fields: [promptGraphs.orgId], references: [orgs.id] }),
  createdByUser: one(users, { fields: [promptGraphs.createdBy], references: [users.id] }),
  compiledVersions: many(compiledGraphs),
  runs: many(graphRuns),
}));

export const compiledGraphsRelations = relations(compiledGraphs, ({ one }) => ({
  graph: one(promptGraphs, { fields: [compiledGraphs.graphId], references: [promptGraphs.id] }),
}));

export const graphRunsRelations = relations(graphRuns, ({ one, many }) => ({
  graph: one(promptGraphs, { fields: [graphRuns.graphId], references: [promptGraphs.id] }),
  compiledGraph: one(compiledGraphs, { fields: [graphRuns.compiledGraphId], references: [compiledGraphs.id] }),
  conversation: one(conversations, { fields: [graphRuns.conversationId], references: [conversations.id] }),
  org: one(orgs, { fields: [graphRuns.orgId], references: [orgs.id] }),
  logs: many(runLogs),
}));

export const runLogsRelations = relations(runLogs, ({ one }) => ({
  run: one(graphRuns, { fields: [runLogs.runId], references: [graphRuns.id] }),
}));

export const agentPrincipalsRelations = relations(agentPrincipals, ({ one }) => ({
  org: one(orgs, { fields: [agentPrincipals.orgId], references: [orgs.id] }),
  defaultGraph: one(promptGraphs, { fields: [agentPrincipals.defaultGraphId], references: [promptGraphs.id] }),
}));

// Backward compatibility alias
export const actorPrincipalsRelations = agentPrincipalsRelations;
