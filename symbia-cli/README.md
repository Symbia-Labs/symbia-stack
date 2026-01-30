# @symbia/cli - Symbia Platform CLI

Unified command-line interface for all Symbia platform services. Provides authentication, resource management, workflow orchestration, logging, messaging, and network operations.

## Capabilities

| Capability | Description |
|------------|-------------|
| Multi-Service Access | Single CLI for Identity, Catalog, Logging, Messaging, Assistants, Network, Server |
| Multi-Context Support | Switch between local, staging, production environments |
| Authentication | JWT token login, API key auth, automatic token refresh |
| Output Formats | Table, JSON, YAML, IDs-only for scripting |
| Symbia Script | DSL for defining computation graphs (.symbia files) |
| Network SDN | Software-defined networking commands for topology and routing |

## Quick Start

### Installation

```bash
npm install -g @symbia/cli

# Or from source
cd symbia-cli
npm run link
```

### Initial Setup

```bash
# Add local development context
symbia identity config add-context local -e http://localhost

# Login with email/password
symbia identity login -e user@example.com

# Or login with API key
symbia identity login -k sk_live_xxxxx

# Verify authentication
symbia identity whoami
```

### Basic Usage

```bash
# Check service connectivity
symbia status

# List resources
symbia catalog list -t component

# Query logs
symbia logging query -l error --last 1h

# Send message to assistant
symbia assistants query my-assistant "Hello, world"

# View network topology
symbia network sdn topology
```

## Architecture

### Directory Structure

```
symbia-cli/
├── src/
│   ├── index.ts          # Main entry - registers all commands
│   ├── auth.ts           # Authentication logic
│   ├── client.ts         # HTTP client for service requests
│   ├── config.ts         # Configuration and credential management
│   ├── output.ts         # Output formatting (table, JSON, YAML)
│   └── commands/         # Service-specific command handlers
│       ├── identity.ts   # Auth, orgs, API keys, config
│       ├── catalog.ts    # Resource catalog management
│       ├── logging.ts    # Logs, metrics, traces
│       ├── messaging.ts  # Conversations, messages
│       ├── assistants.ts # Graphs, runs, actors, rules
│       ├── network.ts    # Nodes, contracts, bridges, policies
│       ├── server.ts     # Builds, proxy operations
│       └── script.ts     # Symbia Script compilation
├── dist/                 # Compiled JavaScript
├── package.json
└── tsconfig.json
```

### Service Aliases

| Service | Alias | Port |
|---------|-------|------|
| identity | auth | 5001 |
| catalog | cat | 5003 |
| logging | logs | 5002 |
| messaging | msg | 5005 |
| assistants | ast | 5004 |
| network | net | 5054 |
| server | srv | 5000 |
| script | graph | N/A |

## Authentication

### Configuration Files

```
~/.symbia/
├── config.yaml           # Contexts and settings (mode 0600)
└── credentials.json      # Tokens and API keys (mode 0600)
```

### Config Format

```yaml
# ~/.symbia/config.yaml
current-context: local
contexts:
  local:
    name: local
    endpoint: http://localhost
    org: optional-org-id
  production:
    name: production
    endpoint: https://api.example.com
    org: prod-org-id
```

### Login Methods

```bash
# Interactive email/password login
symbia identity login

# Email via CLI flag
symbia identity login -e user@example.com

# API key authentication
symbia identity login -k sk_live_xxxxx

# Logout
symbia identity logout
```

### Token Management

- JWT tokens stored in credentials.json
- Automatic refresh 5 minutes before expiry
- Refresh uses `/api/auth/refresh` endpoint
- API keys don't require refresh

## Global Options

All commands support:

| Option | Description |
|--------|-------------|
| `-c, --context <name>` | Use specific context |
| `-o, --output <format>` | Output format: table, json, yaml, ids |
| `--no-color` | Disable colored output |

## Command Reference

### Global Commands

```bash
# System status and info
symbia status                              # Check connectivity to all services
symbia version                             # Show CLI version and context info
symbia docs                                # Open CLI documentation

# These commands work without authentication
```

### Identity Commands

