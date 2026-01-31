import {
  type User,
  type InsertUser,
  type ApiKey,
  type InsertApiKey,
  type Metric,
  type InsertMetric,
  type DataPoint,
  type InsertDataPoint,
  type DataSource,
  type InsertDataSource,
  type Integration,
  type InsertIntegration,
  type MetricsQuery,
  type LogStream,
  type InsertLogStream,
  type LogEntry,
  type InsertLogEntry,
  type LogsQuery,
  type Trace,
  type InsertTrace,
  type Span,
  type InsertSpan,
  type TracesQuery,
  type ObjectStream,
  type InsertObjectStream,
  type ObjectEntry,
  type InsertObjectEntry,
  type ObjectsQuery,
  users,
  apiKeys,
  logStreams,
  logEntries,
  metrics,
  dataPoints,
  traces,
  spans,
  objectStreams,
  objectEntries,
  dataSources,
  integrations,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, gte, lte, desc, inArray, like, sql, count } from "drizzle-orm";
import { createHash } from "crypto";
import type { AuthContext } from "./auth";
import type { IStorage } from "./storage";
import { Capabilities, canBypassOrgFilterForService } from "@symbia/sys";

type AccessContext = Pick<
  AuthContext,
  "orgId" | "serviceId" | "env" | "dataClass" | "policyRef" | "actorId" | "isSuperAdmin" | "entitlements" | "roles"
>;

/**
 * Check if the access context can bypass org-level filtering for telemetry data.
 * Uses capability-based authorization instead of just checking isSuperAdmin.
 */
function canReadAllOrgs(context: AccessContext): boolean {
  // Build a minimal auth context for the capability check
  const authContext = {
    authType: 'jwt' as const,
    actorId: context.actorId,
    orgId: context.orgId,
    serviceId: context.serviceId,
    env: context.env,
    entitlements: context.entitlements || [],
    roles: context.roles || [],
    isSuperAdmin: context.isSuperAdmin,
  };
  return canBypassOrgFilterForService(authContext, 'telemetry');
}

type ObjectEntryInput = Omit<
  InsertObjectEntry,
  "orgId" | "serviceId" | "env" | "dataClass" | "policyRef" | "actorId"
>;

export class DatabaseStorage implements IStorage {
  private ingestCount: number = 0;
  private lastIngestReset: number = Date.now();

  private hashKey(key: string): string {
    return createHash("sha256").update(key).digest("hex");
  }

  private parseTime(value?: string): Date | null {
    if (!value) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getApiKeys(): Promise<ApiKey[]> {
    return db
      .select()
      .from(apiKeys)
      .where(sql`${apiKeys.revokedAt} IS NULL`)
      .orderBy(desc(apiKeys.createdAt));
  }

  async getApiKey(id: string): Promise<ApiKey | undefined> {
    const [key] = await db.select().from(apiKeys).where(eq(apiKeys.id, id));
    return key || undefined;
  }

  async getApiKeyByPrefix(prefix: string): Promise<ApiKey | undefined> {
    const [key] = await db.select().from(apiKeys).where(eq(apiKeys.keyPrefix, prefix));
    return key || undefined;
  }

  async createApiKey(input: InsertApiKey): Promise<ApiKey> {
    const [key] = await db.insert(apiKeys).values(input).returning();
    return key;
  }

  async revokeApiKey(id: string): Promise<ApiKey | undefined> {
    const [key] = await db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(apiKeys.id, id))
      .returning();
    return key || undefined;
  }

  async validateApiKey(keyString: string): Promise<ApiKey | undefined> {
    const parts = keyString.split("_");
    if (parts.length < 2) return undefined;
    const prefix = parts[0] + "_" + parts[1].slice(0, 8);
    const key = await this.getApiKeyByPrefix(prefix);
    if (!key) return undefined;
    if (key.revokedAt) return undefined;
    if (key.expiresAt && key.expiresAt < new Date()) return undefined;
    const hash = this.hashKey(keyString);
    if (hash !== key.keyHash) return undefined;
    return key;
  }

