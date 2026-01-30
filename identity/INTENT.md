# Identity Service — Architectural Intent

> The authentication and authorization backbone for AI-native applications.

---

## What Identity Is

Identity is the **central authority for principals, permissions, and organizational structure** in the Symbia platform. It answers three fundamental questions for every request:

1. **Who are you?** — Authentication via JWT tokens, API keys, or session cookies
2. **What can you do?** — Authorization via roles, entitlements, and organization membership
3. **In what context?** — Multi-tenant scoping via organizations, projects, and applications

This is not a simple auth service. It's designed for systems where both humans and AI agents are first-class actors with distinct identity requirements.

---

## The Problem We're Solving

Traditional authentication systems assume all principals are human users. This breaks down in AI-native applications:

1. **Agents aren't users** — An AI assistant doesn't have an email address. It has a service identifier, capabilities, and an organizational affiliation. Treating it as a user creates data model awkwardness.

2. **Capabilities aren't roles** — A user might be an "admin," but an agent has specific capabilities like "can send messages" or "can read catalog." These are granular, not hierarchical.

3. **Context is multi-dimensional** — A request might be from User A, acting as Agent B, on behalf of Organization C, within Project D. Traditional auth flattens this.

4. **Tokens need introspection** — Service-to-service communication requires validating tokens without shared secrets. RFC 7662 token introspection solves this, but most auth libraries ignore it.

5. **API keys aren't afterthoughts** — Programmatic access needs first-class support with scoping, rotation, and revocation — not hacked-on API tokens.

Identity addresses all of these as primary concerns.

---

## Design Principles

### 1. Dual Principal Model

Identity recognizes two distinct principal types:

| Principal | Identifier | Credential | Use Case |
|-----------|------------|------------|----------|
| **User** | Email address | Password (bcrypt) | Human actors |
| **Agent** | Service:Name format | Long credential (32+ chars) | AI/bot actors |

Both receive JWT tokens with the same structure but different claims:

```typescript
// User token
{ sub: "user-uuid", type: "user", email: "...", name: "..." }

// Agent token
{ sub: "agent-uuid", type: "agent", agentId: "assistant:support", name: "...", orgId: "..." }
```

**Why this matters:** An LLM-powered assistant authenticating to the Messaging service uses agent auth. The human who configured that assistant uses user auth. Same system, different principal types, clean separation.

**Trade-off accepted:** Two authentication codepaths to maintain. Worth it for semantic clarity.

### 2. Hierarchical Resource Model

Organizations contain projects. Projects contain applications and services. Services link to applications.

```
Organization (Acme Corp)
└── Project (Customer Portal)
    ├── Application (Web Dashboard) ─────┐
    ├── Application (Mobile App) ────────┼── linked to ──┐
    ├── Service (PostgreSQL Primary) ────┘               │
    └── Service (Redis Cache) ───────────────────────────┘
```

**Why this matters:**
- **Organizations** are billing and permission boundaries
- **Projects** group related work (a product, a client engagement)
- **Applications** are deployable artifacts (web app, mobile app, CLI)
- **Services** are infrastructure dependencies (databases, caches, APIs)

This hierarchy enables:
- Entitlements scoped to any level (org-wide vs project-specific)
- Access control inheritance (project admins see all apps in that project)
- Resource organization that matches how teams actually work

**Trade-off accepted:** More complex than flat user/org models. Necessary for enterprise use cases.

### 3. Entitlements Over Roles

Traditional RBAC uses roles: admin, member, viewer. Identity adds **entitlements** — specific capabilities granted to principals:

```
Entitlement Key Format: cap:<domain>.<action>

Examples:
- cap:registry.write    → Can write to the catalog registry
- cap:messaging.send    → Can send messages
- cap:assistants.manage → Can configure AI assistants
```

**Why this matters:**
- Roles are coarse-grained ("admin can do everything")
- Entitlements are fine-grained ("can send messages but not configure assistants")
- AI agents get specific capabilities, not blanket permissions
- Entitlements can have quotas and expiration dates

**Implementation:**
- Users have roles (admin/member/viewer) for organization membership
- Users and agents have entitlements for specific capabilities
- Entitlements can be scoped to org, project, application, or service level
- Token introspection returns both roles and entitlements

**Trade-off accepted:** More complex permission checks. Mitigated by centralized introspection endpoint.

### 4. Token Introspection as Core Primitive

Every service validates tokens by calling Identity's introspection endpoint:

```http
POST /api/auth/introspect
Content-Type: application/json

{"token": "eyJ..."}
```