```bash
# Authentication
symbia identity login                      # Interactive login
symbia identity login -e email@example.com # Email login
symbia identity login -k <api-key>         # API key login
symbia identity logout                     # Clear credentials
symbia identity whoami                     # Show current user

# Organizations
symbia identity orgs list                  # List organizations
symbia identity orgs create <name>         # Create organization

# Users
symbia identity users list [--org <id>]    # List users

# API Keys
symbia identity keys list                  # List API keys
symbia identity keys create <name> -s read,write -e 90  # Create with scope/expiry
symbia identity keys revoke <id>           # Revoke key

# Configuration
symbia identity config view                # Show current config
symbia identity config contexts            # List all contexts
symbia identity config use-context <name>  # Switch context
symbia identity config add-context <name> -e <url> [-o <org>]  # Add context
symbia identity config set <key> <value>   # Update config (endpoint|org)
```

### Catalog Commands

```bash
# Resource Management
symbia catalog list [-t type] [-s status] [-l limit]  # List resources
symbia catalog get <id>                    # Show resource details
symbia catalog create <type> -n <name> [-d desc] [-f file]  # Create
symbia catalog update <id> [-n name] [-d desc] [-f file]    # Update
symbia catalog delete <id> -f              # Delete (requires --force)
symbia catalog publish <id>                # Publish resource
symbia catalog search <query> [-t type]    # Search resources
symbia catalog versions <id>               # List versions

# Resource types: component, context, integration, graph, executor
# Status filters: draft, published, deprecated
```

### Logging Commands

```bash
# Log Streams
symbia logging streams list                # List streams
symbia logging streams create <name>       # Create stream

# Query Logs
symbia logging query [<query>]             # Query logs
symbia logging query -s stream -l error --last 1h  # Filter and time range
symbia logging tail [stream]               # Recent logs
symbia logging tail stream --follow        # Follow mode

# Time Options: --last <duration>, --from <timestamp>, --to <timestamp>
# Durations: 1h, 30m, 7d

# Metrics
symbia logging metrics list                # List metric definitions
symbia logging metrics query <name> --last 1h  # Query metrics

# Traces
symbia logging traces get <traceId>        # Get trace with spans
```

### Messaging Commands

```bash
# Conversations
symbia messaging conversations list [-l limit]  # List conversations
symbia messaging conversations create <name> [-t type]  # Create (private|group)
symbia messaging conversations get <id>    # Show details
symbia messaging conversations delete <id> -f  # Delete

# Messages
symbia messaging messages list <conversationId> [-l limit]  # List messages
symbia messaging messages send <conversationId> <content>   # Send message

# Participants
symbia messaging participants list <conversationId>  # List participants
symbia messaging participants add <convId> <userId> [-t user|agent] [-r owner|admin|member]
symbia messaging participants remove <conversationId> <userId>
```

### Assistants Commands

```bash
# Graphs (Workflows)
symbia assistants graphs list              # List graphs
symbia assistants graphs get <id>          # Show details
symbia assistants graphs create <name> [-d desc] [--json definition]
symbia assistants graphs update <id> [-n name] [-d desc]
symbia assistants graphs delete <id> -f    # Delete
symbia assistants graphs publish <id>      # Publish

# Runs (Executions)
symbia assistants runs list [-g graphId] [-s status] [-l limit]
symbia assistants runs get <id>            # Show run details
symbia assistants runs logs <id> [-l level]  # Get run logs

# Actors (Principals)
symbia assistants actors list [-t agent|assistant]
symbia assistants actors get <id>
symbia assistants actors create <principalId> [-n name] [-t type] [-g graphId]
symbia assistants actors update <id> [-n name] [--active true|false]
symbia assistants actors delete <id> -f

# Rules
symbia assistants rules list               # List rule sets
symbia assistants rules get <orgId>        # Get org's rules
symbia assistants rules create <name> [-d desc]

# Direct Assistant Interaction
symbia assistants list                     # List assistants
symbia assistants get <key>                # Show assistant
symbia assistants create <key> [-n name] [--model] [--temperature]
symbia assistants update <key> [-n name] [--status]
symbia assistants delete <key> -f
symbia assistants query <key> <message>    # Send message

# Settings
symbia assistants settings llm             # Get LLM settings
symbia assistants settings llm-set [-p provider] [-m model] [-t temp] [--api-key]
```

### Network Commands

