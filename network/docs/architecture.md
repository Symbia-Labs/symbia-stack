# Network Service Architecture

> For the complete architectural intent and design rationale, see [INTENT.md](../INTENT.md).

## Overview

The Network Service is a **software-defined network (SoftSDN)** for the Symbia platform that provides:

- **Event Routing** — Route events between registered nodes with contract enforcement
- **Policy Engine** — Evaluate routing rules (allow/deny/route/transform/log)
- **Service Discovery** — Node registration, heartbeat, and capability-based lookup
- **Observability** — Trace events, visualize topology, simulate routing

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Network Service                                │
│                                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│  │   Registry   │    │    Router    │    │    Policy    │              │
│  │   Service    │    │   Service    │    │   Engine     │              │
│  │              │    │              │    │              │              │
│  │ • Nodes      │    │ • Events     │    │ • Conditions │              │
│  │ • Contracts  │    │ • Traces     │    │ • Actions    │              │
│  │ • Bridges    │    │ • Delivery   │    │ • Evaluation │              │
│  └──────────────┘    └──────────────┘    └──────────────┘              │
│         │                   │                   │                       │
│         └───────────────────┼───────────────────┘                       │
│                             │                                           │
│  ┌──────────────────────────┼──────────────────────────────────┐       │
│  │                    Transport Layer                           │       │
│  │  ┌─────────────┐        │        ┌─────────────┐            │       │
│  │  │  REST API   │        │        │  WebSocket  │            │       │
│  │  │  (Express)  │        │        │ (Socket.IO) │            │       │
│  │  └─────────────┘        │        └─────────────┘            │       │
│  └─────────────────────────┼────────────────────────────────────┘       │
│                             │                                           │
│  ┌──────────────────────────┼──────────────────────────────────┐       │
│  │                    Telemetry Layer                           │       │
│  │  Metrics: network.event.*, network.node.*, network.policy.*  │       │
│  │  Events: lifecycle, routing, security, topology              │       │
│  └──────────────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────────┘
```

## API Layers

| Layer | Purpose | Examples |
|-------|---------|----------|
| **REST API** | Management operations | Register nodes, create contracts, send events |
| **SDN API** | Observability (read-only) | Query topology, trace events, simulate routing |
| **WebSocket** | Real-time communication | Live event delivery, SDN watching |

## Core Components

### Registry Service
Manages the network's view of nodes, contracts, and bridges.

- **Nodes**: Services, assistants, sandboxes, bridges
- **Contracts**: Authorization for node-to-node communication
- **Bridges**: External system connectors

### Router Service
Handles event creation, routing, and delivery.

- **Hash computation**: HMAC-SHA256 for tamper-evidence
- **Contract validation**: Check authorization
- **Delivery**: WebSocket (preferred) or HTTP POST
- **Tracing**: Record event paths

### Policy Engine
Evaluates routing rules before delivery.

- **Conditions**: Match on source, target, eventType, boundary, runId
- **Actions**: allow, deny, route, transform, log
- **Priority**: Higher priority policies evaluated first

## Data Flow

```
Event Received → Hash Computed → Source Validated → Contract Checked
       │                                                    │
       │              Policy Evaluation                     │
       │              ┌────────────┐                        │
       │              │ P100: allow│ ─→ Route to target     │
       │              │ P90: log   │ ─→ Log + continue      │
       │              │ P80: deny  │ ─→ Drop with reason    │
       │              │ P75: route │ ─→ Redirect target     │
       │              └────────────┘                        │
       │                     │                              │
       └────── Deliver (WebSocket or HTTP) ─────────────────┘
                             │
                      Record Trace
                      Notify SDN Watchers
```

## Storage

| Data | Storage | Retention |
|------|---------|-----------|
| Nodes | In-memory Map | Until unregistered or stale |
| Contracts | In-memory Map | Until deleted or expired |
| Events | Ring buffer (10K) | Rolling window |
| Traces | Ring buffer (5K) | Rolling window |
| Policies | In-memory Map | Until deleted |

## Key Design Decisions

1. **Explicit authorization via contracts** — No implicit communication paths
2. **Hash-based security commitment** — Tamper-evident events
3. **Centralized policy control** — Routing rules in one place
4. **Dual delivery (WebSocket + HTTP)** — Fastest available path
5. **Heartbeat-based liveness** — Detect and clean up stale nodes
6. **In-memory storage** — Low latency, reconstructable on restart

## Telemetry

The Network Service emits comprehensive telemetry:

- **Metrics**: `network.event.*`, `network.node.*`, `network.policy.*`, `network.socket.*`
- **Events**: Service lifecycle, routing decisions, security events, topology changes

See [README.md](../README.md#telemetry) for the full list.

---

*For detailed design rationale and data models, see [INTENT.md](../INTENT.md).*