Response includes everything needed for authorization:

```json
{
  "active": true,
  "sub": "user-uuid",
  "type": "user",
  "email": "user@example.com",
  "organizations": [
    {"id": "org-uuid", "name": "Acme", "role": "admin"}
  ],
  "entitlements": ["cap:registry.write", "cap:messaging.send"],
  "roles": ["role:developer"]
}
```

**Why this matters:**
- Services don't need the JWT secret — they call Identity
- Permission changes take effect immediately (no token refresh needed)
- Audit trail of all introspection calls
- RFC 7662 compliant — works with standard tooling

**Trade-off accepted:** Every authenticated request hits Identity. Mitigated by response caching at the service level.

### 5. API Keys as First-Class Citizens

API keys aren't user tokens with extra steps. They're a distinct authentication mechanism:

```typescript
interface ApiKey {
  id: string;
  name: string;           // Human-readable identifier
  keyHash: string;        // bcrypt hash (key never stored)
  keyPrefix: string;      // First 8 chars for identification
  orgId: string | null;   // Optional org scope
  createdBy: string;      // User who created it
  scopes: string[];       // Allowed operations
  expiresAt: Date | null; // Optional expiration
  revokedAt: Date | null; // Soft revocation
}
```

**Key features:**
- Keys are hashed — even database access doesn't reveal them
- Prefix allows identification without exposing the full key
- Scopes limit what operations the key can perform
- Revocation is instant and auditable
- Rotation generates a new key without invalidating the old one immediately

**Why this matters:** CI/CD pipelines, external integrations, and automation need stable credentials that aren't tied to user sessions. API keys provide this with proper security controls.

### 6. Entity Directory

The Entity Directory provides UUID-based identity for all addressable entities across the platform:

**Entity types:**

| Type | Description | Example |
|------|-------------|---------|
| `user` | Human users | Brian, Alice |
| `assistant` | AI assistants | log-analyst, coordinator |
| `service` | Backend services | messaging, catalog |
| `integration` | External integrations | Slack, GitHub |
| `sandbox` | Workflow sandboxes | Execution environments |

**Entity UUID format:**
```
ent_550e8400-e29b-41d4-a716-446655440000
```

**Entity schema:**
```typescript
interface Entity {
  id: string;                    // UUID (ent_xxx format)
  type: 'user' | 'assistant' | 'service' | 'integration' | 'sandbox';
  slug: string;                  // e.g., "log-analyst"
  displayName: string;           // e.g., "Log Analyst"
  instanceId?: string;           // For multiple instances
  orgId: string;
  capabilities: string[];
  tags: string[];
  status: 'active' | 'inactive' | 'suspended';
  boundNodeId?: string;          // Current network node (if connected)
}
```

**Address resolution:**

| Format | Example | Description |
|--------|---------|-------------|
| UUID | `ent_550e8400...` | Primary identifier |
| Local slug | `@log-analyst` | Within same org |
| Qualified | `assistant:log-analyst:org:acme` | Explicit scoping |
| Instance | `assistant:log-analyst#2` | Specific instance |

**Why Entity Directory:**
- Unified identity across all services (not string IDs vs UUIDs)
- Multi-instance support (multiple instances of same assistant type)
- Network node binding (ephemeral nodes bind to persistent entities)
- @mention resolution in conversations

### 7. Audit Everything

Every significant action is logged:

```typescript
interface AuditLog {
  id: string;
  userId: string | null;    // Who did it (if user)
  orgId: string | null;     // In what org context
  action: string;           // What happened
  resource: string;         // What type of thing
  resourceId: string;       // Which specific thing
  metadataJson: object;     // Additional context
  createdAt: Date;
}
```

**Actions logged:**
- Authentication events (login, logout, failed attempts)
- Principal creation and modification
- Organization and project changes
- Entitlement grants and revocations
- API key lifecycle events

**Why this matters:** Compliance, debugging, and security incident response all require knowing who did what when.

---

## Security Model

### Password Storage

- bcrypt with configurable cost factor (default: 12 rounds)
- Passwords never logged, even in error messages
- Rate limiting on auth endpoints (10 requests/minute/IP)

### Token Security

- JWT signed with HS256 (HMAC-SHA256)
- 7-day expiration with refresh capability
- Tokens include issued-at timestamp for revocation checks
- Cookie-based tokens use HttpOnly, Secure, SameSite flags

### Agent Credentials

- Minimum 32 characters enforced
- bcrypt hashed like passwords
- Separate from user passwords (different table, different validation)

### API Key Security

