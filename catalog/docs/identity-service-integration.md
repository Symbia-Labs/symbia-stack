# Identity Service Integration for Entitlements

This document describes the user object fields that Symbia Catalog Service expects from the Identity Service to support fine-grained access control.

## Current User Object Structure

The Identity Service should return the following structure from `/api/users/me`:

```json
{
  "id": "string (required)",
  "email": "string (required)",
  "name": "string (required)",
  "isSuperAdmin": "boolean (optional, default: false)",
  "organizations": [
    {
      "id": "string",
      "name": "string",
      "slug": "string",
      "role": "admin | member | viewer"
    }
  ],
  "entitlements": ["string array (optional)"],
  "roles": ["string array (optional)"]
}
```

## Field Descriptions

### Core Fields (Required)
| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique user identifier |
| `email` | string | User's email address |
| `name` | string | User's display name |

### Access Control Fields (Optional but Recommended)

| Field | Type | Description |
|-------|------|-------------|
| `isSuperAdmin` | boolean | If true, user bypasses all entitlement checks and has full access |
| `organizations` | array | List of organizations the user belongs to |
| `entitlements` | array | List of capability grants for the user |
| `roles` | array | List of global roles assigned to the user |

## Entitlement Keys

The following entitlement keys are recognized by the Catalog Service:

### Capability Entitlements
| Key | Description |
|-----|-------------|
| `cap:registry.write` | Create and edit resources |
| `cap:registry.publish` | Publish resources |
| `cap:registry.sign` | Sign resources with cryptographic signatures |
| `cap:registry.certify` | Add certifications to resources |

### Role Entitlements
| Key | Description |
|-----|-------------|
| `role:admin` | Global admin access (all operations) |
| `role:publisher` | Publishing rights |
| `role:reviewer` | Review capabilities |

### Organization Entitlements (Auto-derived)
These are automatically derived from the `organizations` array:
| Key | Derived From |
|-----|--------------|
| `org:<orgId>` | User is a member of the organization |
| `role:admin:<orgId>` | User has `role: "admin"` in the organization |
| `role:member:<orgId>` | User has `role: "member"` or `role: "admin"` in the organization |

## Example Responses

### Super Admin User
```json
{
  "id": "user-001",
  "email": "admin@example.com",
  "name": "Super Admin",
  "isSuperAdmin": true,
  "organizations": []
}
```
Result: Full access to all resources and operations.

### Regular User with Capabilities
```json
{
  "id": "user-002",
  "email": "developer@example.com",
  "name": "Jane Developer",
  "isSuperAdmin": false,
  "organizations": [
    { "id": "org-acme", "name": "Acme Corp", "slug": "acme", "role": "member" }
  ],
  "entitlements": ["cap:registry.write", "cap:registry.publish"],
  "roles": []
}
```
Result: Can read public resources, create/edit resources, publish resources, and access Acme Corp org resources.

### Organization Admin
```json
{
  "id": "user-003",
  "email": "lead@acme.com",
  "name": "Team Lead",
  "isSuperAdmin": false,
  "organizations": [
    { "id": "org-acme", "name": "Acme Corp", "slug": "acme", "role": "admin" }
  ],
  "entitlements": [],
  "roles": []
}
```
Result: Has admin access within Acme Corp organization only (role:admin:org-acme), can access org resources.

### Read-Only User
```json
{
  "id": "user-004",
  "email": "viewer@example.com",
  "name": "Viewer",
  "isSuperAdmin": false,
  "organizations": [],
  "entitlements": [],
  "roles": []
}
```
Result: Can only read public resources.

## Access Control Logic

1. **Super Admin Bypass**: If `isSuperAdmin` is true, all entitlement checks are skipped.

2. **Resource Access Policy**: Each resource has an `accessPolicy` with:
   - `visibility`: public | org | private
   - `actions`: Per-action entitlement requirements (read, write, publish, sign, certify, delete)

3. **Allowlist Matching**: For each action, the user's entitlements are checked against the resource's `accessPolicy.actions[action].anyOf` array. Access is granted if any entitlement matches.

## Authentication Mechanisms

The Catalog Service supports multiple authentication methods:

| Method | Header/Cookie | Description |
|--------|---------------|-------------|
| Bearer Token | `Authorization: Bearer <token>` | JWT from Identity Service login |
| API Key | `X-API-Key: <key>` | Programmatic access via generated API keys |
| Session Cookie | `symbia_session` cookie | Set automatically after Identity Service login |

All methods result in the same entitlement evaluation against the user's claims.

## Implementation Notes

- The `entitlements` and `roles` fields are optional. If not provided, users rely on organization membership and super admin status for access.
- Organization membership automatically grants `org:<orgId>` entitlement.
- Organization admins automatically get `role:admin:<orgId>` (org-scoped, not global admin).
