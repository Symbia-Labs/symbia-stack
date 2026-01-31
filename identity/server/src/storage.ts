import {
  users, organizations, memberships, plans, entitlements, sessions, auditLogs,
  projects, applications, services, applicationServices, entitlementTranches, scopedEntitlements,
  passwordResetTokens, userEntitlements, userRoles, apiKeys, agents, userCredentials,
  entities, entityAliases, entityInstances,
  type User, type InsertUser, type Organization, type InsertOrganization,
  type Membership, type InsertMembership, type Plan, type InsertPlan,
  type Entitlement, type InsertEntitlement, type Session, type InsertSession,
  type AuditLog, type InsertAuditLog, type MembershipWithUser,
  type Project, type InsertProject, type Application, type InsertApplication,
  type Service, type InsertService, type ApplicationService, type InsertApplicationService,
  type EntitlementTranche, type InsertEntitlementTranche,
  type ScopedEntitlement, type InsertScopedEntitlement, type ScopeType,
  type PasswordResetToken, type InsertPasswordResetToken,
  type UserEntitlement, type InsertUserEntitlement,
  type UserRole, type InsertUserRole,
  type ApiKey, type InsertApiKey,
  type Agent, type InsertAgent,
  type UserCredential, type InsertUserCredential,
  type Entity, type InsertEntity,
  type EntityAlias, type InsertEntityAlias,
  type EntityInstance, type InsertEntityInstance
} from "@shared/schema";
import { db } from "./db";
import { eq, and, or, like, inArray, isNull } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: string): Promise<void>;

  // Organizations
  getOrganization(id: string): Promise<Organization | undefined>;
  getOrganizationBySlug(slug: string): Promise<Organization | undefined>;
  getAllOrganizations(): Promise<Organization[]>;
  createOrganization(org: InsertOrganization): Promise<Organization>;
  createOrganizationWithId(org: InsertOrganization & { id: string }): Promise<Organization>;
  updateOrganization(id: string, data: Partial<InsertOrganization>): Promise<Organization | undefined>;
  deleteOrganization(id: string): Promise<void>;

  // Memberships
  getMembership(id: string): Promise<Membership | undefined>;
  getMembershipByUserAndOrg(userId: string, orgId: string): Promise<Membership | undefined>;
  getMembershipsByUser(userId: string): Promise<Membership[]>;
  getMembershipsByOrg(orgId: string): Promise<MembershipWithUser[]>;
  createMembership(membership: InsertMembership): Promise<Membership>;
  updateMembership(id: string, data: Partial<InsertMembership>): Promise<Membership | undefined>;
  deleteMembership(id: string): Promise<void>;

  // Plans
  getPlan(id: string): Promise<Plan | undefined>;
  getPlanByName(name: string): Promise<Plan | undefined>;
  getAllPlans(): Promise<Plan[]>;
  createPlan(plan: InsertPlan): Promise<Plan>;
  updatePlan(id: string, data: Partial<InsertPlan>): Promise<Plan | undefined>;

  // Entitlements
  getEntitlementsByOrg(orgId: string): Promise<Entitlement[]>;
  createEntitlement(entitlement: InsertEntitlement): Promise<Entitlement>;
  updateEntitlement(id: string, data: Partial<InsertEntitlement>): Promise<Entitlement | undefined>;

  // Sessions
  getSession(id: string): Promise<Session | undefined>;
  getSessionByTokenHash(tokenHash: string): Promise<Session | undefined>;
  createSession(session: InsertSession): Promise<Session>;
  deleteSession(id: string): Promise<void>;
  deleteSessionsByUser(userId: string): Promise<void>;

  // Audit Logs
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogsByOrg(orgId: string): Promise<AuditLog[]>;
  getAllAuditLogs(): Promise<AuditLog[]>;

  // Projects
  getProject(id: string): Promise<Project | undefined>;
  getProjectsByOrg(orgId: string): Promise<Project[]>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, data: Partial<InsertProject>): Promise<Project | undefined>;
  deleteProject(id: string): Promise<void>;

  // Applications
  getApplication(id: string): Promise<Application | undefined>;
  getApplicationsByProject(projectId: string): Promise<Application[]>;
  getApplicationsByOrg(orgId: string): Promise<Application[]>;
  createApplication(app: InsertApplication): Promise<Application>;
  updateApplication(id: string, data: Partial<InsertApplication>): Promise<Application | undefined>;
  deleteApplication(id: string): Promise<void>;

  // Services
  getService(id: string): Promise<Service | undefined>;
  getServicesByProject(projectId: string): Promise<Service[]>;
  getServicesByOrg(orgId: string): Promise<Service[]>;
  createService(service: InsertService): Promise<Service>;
  updateService(id: string, data: Partial<InsertService>): Promise<Service | undefined>;
  deleteService(id: string): Promise<void>;

  // Application-Service Links
  linkApplicationService(appId: string, serviceId: string): Promise<ApplicationService>;
  unlinkApplicationService(appId: string, serviceId: string): Promise<void>;
  getServicesByApplication(appId: string): Promise<Service[]>;

  // Entitlement Tranches
  getEntitlementTranche(id: string): Promise<EntitlementTranche | undefined>;
  getEntitlementTranchesByPlan(planId: string): Promise<EntitlementTranche[]>;
  createEntitlementTranche(tranche: InsertEntitlementTranche): Promise<EntitlementTranche>;

  // Scoped Entitlements
  getScopedEntitlement(id: string): Promise<ScopedEntitlement | undefined>;
  getScopedEntitlementsByScope(scopeType: ScopeType, scopeId: string): Promise<ScopedEntitlement[]>;
  getScopedEntitlementsByOrg(orgId: string): Promise<ScopedEntitlement[]>;
  createScopedEntitlement(entitlement: InsertScopedEntitlement): Promise<ScopedEntitlement>;
  updateScopedEntitlement(id: string, data: Partial<InsertScopedEntitlement>): Promise<ScopedEntitlement | undefined>;
  deleteScopedEntitlement(id: string): Promise<void>;

  // Password Reset Tokens
  createPasswordResetToken(token: InsertPasswordResetToken): Promise<PasswordResetToken>;
  getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined>;
  markPasswordResetTokenUsed(token: string): Promise<void>;

  // User Entitlements (capability grants)
  getUserEntitlements(userId: string): Promise<UserEntitlement[]>;
  getUserEntitlementKeys(userId: string): Promise<string[]>;
  createUserEntitlement(entitlement: InsertUserEntitlement): Promise<UserEntitlement>;
  deleteUserEntitlement(id: string): Promise<void>;
  deleteUserEntitlementByKey(userId: string, entitlementKey: string): Promise<void>;

  // User Roles (global roles)
  getUserRoles(userId: string): Promise<UserRole[]>;
  getUserRoleKeys(userId: string): Promise<string[]>;
  createUserRole(role: InsertUserRole): Promise<UserRole>;
  deleteUserRole(id: string): Promise<void>;
  deleteUserRoleByKey(userId: string, roleKey: string): Promise<void>;

  // Enriched user data for external services
  getEnrichedUser(userId: string): Promise<{
    id: string;
    email: string;
    name: string;
    isSuperAdmin: boolean;
    organizations: { id: string; name: string; slug: string; role: string }[];
    entitlements: string[];
    roles: string[];
  } | undefined>;

  // API Keys
  createApiKey(apiKey: InsertApiKey): Promise<ApiKey>;
  getApiKey(id: string): Promise<ApiKey | undefined>;
  getApiKeyByHash(keyHash: string): Promise<ApiKey | undefined>;
  getApiKeysByUser(userId: string): Promise<ApiKey[]>;
  getApiKeysByOrg(orgId: string): Promise<ApiKey[]>;
  updateApiKeyLastUsed(id: string): Promise<void>;
  revokeApiKey(id: string): Promise<void>;
  deleteApiKey(id: string): Promise<void>;

  // Agents (parallel to Users)
  getAgent(id: string): Promise<Agent | undefined>;
  getAgentByAgentId(agentId: string): Promise<Agent | undefined>;
  getAgentsByOrg(orgId: string): Promise<Agent[]>;
  getAllAgents(): Promise<Agent[]>;
  createAgent(agent: InsertAgent): Promise<Agent>;
  updateAgent(id: string, data: Partial<InsertAgent>): Promise<Agent | undefined>;
  updateAgentLastSeen(id: string): Promise<void>;
  deleteAgent(id: string): Promise<void>;

  // User Credentials (third-party API keys)
  getUserCredential(id: string): Promise<UserCredential | undefined>;
  getUserCredentialsByUser(userId: string): Promise<UserCredential[]>;
  getUserCredentialsByUserAndProvider(userId: string, provider: string): Promise<UserCredential | undefined>;
  getCredentialForUserOrOrg(userId: string, orgId: string | null, provider: string): Promise<UserCredential | undefined>;
  getUserCredentialsByOrg(orgId: string): Promise<UserCredential[]>;
  createUserCredential(credential: InsertUserCredential): Promise<UserCredential>;
  updateUserCredential(id: string, updates: Partial<{
    credentialEncrypted: string;
    credentialPrefix: string | null;
    credentialType: string;
    refreshTokenEncrypted: string | null;
    expiresAt: Date | null;
    oauthUserId: string | null;
    oauthUserEmail: string | null;
    oauthUserName: string | null;
    metadata: Record<string, unknown>;
  }>): Promise<UserCredential | undefined>;
  updateUserCredentialLastUsed(id: string): Promise<void>;
  deleteUserCredential(id: string): Promise<void>;

  // Stats
  getStats(): Promise<{ totalUsers: number; totalOrgs: number; totalAgents: number }>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db.update(users).set({ ...data, updatedAt: new Date() }).where(eq(users.id, id)).returning();
    return user || undefined;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async deleteUser(id: string): Promise<void> {
    // Nullify audit log references (no cascade delete on that FK)
    await db.update(auditLogs).set({ userId: null }).where(eq(auditLogs.userId, id));
    // Delete API keys created by this user (no cascade delete on createdBy FK)
    await db.delete(apiKeys).where(eq(apiKeys.createdBy, id));
    // Now delete the user (other FKs have cascade delete)
    await db.delete(users).where(eq(users.id, id));
  }

  // Organizations
  async getOrganization(id: string): Promise<Organization | undefined> {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id));
    return org || undefined;
  }

  async getOrganizationBySlug(slug: string): Promise<Organization | undefined> {
    const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug));
    return org || undefined;
  }

  async getAllOrganizations(): Promise<Organization[]> {
    return db.select().from(organizations);
  }

  async createOrganization(insertOrg: InsertOrganization): Promise<Organization> {
    const [org] = await db.insert(organizations).values(insertOrg).returning();
    return org;
  }

  async createOrganizationWithId(insertOrg: InsertOrganization & { id: string }): Promise<Organization> {
    const [org] = await db.insert(organizations).values(insertOrg).returning();
    return org;
  }

  async updateOrganization(id: string, data: Partial<InsertOrganization>): Promise<Organization | undefined> {
    const [org] = await db.update(organizations).set(data).where(eq(organizations.id, id)).returning();
    return org || undefined;
  }

  async deleteOrganization(id: string): Promise<void> {
    // Nullify audit log references first (no cascade delete on that FK)
    await db.update(auditLogs).set({ orgId: null }).where(eq(auditLogs.orgId, id));
    // Now delete the organization (other FKs have cascade delete)
    await db.delete(organizations).where(eq(organizations.id, id));
  }

  // Memberships
  async getMembership(id: string): Promise<Membership | undefined> {
    const [membership] = await db.select().from(memberships).where(eq(memberships.id, id));
    return membership || undefined;
  }

  async getMembershipByUserAndOrg(userId: string, orgId: string): Promise<Membership | undefined> {
    const [membership] = await db.select().from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.orgId, orgId)));
    return membership || undefined;
  }

  async getMembershipsByUser(userId: string): Promise<Membership[]> {
    return db.select().from(memberships).where(eq(memberships.userId, userId));
  }

  async getMembershipsByOrg(orgId: string): Promise<MembershipWithUser[]> {
    const result = await db.select({
      id: memberships.id,
      userId: memberships.userId,
      orgId: memberships.orgId,
      role: memberships.role,
      createdAt: memberships.createdAt,
      user: users,
    })
    .from(memberships)
    .leftJoin(users, eq(memberships.userId, users.id))
    .where(eq(memberships.orgId, orgId));
    
    return result.filter((r): r is MembershipWithUser => r.user !== null);
  }

  async createMembership(insertMembership: InsertMembership): Promise<Membership> {
    const [membership] = await db.insert(memberships).values(insertMembership).returning();
    return membership;
  }

  async updateMembership(id: string, data: Partial<InsertMembership>): Promise<Membership | undefined> {
    const [membership] = await db.update(memberships).set(data).where(eq(memberships.id, id)).returning();
    return membership || undefined;
  }

  async deleteMembership(id: string): Promise<void> {
    await db.delete(memberships).where(eq(memberships.id, id));
  }

  // Plans
  async getPlan(id: string): Promise<Plan | undefined> {
    const [plan] = await db.select().from(plans).where(eq(plans.id, id));
    return plan || undefined;
  }

  async getPlanByName(name: string): Promise<Plan | undefined> {
    const [plan] = await db.select().from(plans).where(eq(plans.name, name));
    return plan || undefined;
  }

  async getAllPlans(): Promise<Plan[]> {
    return db.select().from(plans);
  }

  async createPlan(insertPlan: InsertPlan): Promise<Plan> {
    const normalizedPlan: InsertPlan = {
      ...insertPlan,
      featuresJson: insertPlan.featuresJson ? ([...insertPlan.featuresJson] as string[]) : ([] as string[]),
      limitsJson: insertPlan.limitsJson ? ({ ...insertPlan.limitsJson } as Record<string, number>) : ({} as Record<string, number>),
    };
    const [plan] = await db.insert(plans).values(normalizedPlan as any).returning();
    return plan;
  }

  async updatePlan(id: string, data: Partial<InsertPlan>): Promise<Plan | undefined> {
    const normalized: Partial<InsertPlan> = {
      ...data,
      featuresJson: data.featuresJson ? ([...data.featuresJson] as string[]) : data.featuresJson,
      limitsJson: data.limitsJson ? ({ ...data.limitsJson } as Record<string, number>) : data.limitsJson,
    };
    const [plan] = await db.update(plans).set(normalized as any).where(eq(plans.id, id)).returning();
    return plan || undefined;
  }

  // Entitlements
  async getEntitlementsByOrg(orgId: string): Promise<Entitlement[]> {
    return db.select().from(entitlements).where(eq(entitlements.orgId, orgId));
  }

  async createEntitlement(insertEntitlement: InsertEntitlement): Promise<Entitlement> {
    const [entitlement] = await db.insert(entitlements).values(insertEntitlement).returning();
    return entitlement;
  }

  async updateEntitlement(id: string, data: Partial<InsertEntitlement>): Promise<Entitlement | undefined> {
    const [entitlement] = await db.update(entitlements).set(data).where(eq(entitlements.id, id)).returning();
    return entitlement || undefined;
  }

  // Sessions
  async getSession(id: string): Promise<Session | undefined> {
    const [session] = await db.select().from(sessions).where(eq(sessions.id, id));
    return session || undefined;
  }

  async getSessionByTokenHash(tokenHash: string): Promise<Session | undefined> {
    const [session] = await db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash));
    return session || undefined;
  }

  async createSession(insertSession: InsertSession): Promise<Session> {
    const [session] = await db.insert(sessions).values(insertSession).returning();
    return session;
  }

  async deleteSession(id: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.id, id));
  }

  async deleteSessionsByUser(userId: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.userId, userId));
  }

  // Audit Logs
  async createAuditLog(insertLog: InsertAuditLog): Promise<AuditLog> {
    const [log] = await db.insert(auditLogs).values(insertLog).returning();
    return log;
  }

  async getAuditLogsByOrg(orgId: string): Promise<AuditLog[]> {
    return db.select().from(auditLogs).where(eq(auditLogs.orgId, orgId));
  }

  async getAllAuditLogs(): Promise<AuditLog[]> {
    return db.select().from(auditLogs);
  }

  // Projects
  async getProject(id: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project || undefined;
  }

  async getProjectsByOrg(orgId: string): Promise<Project[]> {
    return db.select().from(projects).where(eq(projects.orgId, orgId));
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const [project] = await db.insert(projects).values(insertProject).returning();
    return project;
  }

  async updateProject(id: string, data: Partial<InsertProject>): Promise<Project | undefined> {
    const [project] = await db.update(projects).set(data).where(eq(projects.id, id)).returning();
    return project || undefined;
  }

  async deleteProject(id: string): Promise<void> {
    await db.delete(projects).where(eq(projects.id, id));
  }

  // Applications
  async getApplication(id: string): Promise<Application | undefined> {
    const [app] = await db.select().from(applications).where(eq(applications.id, id));
    return app || undefined;
  }

  async getApplicationsByProject(projectId: string): Promise<Application[]> {
    return db.select().from(applications).where(eq(applications.projectId, projectId));
  }

  async getApplicationsByOrg(orgId: string): Promise<Application[]> {
    return db.select().from(applications).where(eq(applications.orgId, orgId));
  }

  async createApplication(insertApp: InsertApplication): Promise<Application> {
    const [app] = await db.insert(applications).values(insertApp).returning();
    return app;
  }

  async updateApplication(id: string, data: Partial<InsertApplication>): Promise<Application | undefined> {
    const [app] = await db.update(applications).set(data).where(eq(applications.id, id)).returning();
    return app || undefined;
  }

  async deleteApplication(id: string): Promise<void> {
    await db.delete(applications).where(eq(applications.id, id));
  }

  // Services
  async getService(id: string): Promise<Service | undefined> {
    const [service] = await db.select().from(services).where(eq(services.id, id));
    return service || undefined;
  }

  async getServicesByProject(projectId: string): Promise<Service[]> {
    return db.select().from(services).where(eq(services.projectId, projectId));
  }

  async getServicesByOrg(orgId: string): Promise<Service[]> {
    return db.select().from(services).where(eq(services.orgId, orgId));
  }

  async createService(insertService: InsertService): Promise<Service> {
    const [service] = await db.insert(services).values(insertService).returning();
    return service;
  }

  async updateService(id: string, data: Partial<InsertService>): Promise<Service | undefined> {
    const [service] = await db.update(services).set(data).where(eq(services.id, id)).returning();
    return service || undefined;
  }

  async deleteService(id: string): Promise<void> {
    await db.delete(services).where(eq(services.id, id));
  }

  // Application-Service Links
  async linkApplicationService(appId: string, serviceId: string): Promise<ApplicationService> {
    const [link] = await db.insert(applicationServices).values({
      applicationId: appId,
      serviceId: serviceId,
    }).returning();
    return link;
  }

  async unlinkApplicationService(appId: string, serviceId: string): Promise<void> {
    await db.delete(applicationServices).where(
      and(eq(applicationServices.applicationId, appId), eq(applicationServices.serviceId, serviceId))
    );
  }

  async getServicesByApplication(appId: string): Promise<Service[]> {
    const links = await db.select({ serviceId: applicationServices.serviceId })
      .from(applicationServices)
      .where(eq(applicationServices.applicationId, appId));
    
    if (links.length === 0) return [];
    
    const serviceIds = links.map(l => l.serviceId);
    const result: Service[] = [];
    for (const serviceId of serviceIds) {
      const [service] = await db.select().from(services).where(eq(services.id, serviceId));
      if (service) result.push(service);
    }
    return result;
  }

  // Entitlement Tranches
  async getEntitlementTranche(id: string): Promise<EntitlementTranche | undefined> {
    const [tranche] = await db.select().from(entitlementTranches).where(eq(entitlementTranches.id, id));
    return tranche || undefined;
  }

  async getEntitlementTranchesByPlan(planId: string): Promise<EntitlementTranche[]> {
    return db.select().from(entitlementTranches).where(eq(entitlementTranches.planId, planId));
  }

  async createEntitlementTranche(insertTranche: InsertEntitlementTranche): Promise<EntitlementTranche> {
    const [tranche] = await db.insert(entitlementTranches).values(insertTranche).returning();
    return tranche;
  }

  // Scoped Entitlements
  async getScopedEntitlement(id: string): Promise<ScopedEntitlement | undefined> {
    const [entitlement] = await db.select().from(scopedEntitlements).where(eq(scopedEntitlements.id, id));
    return entitlement || undefined;
  }

  async getScopedEntitlementsByScope(scopeType: ScopeType, scopeId: string): Promise<ScopedEntitlement[]> {
    return db.select().from(scopedEntitlements).where(
      and(eq(scopedEntitlements.scopeType, scopeType), eq(scopedEntitlements.scopeId, scopeId))
    );
  }

  async getScopedEntitlementsByOrg(orgId: string): Promise<ScopedEntitlement[]> {
    return db.select().from(scopedEntitlements).where(eq(scopedEntitlements.orgId, orgId));
  }

  async createScopedEntitlement(insertEntitlement: InsertScopedEntitlement): Promise<ScopedEntitlement> {
    const [entitlement] = await db.insert(scopedEntitlements).values(insertEntitlement).returning();
    return entitlement;
  }

  async updateScopedEntitlement(id: string, data: Partial<InsertScopedEntitlement>): Promise<ScopedEntitlement | undefined> {
    const [entitlement] = await db.update(scopedEntitlements).set(data).where(eq(scopedEntitlements.id, id)).returning();
    return entitlement || undefined;
  }

  async deleteScopedEntitlement(id: string): Promise<void> {
    await db.delete(scopedEntitlements).where(eq(scopedEntitlements.id, id));
  }

  // Password Reset Tokens
  async createPasswordResetToken(insertToken: InsertPasswordResetToken): Promise<PasswordResetToken> {
    const [token] = await db.insert(passwordResetTokens).values(insertToken).returning();
    return token;
  }

  async getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined> {
    const [result] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.token, token));
    return result || undefined;
  }

  async markPasswordResetTokenUsed(token: string): Promise<void> {
    await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.token, token));
  }

  // User Entitlements
  async getUserEntitlements(userId: string): Promise<UserEntitlement[]> {
    return db.select().from(userEntitlements).where(eq(userEntitlements.userId, userId));
  }

  async getUserEntitlementKeys(userId: string): Promise<string[]> {
    const result = await db.select({ key: userEntitlements.entitlementKey })
      .from(userEntitlements)
      .where(eq(userEntitlements.userId, userId));
    return result.map(r => r.key);
  }

  async createUserEntitlement(entitlement: InsertUserEntitlement): Promise<UserEntitlement> {
    const [result] = await db.insert(userEntitlements).values(entitlement).returning();
    return result;
  }

  async deleteUserEntitlement(id: string): Promise<void> {
    await db.delete(userEntitlements).where(eq(userEntitlements.id, id));
  }

  async deleteUserEntitlementByKey(userId: string, entitlementKey: string): Promise<void> {
    await db.delete(userEntitlements).where(
      and(eq(userEntitlements.userId, userId), eq(userEntitlements.entitlementKey, entitlementKey))
    );
  }

  // User Roles
  async getUserRoles(userId: string): Promise<UserRole[]> {
    return db.select().from(userRoles).where(eq(userRoles.userId, userId));
  }

  async getUserRoleKeys(userId: string): Promise<string[]> {
    const result = await db.select({ key: userRoles.roleKey })
      .from(userRoles)
      .where(eq(userRoles.userId, userId));
    return result.map(r => r.key);
  }

  async createUserRole(role: InsertUserRole): Promise<UserRole> {
    const [result] = await db.insert(userRoles).values(role).returning();
    return result;
  }

  async deleteUserRole(id: string): Promise<void> {
    await db.delete(userRoles).where(eq(userRoles.id, id));
  }

  async deleteUserRoleByKey(userId: string, roleKey: string): Promise<void> {
    await db.delete(userRoles).where(
      and(eq(userRoles.userId, userId), eq(userRoles.roleKey, roleKey))
    );
  }

  // Enriched user data for external services (Object Service integration)
  async getEnrichedUser(userId: string): Promise<{
    id: string;
    email: string;
    name: string;
    isSuperAdmin: boolean;
    organizations: { id: string; name: string; slug: string; role: string }[];
    entitlements: string[];
    roles: string[];
  } | undefined> {
    const user = await this.getUser(userId);
    if (!user) return undefined;

    // Get user's organization memberships with org details
    const userMemberships = await db.select({
      orgId: memberships.orgId,
      role: memberships.role,
      orgName: organizations.name,
      orgSlug: organizations.slug,
    })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.orgId, organizations.id))
    .where(eq(memberships.userId, userId));

    // Get user entitlement keys
    const entitlementKeys = await this.getUserEntitlementKeys(userId);

    // Get user role keys
    const roleKeys = await this.getUserRoleKeys(userId);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      isSuperAdmin: user.isSuperAdmin,
      organizations: userMemberships.map(m => ({
        id: m.orgId,
        name: m.orgName,
        slug: m.orgSlug,
        role: m.role,
      })),
      entitlements: entitlementKeys,
      roles: roleKeys,
    };
  }

  // API Keys
  async createApiKey(insertApiKey: InsertApiKey): Promise<ApiKey> {
    const normalizedApiKey: InsertApiKey = {
      ...insertApiKey,
      scopes: insertApiKey.scopes ? ([...insertApiKey.scopes] as string[]) : ([] as string[]),
    };
    const [apiKey] = await db.insert(apiKeys).values(normalizedApiKey as any).returning();
    return apiKey;
  }

  async getApiKey(id: string): Promise<ApiKey | undefined> {
    const [apiKey] = await db.select().from(apiKeys).where(eq(apiKeys.id, id));
    return apiKey || undefined;
  }

  async getApiKeyByHash(keyHash: string): Promise<ApiKey | undefined> {
    const [apiKey] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash));
    return apiKey || undefined;
  }

  async getApiKeysByUser(userId: string): Promise<ApiKey[]> {
    return db.select().from(apiKeys).where(eq(apiKeys.createdBy, userId));
  }

  async getApiKeysByOrg(orgId: string): Promise<ApiKey[]> {
    return db.select().from(apiKeys).where(eq(apiKeys.orgId, orgId));
  }

  async updateApiKeyLastUsed(id: string): Promise<void> {
    await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, id));
  }

  async revokeApiKey(id: string): Promise<void> {
    await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, id));
  }

  async deleteApiKey(id: string): Promise<void> {
    await db.delete(apiKeys).where(eq(apiKeys.id, id));
  }

  // Agents (parallel to Users)
  async getAgent(id: string): Promise<Agent | undefined> {
    const [agent] = await db.select().from(agents).where(eq(agents.id, id));
    return agent || undefined;
  }

  async getAgentByAgentId(agentId: string): Promise<Agent | undefined> {
    const [agent] = await db.select().from(agents).where(eq(agents.agentId, agentId));
    return agent || undefined;
  }

  async getAgentsByOrg(orgId: string): Promise<Agent[]> {
    return db.select().from(agents).where(eq(agents.orgId, orgId));
  }

  async getAllAgents(): Promise<Agent[]> {
    return db.select().from(agents);
  }

  async createAgent(insertAgent: InsertAgent): Promise<Agent> {
    const [agent] = await db.insert(agents).values(insertAgent).returning();
    return agent;
  }

  async updateAgent(id: string, data: Partial<InsertAgent>): Promise<Agent | undefined> {
    const [agent] = await db.update(agents).set({ ...data, updatedAt: new Date() }).where(eq(agents.id, id)).returning();
    return agent || undefined;
  }

  async updateAgentLastSeen(id: string): Promise<void> {
    await db.update(agents).set({ lastSeenAt: new Date() }).where(eq(agents.id, id));
  }

  async deleteAgent(id: string): Promise<void> {
    await db.delete(agents).where(eq(agents.id, id));
  }

  // User Credentials (third-party API keys)
  async getUserCredential(id: string): Promise<UserCredential | undefined> {
    const [credential] = await db.select().from(userCredentials).where(eq(userCredentials.id, id));
    return credential || undefined;
  }

  async getUserCredentialsByUser(userId: string): Promise<UserCredential[]> {
    return db.select().from(userCredentials).where(eq(userCredentials.userId, userId));
  }

  async getUserCredentialsByUserAndProvider(userId: string, provider: string): Promise<UserCredential | undefined> {
    const [credential] = await db.select().from(userCredentials).where(
      and(eq(userCredentials.userId, userId), eq(userCredentials.provider, provider))
    );
    return credential || undefined;
  }

  async getCredentialForUserOrOrg(userId: string, orgId: string | null, provider: string): Promise<UserCredential | undefined> {
    console.log(`[storage] getCredentialForUserOrOrg - userId: ${userId}, orgId: ${orgId}, provider: ${provider}`);

    // First try user-specific credential
    const userCred = await this.getUserCredentialsByUserAndProvider(userId, provider);
    console.log(`[storage] User-specific credential: ${userCred ? `found (id: ${userCred.id})` : 'not found'}`);
    if (userCred) return userCred;

    // Fall back to org-wide credential if orgId provided
    if (orgId) {
      console.log(`[storage] Looking for org-wide credential - orgId: ${orgId}, provider: ${provider}`);
      const [orgCred] = await db.select().from(userCredentials).where(
        and(
          eq(userCredentials.orgId, orgId),
          eq(userCredentials.provider, provider),
          eq(userCredentials.isOrgWide, true)
        )
      );
      console.log(`[storage] Org-wide credential: ${orgCred ? `found (id: ${orgCred.id})` : 'not found'}`);
      if (orgCred) return orgCred;
    }

    return undefined;
  }

  async getUserCredentialsByOrg(orgId: string): Promise<UserCredential[]> {
    return db.select().from(userCredentials).where(eq(userCredentials.orgId, orgId));
  }

  async createUserCredential(credential: InsertUserCredential): Promise<UserCredential> {
    const [created] = await db.insert(userCredentials).values(credential).returning();
    return created;
  }

  async updateUserCredential(id: string, updates: Partial<{
    credentialEncrypted: string;
    credentialPrefix: string | null;
    credentialType: string;
    refreshTokenEncrypted: string | null;
    expiresAt: Date | null;
    oauthUserId: string | null;
    oauthUserEmail: string | null;
    oauthUserName: string | null;
    metadata: Record<string, unknown>;
  }>): Promise<UserCredential | undefined> {
    const [updated] = await db.update(userCredentials)
      .set(updates)
      .where(eq(userCredentials.id, id))
      .returning();
    return updated || undefined;
  }

  async updateUserCredentialLastUsed(id: string): Promise<void> {
    await db.update(userCredentials).set({ lastUsedAt: new Date() }).where(eq(userCredentials.id, id));
  }

  async deleteUserCredential(id: string): Promise<void> {
    await db.delete(userCredentials).where(eq(userCredentials.id, id));
  }

  // =============================================================================
  // Entity Directory - UUID-based addressing for all principals
  // =============================================================================

  async getEntity(id: string): Promise<Entity | undefined> {
    const [entity] = await db.select().from(entities).where(eq(entities.id, id));
    return entity || undefined;
  }

  async getEntityBySlugOrgInstance(slug: string, orgId: string | undefined, instanceId: string | undefined): Promise<Entity | undefined> {
    const conditions = [eq(entities.slug, slug)];

    if (orgId) {
      conditions.push(eq(entities.orgId, orgId));
    } else {
      conditions.push(isNull(entities.orgId));
    }

    if (instanceId) {
      conditions.push(eq(entities.instanceId, instanceId));
    } else {
      conditions.push(isNull(entities.instanceId));
    }

    const [entity] = await db.select().from(entities).where(and(...conditions));
    return entity || undefined;
  }

  async getEntityBySourceId(sourceTable: string, sourceId: string): Promise<Entity | undefined> {
    const [entity] = await db.select().from(entities).where(
      and(eq(entities.sourceTable, sourceTable), eq(entities.sourceId, sourceId))
    );
    return entity || undefined;
  }

  async getEntityByNodeId(nodeId: string): Promise<Entity | undefined> {
    const [entity] = await db.select().from(entities).where(eq(entities.boundNodeId, nodeId));
    return entity || undefined;
  }

  async listEntities(filters: {
    type?: string;
    orgId?: string;
    slug?: string;
    status?: string;
    allowedOrgIds?: string[];
  }): Promise<Entity[]> {
    const conditions: ReturnType<typeof eq>[] = [];

    if (filters.type) {
      conditions.push(eq(entities.type, filters.type));
    }
    if (filters.orgId) {
      conditions.push(eq(entities.orgId, filters.orgId));
    }
    if (filters.slug) {
      conditions.push(eq(entities.slug, filters.slug));
    }
    if (filters.status) {
      conditions.push(eq(entities.status, filters.status));
    }

    let query = db.select().from(entities);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const results = await query;

    // Filter by allowed org IDs if specified
    if (filters.allowedOrgIds) {
      return results.filter(e =>
        !e.orgId || filters.allowedOrgIds!.includes(e.orgId)
      );
    }

    return results;
  }

  async createEntity(entity: InsertEntity): Promise<Entity> {
    const [created] = await db.insert(entities).values({
      ...entity,
      registeredAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    return created;
  }

  async updateEntity(id: string, updates: Partial<InsertEntity>): Promise<Entity | undefined> {
    const [updated] = await db.update(entities)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(entities.id, id))
      .returning();
    return updated || undefined;
  }

  async bindEntityToNode(entityId: string, nodeId: string): Promise<Entity | undefined> {
    const [updated] = await db.update(entities)
      .set({
        boundNodeId: nodeId,
        boundAt: new Date(),
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(entities.id, entityId))
      .returning();
    return updated || undefined;
  }

  async unbindEntityFromNode(entityId: string): Promise<Entity | undefined> {
    const [updated] = await db.update(entities)
      .set({
        boundNodeId: null,
        boundAt: null,
        updatedAt: new Date(),
      })
      .where(eq(entities.id, entityId))
      .returning();
    return updated || undefined;
  }

  async resolveEntityAddress(address: string, contextOrgId?: string): Promise<Entity[]> {
    // Remove @ prefix if present
    const cleanAddress = address.startsWith("@") ? address.slice(1) : address;

    // Check for UUID format (ent_xxx)
    if (cleanAddress.startsWith("ent_")) {
      const entity = await this.getEntity(cleanAddress);
      return entity ? [entity] : [];
    }

    // Check for instance syntax (slug#instance)
    const instanceMatch = cleanAddress.match(/^([^#]+)#(.+)$/);
    if (instanceMatch) {
      const [, slug, instanceId] = instanceMatch;
      const entity = await this.getEntityBySlugOrgInstance(slug, contextOrgId, instanceId);
      return entity ? [entity] : [];
    }

    // Check for qualified syntax (type:slug)
    const qualifiedMatch = cleanAddress.match(/^([^:]+):(.+)$/);
    if (qualifiedMatch) {
      const [, type, slug] = qualifiedMatch;
      const conditions = [eq(entities.type, type), eq(entities.slug, slug)];
      if (contextOrgId) {
        conditions.push(or(eq(entities.orgId, contextOrgId), isNull(entities.orgId))!);
      }
      return db.select().from(entities).where(and(...conditions));
    }

    // Simple slug lookup - try alias first, then direct slug
    const aliasConditions = [eq(entityAliases.aliasValue, cleanAddress)];
    if (contextOrgId) {
      aliasConditions.push(or(eq(entityAliases.orgId, contextOrgId), isNull(entityAliases.orgId))!);
    }

    const aliasResults = await db.select()
      .from(entityAliases)
      .where(and(...aliasConditions))
      .orderBy(entityAliases.priority);

    if (aliasResults.length > 0) {
      const entityIds = [...new Set(aliasResults.map(a => a.entityId))];
      return db.select().from(entities).where(inArray(entities.id, entityIds));
    }

    // Fall back to direct slug match
    const slugConditions = [eq(entities.slug, cleanAddress)];
    if (contextOrgId) {
      slugConditions.push(or(eq(entities.orgId, contextOrgId), isNull(entities.orgId))!);
    }
    return db.select().from(entities).where(and(...slugConditions));
  }

  async getSimilarEntities(address: string, contextOrgId?: string): Promise<string[]> {
    // Simple fuzzy search for suggestions
    const cleanAddress = address.startsWith("@") ? address.slice(1) : address;
    const pattern = `%${cleanAddress}%`;

    const conditions = [like(entities.slug, pattern)];
    if (contextOrgId) {
      conditions.push(or(eq(entities.orgId, contextOrgId), isNull(entities.orgId))!);
    }

    const results = await db.select({ slug: entities.slug })
      .from(entities)
      .where(and(...conditions))
      .limit(5);

    return results.map(r => r.slug);
  }

  // Entity Aliases
  async createEntityAlias(alias: InsertEntityAlias): Promise<EntityAlias> {
    const [created] = await db.insert(entityAliases).values(alias).returning();
    return created;
  }

  async getEntityAliases(entityId: string): Promise<EntityAlias[]> {
    return db.select().from(entityAliases).where(eq(entityAliases.entityId, entityId));
  }

  async deleteEntityAlias(id: string): Promise<void> {
    await db.delete(entityAliases).where(eq(entityAliases.id, id));
  }

  // Entity Instances
  async createEntityInstance(instance: InsertEntityInstance): Promise<EntityInstance> {
    const [created] = await db.insert(entityInstances).values(instance).returning();
    return created;
  }

  async getEntityInstances(entityId: string): Promise<EntityInstance[]> {
    return db.select().from(entityInstances).where(eq(entityInstances.entityId, entityId));
  }

  async updateEntityInstanceStatus(id: string, status: string, nodeId?: string): Promise<EntityInstance | undefined> {
    const updates: Partial<InsertEntityInstance> = {
      status,
      lastHeartbeat: new Date(),
    };
    if (nodeId !== undefined) {
      updates.nodeId = nodeId;
    }
    const [updated] = await db.update(entityInstances)
      .set(updates)
      .where(eq(entityInstances.id, id))
      .returning();
    return updated || undefined;
  }

  // Stats
  async getStats(): Promise<{ totalUsers: number; totalOrgs: number; totalAgents: number }> {
    const allUsers = await db.select().from(users);
    const allOrgs = await db.select().from(organizations);
    const allAgents = await db.select().from(agents);
    return {
      totalUsers: allUsers.length,
      totalOrgs: allOrgs.length,
      totalAgents: allAgents.length,
    };
  }
}

export const storage = new DatabaseStorage();