- Generated with cryptographically secure random bytes
- Only shown once at creation time
- Hashed before storage
- Prefix allows identification without exposure

### Defense in Depth

- All inputs validated with Zod schemas
- SQL injection prevented by Drizzle ORM parameterization
- CORS configured per environment
- Rate limiting on sensitive endpoints
- Audit logging for forensics

---

## Data Flow

### User Login Flow

```
┌──────────┐     ┌──────────────┐     ┌────────────┐
│  Client  │────▶│   Identity   │────▶│  Database  │
│          │     │   Service    │     │            │
└──────────┘     └──────────────┘     └────────────┘
     │                  │                    │
     │ POST /login      │                    │
     │ {email, pass}    │                    │
     │─────────────────▶│                    │
     │                  │ SELECT user        │
     │                  │───────────────────▶│
     │                  │◀───────────────────│
     │                  │ bcrypt.compare()   │
     │                  │ jwt.sign()         │
     │◀─────────────────│                    │
     │ {token, user}    │                    │
```

### Service-to-Service Auth Flow

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐
│ Messaging│     │   Identity   │     │   Catalog    │
│ Service  │     │   Service    │     │   Service    │
└──────────┘     └──────────────┘     └──────────────┘
     │                  │                    │
     │ User sends message with token         │
     │◀──────────────────────────────────────│
     │                  │                    │
     │ POST /introspect │                    │
     │ {token}          │                    │
     │─────────────────▶│                    │
     │                  │ Validate + enrich  │
     │◀─────────────────│                    │
     │ {active, sub,    │                    │
     │  entitlements}   │                    │
     │                  │                    │
     │ Check cap:messaging.send              │
     │ Process message  │                    │
```

### API Key Verification Flow

```
┌──────────┐     ┌──────────────┐     ┌────────────┐
│ External │     │   Identity   │     │  Database  │
│  Client  │     │   Service    │     │            │
└──────────┘     └──────────────┘     └────────────┘
     │                  │                    │
     │ X-API-Key: sk_...│                    │
     │─────────────────▶│                    │
     │                  │ Extract prefix     │
     │                  │ SELECT by prefix   │
     │                  │───────────────────▶│
     │                  │◀───────────────────│
     │                  │ bcrypt.compare()   │
     │                  │ Check expiry/revoke│
     │◀─────────────────│                    │
     │ {valid, scopes}  │                    │
```

---

## Schema Design Decisions

### Why UUIDs for Primary Keys

- No sequential ID enumeration attacks
- Safe to expose in URLs and logs
- Globally unique across services
- Can be generated client-side for offline-first patterns

### Why Separate Tables for Users and Agents

- Different validation rules (email vs agentId format)
- Different credential requirements (8 char password vs 32 char credential)
- Different metadata (user profile vs agent capabilities)
- Cleaner queries without type discrimination columns

### Why JSON Columns for Metadata

- Flexible schema for capabilities, features, limits
- No schema migrations for new metadata fields
- PostgreSQL JSONB supports indexing and querying
- Type safety via Zod validation at application layer

### Why Soft Deletes for API Keys

- Audit trail preservation
- Revocation vs deletion distinction
- Recovery possible if revoked by mistake
- Compliance requirements for retention

---

## Integration Patterns

### For Other Symbia Services

```typescript
// Middleware pattern for protected routes
import { createIdentityClient } from "@symbia/identity-client";

const identity = createIdentityClient({ endpoint: "http://localhost:5001" });

async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "No token" });

  const result = await identity.introspect(token);
  if (!result.active) return res.status(401).json({ error: "Invalid token" });

  req.principal = result;
  next();
}

// Entitlement check
function requireEntitlement(key: string) {
  return (req, res, next) => {
    if (!req.principal.entitlements.includes(key)) {
      return res.status(403).json({ error: "Missing entitlement", required: key });
    }
    next();
  };
}

// Usage
app.post("/api/messages",
  authMiddleware,
  requireEntitlement("cap:messaging.send"),
  handleSendMessage
);
```

### For External Integrations

```typescript
// API key authentication for external clients
async function apiKeyMiddleware(req, res, next) {
  const apiKey = req.headers["x-api-key"];
  if (!apiKey) return res.status(401).json({ error: "No API key" });

  const result = await identity.verifyApiKey(apiKey);
  if (!result.valid) return res.status(401).json({ error: "Invalid API key" });

  req.apiKey = result;
  next();
}