```bash
# Nodes (Network Registry)
symbia network nodes list [-t service|assistant|sandbox|bridge]
symbia network nodes get <id>
symbia network nodes register -i <id> -n <name> -t <type> -e <endpoint> [-c caps]
symbia network nodes unregister <id>
symbia network nodes heartbeat <id>
symbia network nodes find-capability <capability>

# Contracts (Node Permissions)
symbia network contracts list [-n nodeId]
symbia network contracts create --from <id> --to <id> [-e types] [-b bounds] [--expires date]
symbia network contracts delete <id>

# Bridges (External Connections)
symbia network bridges list
symbia network bridges get <id>
symbia network bridges create -n <name> -t webhook|websocket|grpc|custom -e <endpoint>
symbia network bridges activate <id>
symbia network bridges deactivate <id>
symbia network bridges delete <id>

# Events (Network Traffic)
symbia network events list [-r runId] [-l limit]
symbia network events send -t <type> -s <source> -r <runId> [-d data]
symbia network events trace <eventId>
symbia network events stats

# Routing Policies
symbia network policies list
symbia network policies get <id>
symbia network policies create -n <name> -p <priority> --action allow|deny|route|transform|log
symbia network policies update <id> [-n name] [--enabled true|false]
symbia network policies delete <id>
symbia network policies test -t <type> -s <source> -r <runId>

# Software-Defined Networking (SDN)
symbia network sdn topology               # Network topology
symbia network sdn summary                # Network state summary
symbia network sdn flow <runId>           # Event flow for run
symbia network sdn graph                  # Adjacency graph
symbia network sdn simulate -t <type> -s <source> -r <runId>  # Dry-run routing
```

### Server Commands

```bash
# Health & Builds
symbia server health                       # Check health
symbia server builds list                  # List builds
symbia server builds get <buildId>         # Show build
symbia server builds create [-n name]      # Create build
symbia server builds delete <buildId> -f   # Delete
symbia server builds promote <buildId>     # Promote to active
symbia server builds artifacts <buildId>   # Get artifacts

# Inputs
symbia server inputs                       # Get input files

# Proxy Operations
symbia server proxy execute -t llm|api|file_gen|external -s <source> [-p params]
symbia server proxy operations [-s source] [--trusted]
symbia server proxy operation <inputHash>

# External Sources
symbia server sources list
symbia server sources get <sourceId>
symbia server sources create -i <id> -t llm|api|user_input [--trusted] [--trust-level n]
symbia server sources update <sourceId> [--trusted true|false]
```

### Script Commands (Symbia Script)

```bash
# Create and Validate
symbia script new <name> [-t blank|math|audio|iot|analytics] [-o file]
symbia script validate <file> [--strict]
symbia script compile <file> [-o output] [--validate] [--strict]
symbia script publish <file> [--org id] [--dry-run]
symbia script decompile <graphId> [-o file]
symbia script watch <file> [--strict]
symbia script sign --value <json> [--key keyId]
symbia script ref                          # Show Symbia Script syntax reference
symbia script info                         # Show schema documentation
```

## Symbia Script Format

Domain-specific language for computation graphs (.symbia files):

```yaml
graph_id: my-workflow
name: My Workflow
version: 1.0.0
symbia_version: "1.0"
description: Optional description
org_id: org-123
tags: [workflow, audio]

components:
  adder:
    uuid: 550e8400-e29b-41d4-a716-446655440000
    type: math-add@2.0
    config:
      precision: 2
    position: {x: 100, y: 200}

bindings:
  550e8400-e29b-41d4-a716-446655440000:
    a:
      input: {value: 10}                           # Literal value
      fallback:
        value: 5
        signature: sha256:abc123
        signed_by:
          key_id: local-dev-key
          algorithm: sha256
          timestamp: 2026-01-22T00:00:00Z
    b:
      input: {component: uuid2, port: result}      # Component reference
    c:
      input: {network: host:port, component: uuid3, port: out}  # Cross-network
    d:
      input: {var: my_var}                         # Variable reference
    e:
      input: {default: true}                       # Use default

vars:
  my_var: 42
  config: {nested: value}

imports:
  - graph: external-workflow
    uuid: 550e8400-e29b-41d4-a716-446655440001
    expose: [output1, output2]

inputs:
  - id: param1
    type: number
    required: true

outputs:
  - id: result
    type: number

metadata:
  author: team@example.com
```

