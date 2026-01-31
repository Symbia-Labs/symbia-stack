# Symbia Stack — Web Content Update Instructions

> **For: LLM Agent updating website, blog, GitHub pages, and documentation**
> **Version:** 1.0 — January 2026
> **Source:** Extracted from complete codebase analysis

This document contains everything you need to accurately represent Symbia Stack across all web properties. You do not have access to the codebase — this document IS your source of truth.

---

## TABLE OF CONTENTS

1. [Project Identity](#1-project-identity)
2. [Core Thesis & Positioning](#2-core-thesis--positioning)
3. [The Five Problems Symbia Solves](#3-the-five-problems-symbia-solves)
4. [Architecture Overview](#4-architecture-overview)
5. [Complete Service Reference](#5-complete-service-reference)
6. [Shared Libraries Reference](#6-shared-libraries-reference)
7. [Key Innovations & Differentiators](#7-key-innovations--differentiators)
8. [Design System & Brand](#8-design-system--brand)
9. [Content Guidelines](#9-content-guidelines)
10. [Page-Specific Content](#10-page-specific-content)
11. [Technical Specifications](#11-technical-specifications)
12. [Code Examples](#12-code-examples)
13. [Glossary](#13-glossary)
14. [What Symbia Does NOT Do](#14-what-symbia-does-not-do)

---

## 1. PROJECT IDENTITY

### Basic Information

| Field | Value |
|-------|-------|
| **Name** | Symbia Stack |
| **Tagline** | LLM-Native Orchestration Platform |
| **One-liner** | The backend for AI-native applications |
| **License** | MIT |
| **Repository** | github.com/symbia-labs/symbia-stack |
| **Organization** | Symbia Labs |
| **Primary Language** | TypeScript |
| **Runtime** | Node.js 20+ |

### Brand Voice

- **Tone:** Technical but accessible. Confident, not arrogant. Precise, not verbose.
- **Audience:** Backend engineers, platform engineers, AI/ML engineers, technical founders
- **Avoid:** Buzzwords, hype, vague claims, "revolutionary," "game-changing"
- **Embrace:** Concrete examples, architecture diagrams, code snippets, honest limitations

### Logo & Colors

- **Primary Accent:** Cyan/Teal `#3fb8af` (use for CTAs, links, highlights)
- **Secondary:** Purple `#a855f7` (for diagrams, node colors)
- **Dark Mode Default:** Background `#0d1117`, Cards `#161b22`
- **Light Mode:** Background `#f6f8fa`, Cards `#ffffff`

---

## 2. CORE THESIS & POSITIONING

### The Central Paradigm Shift

**Traditional View:** AI is an API call — a stateless function you invoke and forget.

**Symbia View:** AI is a principal — an actor with identity, state, capabilities, and autonomous action abilities.

### Elevator Pitch (30 seconds)

> Symbia Stack is an open-source backend for AI-native applications. It treats AI assistants as first-class principals with authentication, authorization, and audit trails — just like human users. It provides graph-based workflow orchestration, real-time stream control, and a service mesh designed for multi-agent coordination.

### Expanded Pitch (2 minutes)

> When you add AI to your application, you're not just adding an API call — you're adding an actor that can make decisions, take actions, and operate semi-autonomously. Traditional backend architectures weren't designed for this.
>
> Symbia Stack solves five fundamental problems:
>
> 1. **Identity Crisis** — Who authorized this AI action? Symbia's Dual Principal Model tracks both the user AND the assistant in every request.
>
> 2. **Orchestration Complexity** — AI workflows are complex DAGs of prompts, tools, and conditions. Symbia uses declarative graphs, not imperative code.
>
> 3. **Communication Mismatch** — LLM responses stream over seconds. Users interrupt mid-stream. Symbia provides pause, resume, preempt, and handoff semantics.
>
> 4. **Observability Gaps** — Generic APM doesn't understand tokens, latency, or reasoning. Symbia tracks LLM-aware metrics with AI-powered analysis.
>
> 5. **Service Coordination** — When multiple agents need to collaborate, who goes first? Symbia's SDN provides claim/defer turn-taking protocol.

### Positioning Statement

**For:** Teams building AI-native applications that need production-grade infrastructure
**Symbia Stack is:** An open-source LLM orchestration platform
**That provides:** Identity, orchestration, messaging, and observability designed for AI
**Unlike:** Building custom infrastructure or using prompt-only frameworks
**Symbia:** Treats AI as a first-class principal with authentication, state, and coordination

---

## 3. THE FIVE PROBLEMS SYMBIA SOLVES

Use these problem/solution pairs consistently across all content:

### Problem 1: Identity Crisis

**The Problem:**
Traditional auth models track users. But when an AI assistant makes a request on behalf of a user, critical questions go unanswered: Who authorized this? Which assistant is executing? What capabilities were granted? What's the audit trail?

**Symbia's Solution: Dual Principal Model**
Every request carries two authenticated principals: the user who authorized the action AND the assistant executing it. Both are authenticated via JWT, both have declared capabilities, and both are audited. The Identity Service maintains an Entity Directory where agents get UUIDs (`ent_xxx`) just like users.

**Key Features:**
- User Principal: Human identity with org membership and roles
- Assistant Principal: AI identity with declared capabilities and rules
- Compound Token: JWT encodes both principals with intersection of permissions
- Entity Directory: Unified addressing for users, agents, and services
- Audit Trail: Every action logged with full principal context

---

### Problem 2: Orchestration Complexity

**The Problem:**
AI behavior is complex — routing, branching, fallbacks, tool calls, handoffs. Expressing this in imperative code creates tangled state machines that are impossible to visualize, version, or modify at runtime.

**Symbia's Solution: Graph-Based Workflows**
Workflows are declarative JSON DAGs (Directed Acyclic Graphs). They're serializable, version-controlled, and runtime-mutable. The visual editor lets you design workflows; the Runtime service executes them.

**Key Features:**
- Visual Editing: Design workflows in the Control Center graph editor
- Hot Reload: Update workflows without service restarts
- A/B Testing: Run multiple workflow versions simultaneously
- Version Control: Git-friendly JSON diffs for workflow history
- 21 Action Handlers: llm.invoke, message.send, parallel, condition, loop, etc.

---

### Problem 3: Communication Mismatch

**The Problem:**
LLM responses stream over seconds or minutes. Users don't wait politely — they interrupt, correct, redirect. Traditional request/response has no concept of mid-stream control.

**Symbia's Solution: Stream Control Semantics**
Every streaming response is controllable via WebSocket control events. Pause it, resume it, preempt it with new context, or hand it off to another assistant — all without losing state.

**Control Events:**
- `stream.pause` — Suspend streaming while preserving generation state
- `stream.resume` — Continue from exact pause point with context intact
- `stream.preempt` — Interrupt with new user input; assistant adapts mid-response
- `stream.handoff` — Transfer stream to different assistant with full context
- `stream.cancel` — Terminate the stream cleanly

---

### Problem 4: Observability Gaps

**The Problem:**
Generic APM tools track HTTP requests and database queries. They don't understand token usage, prompt latency, completion rates, or reasoning chains. Debugging AI applications requires specialized observability.

**Symbia's Solution: LLM-Aware Telemetry**
The Logging Service tracks logs, metrics, and traces with AI-native awareness. Every LLM call logs prompt tokens, completion tokens, latency, model, and finish reason. Run IDs correlate execution across the entire graph.

**Key Features:**
- Token Tracking: Prompt, completion, and total tokens per call
- Cost Analysis: Per-org usage dashboards
- Run Correlation: Trace execution across graph nodes via run ID
- AI Analysis: Built-in assistants that analyze your logs
- Stream-Aware: Logs include stream state (paused, preempted, etc.)

---

### Problem 5: Service Coordination

**The Problem:**
When multiple AI agents can respond to a message, who goes first? Without coordination, you get race conditions, duplicate responses, or silence. Implicit HTTP calls create tangled dependencies.

**Symbia's Solution: SDN with Turn-Taking Protocol**
The Network Service is a Software-Defined Network (SDN) that routes events between services using explicit contracts. The turn-taking protocol lets agents claim work with justification, defer to others, or observe outcomes.

**Turn-Taking Events:**
- `assistant.intent.claim` — "I should handle this because [justification]"
- `assistant.intent.defer` — "Another assistant is better suited"
- `assistant.action.respond` — "Here is my response"
- `observation.create` — "I'm watching but not acting"

**Contract-Based Communication:**
- Every service-to-service path requires explicit authorization
- Policies can allow, deny, route, transform, or log events
- HMAC-SHA256 verification prevents tampering

---

## 4. ARCHITECTURE OVERVIEW

### Service Topology

```
┌─────────────────────────────────────────────────────────────────────┐
│                         TIER 3: Application                          │
├─────────────────┬─────────────────┬─────────────────┬───────────────┤
│   Assistants    │     Runtime     │  Integrations   │    Network    │
│     :5004       │      :5006      │      :5007      │     :5054     │
│  AI Workflows   │  Graph Engine   │   LLM Gateway   │   SDN Mesh    │
├─────────────────┴─────────────────┴─────────────────┴───────────────┤
│                         TIER 2: Core Services                        │
├─────────────────────┬─────────────────────┬─────────────────────────┤
│       Catalog       │      Messaging      │        Logging          │
│        :5003        │        :5005        │         :5002           │
│   Resource Registry │    Real-time Comms  │       Telemetry         │
├─────────────────────┴─────────────────────┴─────────────────────────┤
│                       TIER 1: Foundation                             │
├─────────────────────────────────────────────────────────────────────┤
│                            Identity                                  │
│                             :5001                                    │
│              Auth • Dual Principal • Entity Directory                │
├─────────────────────────────────────────────────────────────────────┤
│                           PostgreSQL                                 │
│                             :5432                                    │
└─────────────────────────────────────────────────────────────────────┘
```

### Port Reference

| Port | Service | Purpose |
|------|---------|---------|
| 5001 | Identity | Authentication, authorization, Entity Directory |
| 5002 | Logging | Logs, metrics, traces, AI analysis |
| 5003 | Catalog | Versioned resource registry |
| 5004 | Assistants | AI workflow orchestration, rule engine |
| 5005 | Messaging | Real-time WebSocket conversations |
| 5006 | Runtime | Dataflow graph execution |
| 5007 | Integrations | LLM provider gateway |
| 5054 | Network | SDN mesh, contract-based routing |
| 5432 | PostgreSQL | Shared database |

### Data Flow Example

```
User sends message
    ↓
Messaging Service (5005) receives via WebSocket
    ↓
SDN (5054) broadcasts message.new event
    ↓
Assistants Service (5004) evaluates rules
    ↓
Rule matches → Execute action chain
    ↓
llm.invoke action → Integrations (5007) → OpenAI/Anthropic
    ↓
Response streams back through Messaging → User
    ↓
Logging (5002) captures metrics: tokens, latency, run ID
```

---

## 5. COMPLETE SERVICE REFERENCE

### 5.1 Identity Service (Port 5001)

**Purpose:** Authentication, authorization, and the Dual Principal Model. Issues tokens for both users and AI assistants.

**Key Concepts:**
- **Entity Directory:** Unified table of users, agents, and services. Each gets a UUID (`ent_xxx`).
- **Dual Principal:** Every authenticated request carries user identity AND assistant identity.
- **Entitlements:** Capabilities (`cap:*`) and roles (`role:*`) with inheritance.
- **Credential Vault:** Encrypted storage for API keys (OpenAI, Anthropic, etc.).

**API Endpoints:**
- `POST /api/auth/login` — Email/password login → session + JWT
- `POST /api/auth/introspect` — Validate token, return principal context
- `POST /api/agents/authenticate` — Agent credential → JWT
- `GET /api/entities/:id` — Lookup entity by UUID
- `POST /api/credentials` — Store encrypted credential
- `GET /api/internal/credentials/:userId/:provider` — Fetch credential (service-to-service)

**Authentication Flows:**
1. **User:** email/password → session cookie + JWT (7-day expiry)
2. **Agent:** agentId + secret → JWT (7-day expiry)
3. **Service-to-Service:** X-API-Key header
4. **Token Introspection:** Any service can validate tokens via Identity

---

### 5.2 Logging Service (Port 5002)

**Purpose:** Unified observability for the entire platform. Logs, metrics, traces, and AI-powered analysis.

**Key Concepts:**
- **Structured Logging:** JSON logs with automatic context enrichment
- **Run Correlation:** Every execution gets a run ID linking all events
- **Token Tracking:** Every LLM call logs prompt/completion/total tokens
- **AI Analysis:** Built-in assistants analyze error patterns

**API Endpoints:**
- `POST /api/logs` — Ingest log entry
- `GET /api/logs` — Query with filters (level, source, time range)
- `GET /api/logs/stream` — SSE real-time tail
- `GET /api/metrics` — Aggregated metrics
- `POST /api/traces` — Ingest trace span

**Log Entry Structure:**
```json
{
  "timestamp": "2026-01-30T12:00:00Z",
  "level": "info",
  "source": "assistants",
  "message": "LLM invoke completed",
  "data": {
    "runId": "run_abc123",
    "model": "gpt-4o-mini",
    "promptTokens": 150,
    "completionTokens": 89,
    "latencyMs": 1234
  },
  "traceId": "trace_xyz789",
  "orgId": "org_123"
}
```

---

### 5.3 Catalog Service (Port 5003)

**Purpose:** Centralized registry for all platform resources — services, assistants, workflows, integrations.

**Key Concepts:**
- **Resource Types:** services, assistants, graphs, integrations, artifacts, schemas
- **Versioning:** Every resource has version tracking
- **Namespace Resolution:** `catalog://` URIs for cross-service references
- **Access Control:** Owner, org, and public visibility

**API Endpoints:**
- `GET /api/catalog/resources` — List resources by type
- `POST /api/catalog/resources` — Register new resource
- `GET /api/catalog/resources/:id` — Get resource by ID
- `PUT /api/catalog/resources/:id` — Update resource
- `GET /api/catalog/resolve?uri=catalog://...` — Resolve URI to resource

**Resource Structure:**
```json
{
  "id": "res_abc123",
  "type": "assistant",
  "name": "log-analyst",
  "version": "1.0.0",
  "metadata": {
    "alias": "@logs",
    "capabilities": ["logging.query", "logging.analyze"]
  },
  "orgId": "org_123",
  "createdAt": "2026-01-30T12:00:00Z"
}
```

---

### 5.4 Assistants Service (Port 5004)

**Purpose:** AI workflow orchestration. Rule engine, action handlers, turn-taking, @mention routing.

**Key Concepts:**
- **Rule Engine:** Pattern-matched rules trigger action chains
- **Action Handlers:** 21 built-in handlers (llm.invoke, message.send, parallel, etc.)
- **Turn-Taking:** Claim/defer protocol for multi-agent coordination
- **@Mention Routing:** `@logs`, `@catalog`, `@debug` invoke specific assistants

**Rule Structure:**
```json
{
  "id": "rule_123",
  "name": "Answer questions",
  "priority": 100,
  "trigger": "message.received",
  "conditions": {
    "all": [
      { "field": "message.content", "operator": "contains", "value": "?" }
    ]
  },
  "actions": [
    { "type": "llm.invoke", "config": { "model": "gpt-4o-mini" } },
    { "type": "message.send", "config": { "content": "{{llmResponse}}" } }
  ]
}
```

**Action Handlers:**

| Handler | Purpose |
|---------|---------|
| `llm.invoke` | Call LLM with context injection |
| `message.send` | Send response to conversation |
| `parallel` | Execute actions concurrently (all/any/settle strategies) |
| `condition` | Conditional branching (if/then/else) |
| `loop` | Iterate over collections |
| `wait` | Delay execution |
| `handoff.create` | Initiate bot-to-human handoff |
| `service.call` | Call other Symbia services |
| `webhook.call` | Call external HTTP endpoints |
| `code.tool.invoke` | Execute bash/file ops in sandbox |
| `context.update` | Modify conversation context |
| `embedding.route` | Semantic routing based on embeddings |

**Built-in Assistants:**

| Key | Alias | Purpose |
|-----|-------|---------|
| `log-analyst` | `@logs` | Query and analyze logs |
| `catalog-search` | `@catalog` | Search resources |
| `run-debugger` | `@debug` | Debug workflow executions |
| `usage-reporter` | `@usage` | Token usage and cost analysis |
| `onboarding` | `@help` | Platform guidance |
| `cli-assistant` | `@cli` | CLI and API reference |

---

### 5.5 Messaging Service (Port 5005)

**Purpose:** Real-time conversation orchestration with stream control semantics.

**Key Concepts:**
- **Conversations:** Private (1:1) or group (multi-participant)
- **Participants:** Users, agents, or services with roles (owner, admin, member)
- **Control Events:** Pause, resume, preempt, handoff, cancel
- **Priority:** Messages have priority levels (low, normal, high, critical)

**WebSocket Events (Client → Server):**
- `join:conversation` — Subscribe to conversation room
- `message:send` — Send message
- `control:send` — Send control event
- `typing:start` / `typing:stop` — Typing indicators

**WebSocket Events (Server → Client):**
- `message:new` — New message received
- `stream.pause` / `stream.resume` / `stream.preempt` — Control events
- `typing:started` / `typing:stopped` — Typing indicators

**Message Structure:**
```json
{
  "id": "msg_abc123",
  "conversationId": "conv_xyz789",
  "senderId": "user_123",
  "senderType": "user",
  "content": "What's in my logs?",
  "contentType": "text",
  "priority": "normal",
  "metadata": {
    "runId": "run_abc123",
    "interruptible": true
  },
  "createdAt": "2026-01-30T12:00:00Z"
}
```

---

### 5.6 Runtime Service (Port 5006)

**Purpose:** Dataflow graph execution engine. Interprets node definitions, manages state, coordinates data flow.

**Key Concepts:**
- **Graphs:** JSON DAGs defining workflow logic
- **Nodes:** Typed components (input, llm, router, tool, condition, output)
- **Edges:** Data flow connections between nodes
- **Runs:** Execution instances with state and logs

**Node Types:**

| Type | Color | Purpose |
|------|-------|---------|
| `input` | Green | Entry point for execution |
| `llm` | Pink | Execute LLM prompts |
| `router` | Purple | Conditional branching |
| `tool` | Cyan | Execute integrations |
| `condition` | Yellow | Boolean logic gates |
| `recall` | Violet | Memory/retrieval |
| `say` | Light Pink | Respond to user |
| `output` | Orange | Terminal nodes |

**Graph Structure:**
```json
{
  "id": "graph_abc123",
  "name": "Customer Support",
  "version": "1.0.0",
  "components": [
    { "id": "trigger", "type": "input", "config": {} },
    { "id": "classify", "type": "llm", "config": { "model": "gpt-4o-mini" } },
    { "id": "route", "type": "router", "config": { "rules": [...] } },
    { "id": "respond", "type": "say", "config": {} }
  ],
  "edges": [
    { "from": "trigger", "to": "classify" },
    { "from": "classify", "to": "route" },
    { "from": "route", "to": "respond" }
  ]
}
```

---

### 5.7 Integrations Service (Port 5007)

**Purpose:** Gateway to external LLM providers (OpenAI, Anthropic, HuggingFace) and third-party APIs.

**Key Concepts:**
- **Provider Adapters:** Normalize different LLM APIs to consistent interface
- **Credential Routing:** Fetches credentials from Identity vault per-request
- **Response Normalization:** All providers return identical response schema
- **Usage Tracking:** Token counts, latency, cost per org

**Supported Providers:**

| Provider | Operations | Default Model |
|----------|------------|---------------|
| OpenAI | chat.completions, responses, embeddings | gpt-4o-mini |
| Anthropic | messages | claude-3-5-sonnet |
| HuggingFace | chat.completions, text.generation, embeddings | Llama-3.2-3B-Instruct |

**API Endpoints:**
- `POST /api/integrations/execute` — Execute LLM call
- `GET /api/integrations/providers` — List available providers
- `GET /api/integrations/providers/:provider/models` — List models

**Request/Response:**
```json
// Request
{
  "provider": "openai",
  "operation": "chat.completions",
  "params": {
    "model": "gpt-4o-mini",
    "messages": [{ "role": "user", "content": "Hello" }],
    "temperature": 0.7
  }
}

// Response (normalized)
{
  "success": true,
  "data": {
    "provider": "openai",
    "model": "gpt-4o-mini",
    "content": "Hello! How can I help you today?",
    "usage": {
      "promptTokens": 10,
      "completionTokens": 12,
      "totalTokens": 22
    },
    "finishReason": "stop"
  },
  "durationMs": 523
}
```

---

### 5.8 Network Service (Port 5054)

**Purpose:** Software-Defined Network (SDN) for service mesh, event routing, and policy enforcement.

**Key Concepts:**
- **Nodes:** Registered services with capabilities
- **Contracts:** Explicit authorization for service-to-service communication
- **Policies:** Rules that allow, deny, route, transform, or log events
- **Event Routing:** WebSocket-first, HTTP fallback

**Contract Structure:**
```json
{
  "id": "contract_abc123",
  "source": "messaging",
  "target": "assistants",
  "eventTypes": ["message.new", "message.updated"],
  "boundaries": {
    "allowedOrgs": ["org_123"],
    "maxEventsPerSecond": 100
  },
  "status": "active"
}
```

**Policy Actions:**
- `allow` — Permit the event
- `deny` — Block the event
- `route` — Redirect to different target
- `transform` — Modify event payload
- `log` — Record for audit

**SDN Events:**
- `node.register` — Service joins mesh
- `node.deregister` — Service leaves mesh
- `contract.create` / `contract.revoke` — Authorization changes
- `event.route` — Event delivery
- `trace.record` — Observability

---

## 6. SHARED LIBRARIES REFERENCE

All libraries are scoped under `@symbia/*` and installed via npm with `file:../symbia-*` references.

| Package | Purpose |
|---------|---------|
| `@symbia/sys` | Service registry, port resolution, Symbia Script parser |
| `@symbia/http` | Express server factory with health checks, graceful shutdown |
| `@symbia/db` | Drizzle ORM wrapper with PostgreSQL/pg-mem dual-mode |
| `@symbia/relay` | SDN client for publishing/subscribing to events |
| `@symbia/logging-client` | Telemetry SDK for logs, metrics, traces |
| `@symbia/id` | Identity client for token validation |
| `@symbia/messaging-client` | Messaging client with Socket.IO |
| `@symbia/catalog-client` | Catalog client for resource lookup |
| `@symbia/seed` | Development seed data utilities |
| `@symbia/md` | Markdown documentation generator |
| `@symbia/cli` | Command-line interface |

### Symbia Script

Template interpolation language used across all services:

```
{{@user.name}}           → Current user's name
{{@message.content}}     → Current message content
{{context.lastResponse}} → Custom context variable
{{llmResponse}}          → Output from previous llm.invoke
```

---

## 7. KEY INNOVATIONS & DIFFERENTIATORS

Use these when writing about Symbia's unique value:

### 7.1 Entity Directory

Unified identity table spanning users, agents, and services. Every entity gets a UUID (`ent_xxx`) that works across all services. No more "is this a user ID or an agent ID?"

### 7.2 Turn-Taking Protocol

Multi-agent coordination without race conditions. Agents claim work with explicit justification, defer to others, or observe. No duplicate responses, no silence.

### 7.3 Entitlements Model

Capabilities (`cap:*`) plus roles (`role:*`) with inheritance. More flexible than RBAC alone. Supports fine-grained permissions like `cap:messaging.interrupt`.

### 7.4 Contract-Based Communication

No implicit service-to-service calls. Every path requires explicit authorization. Audit every event. Enforce policies at the network layer.

### 7.5 Dual-Mode Database

Same code runs on PostgreSQL (production) or pg-mem (development). No Docker required for local dev. `npm run dev` just works.

### 7.6 Control Events

First-class pause/resume/preempt/handoff for streaming LLM responses. Users can interrupt. Assistants can hand off. State is preserved.

### 7.7 Self-Documenting Services

Every service auto-generates `/docs/llms.txt` — LLM-optimized documentation. Assistants discover capabilities without human help.

---

## 8. DESIGN SYSTEM & BRAND

### Color Palette

**Primary Accent (Cyan/Teal):**
- Default: `#3fb8af`
- Hover: `#4ddbd0`
- Pressed: `#0d9488`

**Semantic Colors:**
- Success: `#3fb950` (dark) / `#1a7f37` (light)
- Warning: `#d29922` (dark) / `#9a6700` (light)
- Error: `#f85149` (dark) / `#cf222e` (light)
- Info: `#58a6ff` (dark) / `#0969da` (light)

**Node Colors (for workflow diagrams):**
- Input: `#3fb950` (green)
- Output: `#f97316` (orange)
- LLM: `#ec4899` (pink)
- Router: `#a855f7` (purple)
- Tool: `#06b6d4` (cyan)
- Condition: `#eab308` (yellow)
- Recall: `#8b5cf6` (violet)
- Say: `#f472b6` (light pink)

### Typography

- **Sans-serif:** Inter, system-ui fallback
- **Monospace:** JetBrains Mono, Fira Code fallback
- **Use monospace for:** API paths, code, @mentions, technical IDs, metrics

### Dark Mode (Default)

- Page background: `#0d1117`
- Card background: `#161b22`
- Border: `#30363d`
- Text primary: `#e6edf3`
- Text secondary: `#8b949e`

### Light Mode

- Page background: `#f6f8fa`
- Card background: `#ffffff`
- Border: `#d1d5da`
- Text primary: `#1f2328`
- Text secondary: `#57606a`

---

## 9. CONTENT GUIDELINES

### Writing Style

1. **Be concrete.** Don't say "powerful orchestration" — say "21 action handlers including parallel execution, loops, and conditional branching."

2. **Show code.** Every feature explanation should include a code snippet or JSON example.

3. **Acknowledge limitations.** Symbia doesn't do X — that's honest and builds trust.

4. **Use active voice.** "Symbia tracks tokens" not "Tokens are tracked by Symbia."

5. **Avoid jargon.** Define terms on first use. Use the glossary.

### Formatting Rules

- Headers use sentence case ("Getting started" not "Getting Started")
- Code blocks use language hints (```typescript, ```json, ```bash)
- API endpoints in monospace: `POST /api/auth/login`
- Service names capitalized: Identity Service, Messaging Service
- Port numbers with colon: `:5001`, `:5054`

### SEO Keywords

Primary: LLM orchestration, AI backend, multi-agent coordination, AI authentication
Secondary: agentic workflows, AI observability, streaming control, AI authorization
Long-tail: open source AI platform, LLM gateway, AI workflow engine, agent identity

---

## 10. PAGE-SPECIFIC CONTENT

### 10.1 Homepage

**Hero Section:**
- Headline: "The Backend for AI-Native Applications"
- Subhead: "Open-source platform for LLM orchestration, multi-agent coordination, and AI-aware observability."
- CTA: "Get Started" → docs, "View on GitHub" → repo

**Problem Section:**
Show the 5 problems (Identity Crisis, Orchestration Complexity, etc.) with icons and 1-sentence descriptions.

**Architecture Section:**
Use the 3-tier diagram. Animate service connections.

**Features Grid:**
6 cards for main solutions (Dual Principal, Stream Control, Graphs, Self-Doc, Multi-Tenant, Integrations).

**Footer CTA:**
"Star us on GitHub" with live star count.

---

### 10.2 Documentation

**Structure:**
```
/docs
├── getting-started/
│   ├── quickstart.md
│   ├── installation.md
│   └── first-assistant.md
├── concepts/
│   ├── dual-principal.md
│   ├── graphs-not-code.md
│   ├── stream-control.md
│   └── turn-taking.md
├── services/
│   ├── identity.md
│   ├── logging.md
│   ├── catalog.md
│   ├── assistants.md
│   ├── messaging.md
│   ├── runtime.md
│   ├── integrations.md
│   └── network.md
├── guides/
│   ├── custom-assistant.md
│   ├── workflow-design.md
│   └── production-deployment.md
└── api/
    └── [auto-generated OpenAPI docs]
```

---

### 10.3 GitHub README

**Structure:**
1. Logo + badges (license, version, stars)
2. One-liner description
3. "Why Symbia?" — 5 bullet points for the problems
4. Quick start (5 commands)
5. Architecture diagram (ASCII or image)
6. Service table with ports and purposes
7. Documentation link
8. Contributing link
9. License

---

### 10.4 Blog Post Ideas

1. **"AI is a Principal, Not a Feature"** — The thesis post explaining the paradigm shift
2. **"Building a Multi-Agent Customer Support Bot with Symbia"** — Tutorial
3. **"Stream Control: Pause, Resume, and Preempt LLM Responses"** — Deep dive
4. **"Why We Built an SDN for AI Services"** — Architecture decision record
5. **"Observability for LLM Applications"** — Comparison with generic APM
6. **"The Case for Declarative AI Workflows"** — Graphs vs. code

---

## 11. TECHNICAL SPECIFICATIONS

### Prerequisites

- Node.js 20+
- npm 10+
- PostgreSQL 15+ (or use in-memory mode for development)
- Docker (optional, for containerized development)

### Quick Start

```bash
# Clone
git clone https://github.com/symbia-labs/symbia-stack.git
cd symbia-stack

# Start all services with Docker
docker-compose up -d

# Or start individual services for development
cd identity && npm install && SESSION_SECRET=dev npm run dev
cd catalog && npm install && npm run dev
# etc.
```

### Environment Variables

| Variable | Service | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | All | PostgreSQL connection string |
| `SESSION_SECRET` | Identity | Session encryption key |
| `IDENTITY_SERVICE_URL` | All others | Identity service endpoint |
| `NETWORK_HASH_SECRET` | Network | HMAC signing key |
| `OPENAI_API_KEY` | Integrations | OpenAI credentials |
| `ANTHROPIC_API_KEY` | Integrations | Anthropic credentials |

### Health Checks

All services expose:
- `GET /health/live` — Liveness probe
- `GET /health/ready` — Readiness probe
- `GET /health` — Detailed health with dependencies

### LLM-Optimized Docs

All services expose:
- `GET /docs/llms.txt` — Concise, LLM-optimized documentation
- `GET /docs/llms-full.txt` — Extended documentation with examples
- `GET /docs/openapi.json` — OpenAPI 3.0 specification

---

## 12. CODE EXAMPLES

### Authenticate a User

```typescript
// POST /api/auth/login
const response = await fetch('http://localhost:5001/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password123'
  })
});

const { token, user } = await response.json();
// token: JWT for subsequent requests
// user: { id, email, orgId, entitlements }
```

### Authenticate an Agent

```typescript
// POST /api/agents/authenticate
const response = await fetch('http://localhost:5001/api/agents/authenticate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    agentId: 'agent_log-analyst',
    credential: 'secret-credential'
  })
});

const { token, agent } = await response.json();
// token: JWT with agent principal
// agent: { id, key, capabilities }
```

### Send a Message

```typescript
// Connect to Messaging via Socket.IO
import { io } from 'socket.io-client';

const socket = io('http://localhost:5005', {
  auth: { token: 'your-jwt-token' }
});

socket.emit('join:conversation', { conversationId: 'conv_123' });

socket.emit('message:send', {
  conversationId: 'conv_123',
  content: '@logs show me errors from the last hour',
  contentType: 'text'
});

socket.on('message:new', (message) => {
  console.log('New message:', message.content);
});
```

### Execute LLM Call

```typescript
// POST /api/integrations/execute
const response = await fetch('http://localhost:5007/api/integrations/execute', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-jwt-token'
  },
  body: JSON.stringify({
    provider: 'openai',
    operation: 'chat.completions',
    params: {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What is Symbia?' }
      ],
      temperature: 0.7
    }
  })
});

const { data } = await response.json();
console.log(data.content);
console.log(`Tokens: ${data.usage.totalTokens}`);
```

### Create a Workflow Graph

```typescript
const graph = {
  name: 'Simple Q&A',
  components: [
    {
      id: 'input',
      type: 'input',
      config: { trigger: 'message.received' }
    },
    {
      id: 'think',
      type: 'llm',
      config: {
        model: 'gpt-4o-mini',
        systemPrompt: 'Answer the user question concisely.',
        promptTemplate: '{{@message.content}}'
      }
    },
    {
      id: 'respond',
      type: 'say',
      config: { content: '{{llmResponse}}' }
    }
  ],
  edges: [
    { from: 'input', to: 'think' },
    { from: 'think', to: 'respond' }
  ]
};

// POST /api/catalog/resources
await fetch('http://localhost:5003/api/catalog/resources', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-jwt-token'
  },
  body: JSON.stringify({
    type: 'graph',
    name: 'simple-qa',
    data: graph
  })
});
```

---

## 13. GLOSSARY

| Term | Definition |
|------|------------|
| **Principal** | An authenticated actor (user or agent) that can take actions |
| **Dual Principal** | Auth model tracking both user and assistant in every request |
| **Entity Directory** | Unified table of users, agents, and services with UUIDs |
| **Entitlement** | A capability (`cap:*`) or role (`role:*`) granting permissions |
| **SDN** | Software-Defined Network — the Network service's event routing system |
| **Contract** | Explicit authorization for service-to-service communication |
| **Graph** | Declarative JSON DAG defining a workflow |
| **Node** | A component in a graph (input, llm, router, tool, etc.) |
| **Edge** | Data flow connection between nodes |
| **Run** | A single execution instance of a graph |
| **Control Event** | Stream command (pause, resume, preempt, handoff, cancel) |
| **Turn-Taking** | Protocol for multi-agent coordination (claim/defer/respond) |
| **@Mention** | Syntax for invoking specific assistants (e.g., `@logs`) |
| **Symbia Script** | Template interpolation language (`{{@user.name}}`) |

---

## 14. WHAT SYMBIA DOES NOT DO

Be honest about limitations:

1. **No ML/Training** — Symbia orchestrates LLMs, it doesn't train them. Use OpenAI, Anthropic, or your own models.

2. **No Exactly-Once Delivery** — Event delivery is best-effort with idempotency in consumers. Not a replacement for Kafka.

3. **No Global Transactions** — Services use eventual consistency. No distributed ACID transactions.

4. **No Complex Event Processing** — Symbia routes events, it doesn't window or aggregate them. Not a replacement for Flink.

5. **No Hosted Service** — Symbia is self-hosted. No managed cloud version (yet).

6. **No RAG Built-In** — You can integrate vector databases via Integrations, but RAG isn't a core feature.

7. **No Fine-Tuning UI** — No interface for fine-tuning models. Use provider-specific tools.

---

## APPENDIX: QUICK REFERENCE CARD

```
SERVICES & PORTS
─────────────────────────────────────────
Identity     :5001   Auth, principals, vault
Logging      :5002   Logs, metrics, traces
Catalog      :5003   Resource registry
Assistants   :5004   AI orchestration
Messaging    :5005   Real-time comms
Runtime      :5006   Graph execution
Integrations :5007   LLM gateway
Network      :5054   SDN mesh

CORE CONCEPTS
─────────────────────────────────────────
Dual Principal    User + Agent in every request
Entity Directory  UUIDs for all actors (ent_xxx)
Graphs           JSON DAGs, not imperative code
Control Events   pause | resume | preempt | handoff
Turn-Taking      claim → defer → respond
Contracts        Explicit service-to-service auth

QUICK START
─────────────────────────────────────────
git clone github.com/symbia-labs/symbia-stack
cd symbia-stack && docker-compose up -d

COLORS
─────────────────────────────────────────
Primary:  #3fb8af (cyan/teal)
Success:  #3fb950
Warning:  #d29922
Error:    #f85149
Info:     #58a6ff
```

---

*Document generated from codebase analysis — January 2026*
*For questions, contact the Symbia Labs team*