// Scope check
function requireScope(scope: string) {
  return (req, res, next) => {
    if (!req.apiKey.scopes.includes(scope)) {
      return res.status(403).json({ error: "Missing scope", required: scope });
    }
    next();
  };
}
```

### For AI Agents

```typescript
// Agent authentication at startup
const identity = createIdentityClient({ endpoint: process.env.IDENTITY_URL });

const { token } = await identity.agentLogin({
  agentId: "assistant:support",
  credential: process.env.AGENT_CREDENTIAL,
});

// Use token for all subsequent requests
const messaging = createMessagingClient({
  endpoint: process.env.MESSAGING_URL,
  token,
});

// Refresh before expiration
setInterval(async () => {
  const { token: newToken } = await identity.agentRefresh(token);
  messaging.setToken(newToken);
}, 6 * 24 * 60 * 60 * 1000); // 6 days
```

---

## Operational Considerations

### Health Checks

| Endpoint | What It Checks | Use Case |
|----------|----------------|----------|
| `/health` | Process alive | Basic liveness |
| `/health/ready` | Database connected | Kubernetes readiness |

### Performance Characteristics

| Operation | Typical Latency | Notes |
|-----------|-----------------|-------|
| Login | 100-200ms | bcrypt is intentionally slow |
| Introspect | 5-20ms | JWT decode + DB lookup |
| API key verify | 50-100ms | bcrypt comparison |

### Scaling Considerations

- **Horizontal:** Stateless — add more instances behind load balancer
- **Database:** Read replicas for introspection queries
- **Caching:** Introspection responses can be cached (TTL: 60s recommended)

### Monitoring Points

- Login success/failure rates
- Token introspection volume
- API key verification failures
- Audit log volume
- Database connection pool usage

---

## What Identity Does Not Do

### No OAuth Provider

Identity issues its own JWTs. It doesn't implement OAuth 2.0 authorization server flows. If you need "Login with Google," implement it at the application layer and create Identity users/tokens after OAuth completion.

**Rationale:** OAuth provider complexity is substantial. Most Symbia use cases involve service-to-service auth, not third-party integrations.

### No Session Storage

Tokens are stateless JWTs. There's no server-side session table. Token revocation happens via:
- Short expiration (7 days)
- Introspection checks against user/agent status
- Application-level revocation lists if needed

**Rationale:** Stateless tokens scale better and simplify service-to-service auth.

### No Password Complexity Rules

Beyond minimum length (8 characters), no complexity requirements are enforced. Modern security guidance favors length over complexity.

**Rationale:** Complexity rules create user frustration without meaningful security improvement. Length matters more.

### No Multi-Factor Authentication (Yet)

MFA is not implemented. If required, implement at the application layer or use an upstream identity provider.

**Rationale:** MFA requires additional infrastructure (TOTP secrets, SMS providers, hardware key support). Planned for future implementation.

---

## Future Directions

### Planned

1. **TOTP-based MFA** — Time-based one-time passwords for high-security accounts
2. **Session management UI** — View and revoke active sessions
3. **Delegated authentication** — "Login as" for support scenarios
4. **Fine-grained audit queries** — Search and filter audit logs

### Considered

1. **OIDC provider** — Become an OpenID Connect identity provider
2. **SAML support** — Enterprise SSO integration
3. **Hardware key support** — WebAuthn/FIDO2

### Intentionally Deferred

1. **Social login** — Implement at application layer
2. **Password reset via SMS** — Email-only for now
3. **Account lockout** — Rate limiting preferred over lockout

---

## Quick Reference

### Authentication Methods

| Method | Header/Cookie | When to Use |
|--------|---------------|-------------|
| Bearer Token | `Authorization: Bearer <jwt>` | API calls |
| Cookie | `token=<jwt>` | Browser sessions |
| API Key | `X-API-Key: <key>` | External integrations |

### Entitlement Prefixes

| Prefix | Meaning |
|--------|---------|
| `cap:` | Capability (action permission) |
| `role:` | Role (group of capabilities) |

### Common Entitlements

| Key | Description |
|-----|-------------|
| `cap:registry.read` | Read catalog resources |
| `cap:registry.write` | Create/update catalog resources |
| `cap:messaging.send` | Send messages |
| `cap:messaging.read` | Read conversations |
| `cap:assistants.execute` | Run AI assistants |
| `cap:assistants.manage` | Configure AI assistants |

### Role Hierarchy

| Role | Org Permissions |
|------|-----------------|
| `admin` | Full control, can manage members |
| `member` | Read/write access, cannot manage members |
| `viewer` | Read-only access |

---

*This document reflects the Identity service architectural intent as of January 2026.*