### Binding Input Types

| Type | Format | Description |
|------|--------|-------------|
| Literal | `{value: any}` | Direct value |
| Component | `{component: uuid, port: string}` | Reference to component output |
| Network | `{network: string, component: uuid, port: string}` | Cross-network reference |
| Variable | `{var: string}` | Reference to vars section |
| Default | `{default: true}` | Use component's default |

### UUID Management

- UUIDs auto-generated on first compile
- Persisted in `.symbia/uuid-mapping.yaml`
- Immutable across script versions
- Disable with `--no-uuid-persist`

## Output Formats

```bash
# Table output (default)
symbia catalog list

# JSON output
symbia catalog list -o json

# YAML output
symbia catalog list -o yaml

# IDs only (for scripting)
symbia catalog list -o ids | xargs -I {} symbia catalog get {}
```

## Common Workflows

### Setup New Environment

```bash
# Add production context
symbia identity config add-context prod -e https://api.example.com -o my-org

# Switch to production
symbia identity config use-context prod

# Login
symbia identity login -e admin@example.com

# Verify
symbia status
```

### Create and Deploy Workflow

```bash
# Create from template
symbia script new audio-processor -t audio -o audio.symbia

# Edit the file...

# Validate
symbia script validate audio.symbia --strict

# Compile to JSON
symbia script compile audio.symbia -o compiled.json

# Publish
symbia script publish audio.symbia --org my-org

# Watch for changes during development
symbia script watch audio.symbia
```

### Debug Network Issues

```bash
# View network topology
symbia network sdn topology

# Check specific node
symbia network nodes get service-123

# View event flow for a run
symbia network sdn flow run-456

# Test routing policy
symbia network policies test -t message -s node1 -r run-456

# Trace specific event
symbia network events trace event-789
```

### Query and Monitor Logs

```bash
# Recent errors
symbia logging query -l error --last 1h

# Specific stream
symbia logging query "user login" -s auth-stream --last 24h

# Tail logs (follow mode)
symbia logging tail app-logs --follow

# Get trace for request
symbia logging traces get trace-123
```

## LLM Integration Guide

### Common Operations

#### Authenticate and Make Requests

```bash
# Login
symbia identity login -k $API_KEY

# Verify authentication
symbia identity whoami

# Make requests with JSON output
symbia catalog list -o json
```

#### Script Integration

```bash
# Get resource IDs for batch processing
RESOURCES=$(symbia catalog list -t component -o ids)
for id in $RESOURCES; do
  symbia catalog get $id -o json
done

# Pipeline with jq
symbia catalog list -o json | jq '.[] | select(.status == "published") | .id'
```

#### Create Resources Programmatically

```bash
# Create component from file
symbia catalog create component -n "My Component" -f definition.json

# Create assistant
symbia assistants create my-bot -n "My Bot" --model claude-3-sonnet --temperature 0.7

# Register network node
symbia network nodes register -i svc-001 -n "My Service" -t service \
  -e http://localhost:5020 -c inference,embedding
```

### Best Practices

1. **Use API keys for automation** - More stable than JWT tokens
2. **Use `-o json` for parsing** - Structured output for programmatic access
3. **Use `-o ids` for scripting** - Minimal output for pipelines
4. **Check `symbia status` first** - Verify connectivity before operations
5. **Use `--dry-run` when available** - Test before committing changes
6. **Use `--strict` for validation** - Catch errors early

### Error Handling

```bash
# Check exit code
symbia catalog get nonexistent-id
if [ $? -ne 0 ]; then
  echo "Resource not found"
fi

# Parse error from JSON
result=$(symbia catalog get $id -o json 2>&1)
if echo "$result" | jq -e '.error' > /dev/null 2>&1; then
  echo "Error: $(echo $result | jq -r '.error')"
fi
```

### Integration Checklist

- [ ] Install CLI: `npm install -g @symbia/cli`
- [ ] Add context: `symbia identity config add-context`
- [ ] Login: `symbia identity login`
- [ ] Verify: `symbia status`
- [ ] Use `-o json` for programmatic access
- [ ] Handle exit codes for error detection
- [ ] Use `--force` flag for destructive operations in scripts
- [ ] Store API keys securely (not in code)