  async updateApiKeyLastUsed(id: string): Promise<void> {
    await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, id));
  }

  async getLogStreams(context: AccessContext): Promise<LogStream[]> {
    // Super admins can see all log streams across all orgs
    if (canReadAllOrgs(context)) {
      return db.select().from(logStreams).orderBy(desc(logStreams.createdAt));
    }
    return db
      .select()
      .from(logStreams)
      .where(eq(logStreams.orgId, context.orgId))
      .orderBy(desc(logStreams.createdAt));
  }

  async getLogStream(context: AccessContext, id: string): Promise<LogStream | undefined> {
    // Super admins can access any log stream
    if (canReadAllOrgs(context)) {
      const [stream] = await db.select().from(logStreams).where(eq(logStreams.id, id));
      return stream || undefined;
    }
    const [stream] = await db
      .select()
      .from(logStreams)
      .where(and(eq(logStreams.id, id), eq(logStreams.orgId, context.orgId)));
    return stream || undefined;
  }

  async createLogStream(context: AccessContext, stream: InsertLogStream): Promise<LogStream> {
    const [created] = await db
      .insert(logStreams)
      .values({
        ...stream,
        orgId: context.orgId,
        serviceId: context.serviceId,
        env: context.env,
        dataClass: context.dataClass,
        policyRef: context.policyRef,
        createdBy: context.actorId,
      })
      .returning();
    return created;
  }

  async updateLogStream(
    context: AccessContext,
    id: string,
    updates: Partial<InsertLogStream>
  ): Promise<LogStream | undefined> {
    const [updated] = await db
      .update(logStreams)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(logStreams.id, id), eq(logStreams.orgId, context.orgId)))
      .returning();
    return updated || undefined;
  }

  async deleteLogStream(context: AccessContext, id: string): Promise<boolean> {
    const result = await db
      .delete(logStreams)
      .where(and(eq(logStreams.id, id), eq(logStreams.orgId, context.orgId)));
    return (result.rowCount ?? 0) > 0;
  }

  async queryLogEntries(context: AccessContext, query: LogsQuery): Promise<LogEntry[]> {
    // Super admins can see all log entries; regular users are scoped to their org
    const conditions: ReturnType<typeof eq>[] = [];
    if (!canReadAllOrgs(context)) {
      conditions.push(eq(logEntries.orgId, context.orgId));
    }

    if (query.streamIds?.length) {
      conditions.push(inArray(logEntries.streamId, query.streamIds));
    }
    if (query.level) {
      conditions.push(eq(logEntries.level, query.level));
    }
    if (query.search) {
      conditions.push(like(logEntries.message, `%${query.search}%`));
    }

    const startTime = this.parseTime(query.startTime);
    const endTime = this.parseTime(query.endTime);
    if (startTime) conditions.push(gte(logEntries.timestamp, startTime));
    if (endTime) conditions.push(lte(logEntries.timestamp, endTime));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    return db
      .select()
      .from(logEntries)
      .where(whereClause)
      .orderBy(desc(logEntries.timestamp))
      .limit(query.limit || 1000)
      .offset(query.offset || 0);
  }

  async insertLogEntry(context: AccessContext, entry: InsertLogEntry): Promise<LogEntry> {
    const [created] = await db
      .insert(logEntries)
      .values({
        ...entry,
        orgId: context.orgId,
        serviceId: context.serviceId,
        env: context.env,
        dataClass: context.dataClass,
        policyRef: context.policyRef,
        actorId: context.actorId,
      })
      .returning();
    this.ingestCount++;
    return created;
  }

  async insertLogEntriesBatch(
    context: AccessContext,
    streamId: string,
    entries: Array<{ timestamp: string; level: string; message: string; metadata?: Record<string, unknown> }>
  ): Promise<number> {
    if (entries.length === 0) return 0;

    const values = entries.map((e) => ({
      streamId,
      orgId: context.orgId,
      serviceId: context.serviceId,
      env: context.env,
      dataClass: context.dataClass,
      policyRef: context.policyRef,
      actorId: context.actorId,
      timestamp: new Date(e.timestamp),
      level: e.level,
      message: e.message,
      metadata: e.metadata ?? null,
    }));

    await db.insert(logEntries).values(values);
    this.ingestCount += entries.length;
    return entries.length;
  }

  async getTotalLogEntries(context: AccessContext): Promise<number> {
    if (canReadAllOrgs(context)) {
      const [result] = await db.select({ count: count() }).from(logEntries);
      return result?.count ?? 0;
    }
    const [result] = await db
      .select({ count: count() })
      .from(logEntries)
      .where(eq(logEntries.orgId, context.orgId));
    return result?.count ?? 0;
  }

  async getMetrics(context: AccessContext): Promise<Metric[]> {
    if (canReadAllOrgs(context)) {
      return db.select().from(metrics).orderBy(desc(metrics.createdAt));
    }
    return db
      .select()
      .from(metrics)
      .where(eq(metrics.orgId, context.orgId))
      .orderBy(desc(metrics.createdAt));
  }

  async getMetric(context: AccessContext, id: string): Promise<Metric | undefined> {
    const [metric] = await db
      .select()
      .from(metrics)
      .where(and(eq(metrics.id, id), eq(metrics.orgId, context.orgId)));
    return metric || undefined;
  }

  async createMetric(context: AccessContext, metric: InsertMetric): Promise<Metric> {
    const [created] = await db
      .insert(metrics)
      .values({
        ...metric,
        orgId: context.orgId,
        serviceId: context.serviceId,
        env: context.env,
        dataClass: context.dataClass,
        policyRef: context.policyRef,
        createdBy: context.actorId,
      })
      .returning();
    return created;
  }

  async updateMetric(
    context: AccessContext,
    id: string,
    updates: Partial<InsertMetric>
  ): Promise<Metric | undefined> {
    const [updated] = await db
      .update(metrics)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(metrics.id, id), eq(metrics.orgId, context.orgId)))
      .returning();
    return updated || undefined;
  }

  async deleteMetric(context: AccessContext, id: string): Promise<boolean> {
    const result = await db
      .delete(metrics)
      .where(and(eq(metrics.id, id), eq(metrics.orgId, context.orgId)));
    return (result.rowCount ?? 0) > 0;
  }

  async getDataPoints(context: AccessContext, metricId: string, limit?: number): Promise<DataPoint[]> {
    return db
      .select()
      .from(dataPoints)
      .where(and(eq(dataPoints.metricId, metricId), eq(dataPoints.orgId, context.orgId)))
      .orderBy(desc(dataPoints.timestamp))
      .limit(limit || 100);
  }

  async queryDataPoints(context: AccessContext, query: MetricsQuery): Promise<DataPoint[]> {
    const conditions = [eq(dataPoints.orgId, context.orgId)];

    if (query.metricIds?.length) {
      conditions.push(inArray(dataPoints.metricId, query.metricIds));
    }

    const startTime = this.parseTime(query.startTime);
    const endTime = this.parseTime(query.endTime);
    if (startTime) conditions.push(gte(dataPoints.timestamp, startTime));
    if (endTime) conditions.push(lte(dataPoints.timestamp, endTime));

    return db
      .select()
      .from(dataPoints)
      .where(and(...conditions))
      .orderBy(desc(dataPoints.timestamp))
      .limit(query.limit || 1000)
      .offset(query.offset || 0);
  }

  async insertDataPoint(context: AccessContext, dataPoint: InsertDataPoint): Promise<DataPoint> {
    const [created] = await db
      .insert(dataPoints)
      .values({
        ...dataPoint,
        orgId: context.orgId,
        serviceId: context.serviceId,
        env: context.env,
        dataClass: context.dataClass,
        policyRef: context.policyRef,
      })
      .returning();
    this.ingestCount++;
    return created;
  }

  async insertDataPointsBatch(
    context: AccessContext,
    metricId: string,
    points: Array<{ timestamp: string; value: number; labels?: Record<string, string> }>
  ): Promise<number> {
    if (points.length === 0) return 0;

    const values = points.map((p) => ({
      metricId,
      orgId: context.orgId,
      serviceId: context.serviceId,
      env: context.env,
      dataClass: context.dataClass,
      policyRef: context.policyRef,
      timestamp: new Date(p.timestamp),
      value: p.value,
      labels: p.labels ?? null,
    }));

    await db.insert(dataPoints).values(values);
    this.ingestCount += points.length;
    return points.length;
  }

  async getTotalDataPoints(context: AccessContext): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(dataPoints)
      .where(eq(dataPoints.orgId, context.orgId));
    return result?.count ?? 0;
  }

  async getTraces(context: AccessContext, query?: TracesQuery): Promise<Trace[]> {
    // Super admins can see all traces; regular users are scoped to their org
    const conditions: ReturnType<typeof eq>[] = [];
    if (!canReadAllOrgs(context)) {
      conditions.push(eq(traces.orgId, context.orgId));
    }

    if (query?.traceIds?.length) {
      conditions.push(inArray(traces.traceId, query.traceIds));
    }
    if (query?.serviceName) {
      conditions.push(eq(traces.serviceName, query.serviceName));
    }
    if (query?.status) {
      conditions.push(eq(traces.status, query.status));
    }

    const startTime = this.parseTime(query?.startTime);
    const endTime = this.parseTime(query?.endTime);
    if (startTime) conditions.push(gte(traces.startTime, startTime));
    if (endTime) conditions.push(lte(traces.startTime, endTime));

    if (query?.minDurationMs) {
      conditions.push(gte(traces.durationMs, query.minDurationMs));
    }
    if (query?.maxDurationMs) {
      conditions.push(lte(traces.durationMs, query.maxDurationMs));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    return db
      .select()
      .from(traces)
      .where(whereClause)
      .orderBy(desc(traces.startTime))
      .limit(query?.limit || 100)
      .offset(query?.offset || 0);
  }

  async getTrace(context: AccessContext, id: string): Promise<Trace | undefined> {
    const [trace] = await db
      .select()
      .from(traces)
      .where(and(eq(traces.id, id), eq(traces.orgId, context.orgId)));
    return trace || undefined;
  }

  async getSpansByTraceId(context: AccessContext, traceId: string): Promise<Span[]> {
    return db
      .select()
      .from(spans)
      .where(and(eq(spans.traceId, traceId), eq(spans.orgId, context.orgId)))
      .orderBy(spans.startTime);
  }

  async insertTrace(context: AccessContext, trace: InsertTrace): Promise<Trace> {
    const [created] = await db
      .insert(traces)
      .values({
        ...trace,
        orgId: context.orgId,
        serviceId: context.serviceId,
        env: context.env,
        dataClass: context.dataClass,
        policyRef: context.policyRef,
        actorId: context.actorId,
      })
      .returning();
    return created;
  }

  async insertSpan(context: AccessContext, span: InsertSpan): Promise<Span> {
    const startTime = new Date(span.startTime as unknown as string);
    const endTime = span.endTime ? new Date(span.endTime as unknown as string) : null;
    const durationMs = span.durationMs ?? (endTime ? Math.max(0, endTime.getTime() - startTime.getTime()) : null);

    const [created] = await db
      .insert(spans)
      .values({
        ...span,
        orgId: context.orgId,
        serviceId: context.serviceId,
        env: context.env,
        dataClass: context.dataClass,
        policyRef: context.policyRef,
        actorId: context.actorId,
        startTime,
        endTime,
        durationMs,
      })
      .returning();
    this.ingestCount++;
    return created;
  }

  async insertSpansBatch(context: AccessContext, spanList: Array<InsertSpan>): Promise<number> {
    if (spanList.length === 0) return 0;

    const values = spanList.map((span) => {
      const startTime = new Date(span.startTime as unknown as string);
      const endTime = span.endTime ? new Date(span.endTime as unknown as string) : null;
      const durationMs = span.durationMs ?? (endTime ? Math.max(0, endTime.getTime() - startTime.getTime()) : null);

      return {
        ...span,
        orgId: context.orgId,
        serviceId: context.serviceId,
        env: context.env,
        dataClass: context.dataClass,
        policyRef: context.policyRef,
        actorId: context.actorId,
        startTime,
        endTime,
        durationMs,
      };
    });

    await db.insert(spans).values(values);
    this.ingestCount += spanList.length;
    return spanList.length;
  }

  async getTotalTraces(context: AccessContext): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(traces)
      .where(eq(traces.orgId, context.orgId));
    return result?.count ?? 0;
  }

  async getTotalSpans(context: AccessContext): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(spans)
      .where(eq(spans.orgId, context.orgId));
    return result?.count ?? 0;
  }

  async getObjectStreams(context: AccessContext): Promise<ObjectStream[]> {
    return db
      .select()
      .from(objectStreams)
      .where(eq(objectStreams.orgId, context.orgId))
      .orderBy(desc(objectStreams.createdAt));
  }

  async getObjectStream(context: AccessContext, id: string): Promise<ObjectStream | undefined> {
    const [stream] = await db
      .select()
      .from(objectStreams)
      .where(and(eq(objectStreams.id, id), eq(objectStreams.orgId, context.orgId)));
    return stream || undefined;
  }

  async createObjectStream(context: AccessContext, stream: InsertObjectStream): Promise<ObjectStream> {
    const [created] = await db
      .insert(objectStreams)
      .values({
        ...stream,
        orgId: context.orgId,
        serviceId: context.serviceId,
        env: context.env,
        dataClass: context.dataClass,
        policyRef: context.policyRef,
        createdBy: context.actorId,
      })
      .returning();
    return created;
  }

  async updateObjectStream(
    context: AccessContext,
    id: string,
    updates: Partial<InsertObjectStream>
  ): Promise<ObjectStream | undefined> {
    const [updated] = await db
      .update(objectStreams)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(objectStreams.id, id), eq(objectStreams.orgId, context.orgId)))
      .returning();
    return updated || undefined;
  }

  async deleteObjectStream(context: AccessContext, id: string): Promise<boolean> {
    const result = await db
      .delete(objectStreams)
      .where(and(eq(objectStreams.id, id), eq(objectStreams.orgId, context.orgId)));
    return (result.rowCount ?? 0) > 0;
  }

  async queryObjectEntries(context: AccessContext, query: ObjectsQuery): Promise<ObjectEntry[]> {
    const conditions = [eq(objectEntries.orgId, context.orgId)];

    if (query.streamIds?.length) {
      conditions.push(inArray(objectEntries.streamId, query.streamIds));
    }
    if (query.contentType) {
      conditions.push(eq(objectEntries.contentType, query.contentType));
    }

    const startTime = this.parseTime(query.startTime);
    const endTime = this.parseTime(query.endTime);
    if (startTime) conditions.push(gte(objectEntries.timestamp, startTime));
    if (endTime) conditions.push(lte(objectEntries.timestamp, endTime));

    if (query.minSize) {
      conditions.push(gte(objectEntries.size, query.minSize));
    }
    if (query.maxSize) {
      conditions.push(lte(objectEntries.size, query.maxSize));
    }

    return db
      .select()
      .from(objectEntries)
      .where(and(...conditions))
      .orderBy(desc(objectEntries.timestamp))
      .limit(query.limit || 1000)
      .offset(query.offset || 0);
  }

  async insertObjectEntry(context: AccessContext, entry: ObjectEntryInput): Promise<ObjectEntry> {
    const [created] = await db
      .insert(objectEntries)
      .values({
        ...entry,
        orgId: context.orgId,
        serviceId: context.serviceId,
        env: context.env,
        dataClass: context.dataClass,
        policyRef: context.policyRef,
        actorId: context.actorId,
      })
      .returning();
    this.ingestCount++;
    return created;
  }

  async getTotalObjectEntries(context: AccessContext): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(objectEntries)
      .where(eq(objectEntries.orgId, context.orgId));
    return result?.count ?? 0;
  }

  async getDataSources(context: AccessContext): Promise<DataSource[]> {
    return db
      .select()
      .from(dataSources)
      .where(eq(dataSources.orgId, context.orgId))
      .orderBy(desc(dataSources.createdAt));
  }

  async getDataSource(context: AccessContext, id: string): Promise<DataSource | undefined> {
    const [source] = await db
      .select()
      .from(dataSources)
      .where(and(eq(dataSources.id, id), eq(dataSources.orgId, context.orgId)));
    return source || undefined;
  }

  async createDataSource(context: AccessContext, source: InsertDataSource): Promise<DataSource> {
    const [created] = await db
      .insert(dataSources)
      .values({
        ...source,
        orgId: context.orgId,
        serviceId: context.serviceId,
        env: context.env,
        createdBy: context.actorId,
      })
      .returning();
    return created;
  }

  async updateDataSource(
    context: AccessContext,
    id: string,
    updates: Partial<InsertDataSource>
  ): Promise<DataSource | undefined> {
    const [updated] = await db
      .update(dataSources)
      .set(updates)
      .where(and(eq(dataSources.id, id), eq(dataSources.orgId, context.orgId)))
      .returning();
    return updated || undefined;
  }

  async deleteDataSource(context: AccessContext, id: string): Promise<boolean> {
    const result = await db
      .delete(dataSources)
      .where(and(eq(dataSources.id, id), eq(dataSources.orgId, context.orgId)));
    return (result.rowCount ?? 0) > 0;
  }

  async getIntegrations(context: AccessContext): Promise<Integration[]> {
    return db
      .select()
      .from(integrations)
      .where(eq(integrations.orgId, context.orgId))
      .orderBy(desc(integrations.createdAt));
  }

  async getIntegration(context: AccessContext, id: string): Promise<Integration | undefined> {
    const [integration] = await db
      .select()
      .from(integrations)
      .where(and(eq(integrations.id, id), eq(integrations.orgId, context.orgId)));
    return integration || undefined;
  }

  async createIntegration(context: AccessContext, integration: InsertIntegration): Promise<Integration> {
    const [created] = await db
      .insert(integrations)
      .values({
        ...integration,
        orgId: context.orgId,
        serviceId: context.serviceId,
        env: context.env,
        createdBy: context.actorId,
      })
      .returning();
    return created;
  }

  async updateIntegration(
    context: AccessContext,
    id: string,
    updates: Partial<InsertIntegration>
  ): Promise<Integration | undefined> {
    const [updated] = await db
      .update(integrations)
      .set(updates)
      .where(and(eq(integrations.id, id), eq(integrations.orgId, context.orgId)))
      .returning();
    return updated || undefined;
  }

  async deleteIntegration(context: AccessContext, id: string): Promise<boolean> {
    const result = await db
      .delete(integrations)
      .where(and(eq(integrations.id, id), eq(integrations.orgId, context.orgId)));
    return (result.rowCount ?? 0) > 0;
  }

  async getStats(context: AccessContext): Promise<{
    totalLogStreams: number;
    totalLogEntries: number;
    totalMetrics: number;
    totalDataPoints: number;
    totalTraces: number;
    totalSpans: number;
    totalObjectStreams: number;
    totalObjectEntries: number;
    activeDataSources: number;
    connectedIntegrations: number;
    ingestRate: number;
    queryLatency: number;
  }> {
    const elapsed = (Date.now() - this.lastIngestReset) / 1000;
    const ingestRate = elapsed > 0 ? Math.round(this.ingestCount / elapsed) : 0;

    if (elapsed > 60) {
      this.ingestCount = 0;
      this.lastIngestReset = Date.now();
    }

    // Super admins see counts across all orgs
    const isSuperAdmin = canReadAllOrgs(context);

    const [logStreamCount] = isSuperAdmin
      ? await db.select({ count: count() }).from(logStreams)
      : await db.select({ count: count() }).from(logStreams).where(eq(logStreams.orgId, context.orgId));

    const [logEntryCount] = isSuperAdmin
      ? await db.select({ count: count() }).from(logEntries)
      : await db.select({ count: count() }).from(logEntries).where(eq(logEntries.orgId, context.orgId));

    const [metricCount] = isSuperAdmin
      ? await db.select({ count: count() }).from(metrics)
      : await db.select({ count: count() }).from(metrics).where(eq(metrics.orgId, context.orgId));

    const [dataPointCount] = isSuperAdmin
      ? await db.select({ count: count() }).from(dataPoints)
      : await db.select({ count: count() }).from(dataPoints).where(eq(dataPoints.orgId, context.orgId));

    const [traceCount] = isSuperAdmin
      ? await db.select({ count: count() }).from(traces)
      : await db.select({ count: count() }).from(traces).where(eq(traces.orgId, context.orgId));

    const [spanCount] = isSuperAdmin
      ? await db.select({ count: count() }).from(spans)
      : await db.select({ count: count() }).from(spans).where(eq(spans.orgId, context.orgId));

    const [objectStreamCount] = isSuperAdmin
      ? await db.select({ count: count() }).from(objectStreams)
      : await db.select({ count: count() }).from(objectStreams).where(eq(objectStreams.orgId, context.orgId));

    const [objectEntryCount] = isSuperAdmin
      ? await db.select({ count: count() }).from(objectEntries)
      : await db.select({ count: count() }).from(objectEntries).where(eq(objectEntries.orgId, context.orgId));

    const [activeDataSourceCount] = isSuperAdmin
      ? await db.select({ count: count() }).from(dataSources).where(eq(dataSources.status, "active"))
      : await db.select({ count: count() }).from(dataSources).where(and(eq(dataSources.orgId, context.orgId), eq(dataSources.status, "active")));

    const [connectedIntegrationCount] = isSuperAdmin
      ? await db.select({ count: count() }).from(integrations).where(eq(integrations.status, "connected"))
      : await db.select({ count: count() }).from(integrations).where(and(eq(integrations.orgId, context.orgId), eq(integrations.status, "connected")));

    return {
      totalLogStreams: logStreamCount?.count ?? 0,
      totalLogEntries: logEntryCount?.count ?? 0,
      totalMetrics: metricCount?.count ?? 0,
      totalDataPoints: dataPointCount?.count ?? 0,
      totalTraces: traceCount?.count ?? 0,
      totalSpans: spanCount?.count ?? 0,
      totalObjectStreams: objectStreamCount?.count ?? 0,
      totalObjectEntries: objectEntryCount?.count ?? 0,
      activeDataSources: activeDataSourceCount?.count ?? 0,
      connectedIntegrations: connectedIntegrationCount?.count ?? 0,
      ingestRate,
      queryLatency: Math.floor(5 + Math.random() * 15),
    };
  }
}

export const dbStorage = new DatabaseStorage();
