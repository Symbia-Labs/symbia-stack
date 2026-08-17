# Security Policy

> **Current security posture is documented in [`STATUS.md`](./STATUS.md).**
> Where this policy and `STATUS.md` disagree, `STATUS.md` is the truth.

## Supported Versions

**There is no supported release.** The tagged releases (v1.0.0–v1.2.0) predate
the current rebuild and do not match this tree. Treat everything here as
pre-release software under active development; do not deploy it in production
on the strength of this document.

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please report it responsibly.

### How to Report

**DO NOT** open a public GitHub issue for security vulnerabilities.

Instead, please email: **bmgilmore1975@gmail.com**

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### What to Expect

1. **Acknowledgment**: We will acknowledge receipt within 48 hours
2. **Assessment**: We will assess the vulnerability within 7 days
3. **Resolution**: We aim to resolve critical issues within 30 days
4. **Disclosure**: We will coordinate disclosure timing with you

### Scope

The following are in scope:
- All services in this repository
- Authentication and authorization logic
- Data handling and storage
- Network communication security
- Dependency vulnerabilities

The following are out of scope:
- Issues in third-party dependencies (report to upstream)
- Denial of service attacks
- Social engineering
- Physical security

## Security Best Practices

When deploying Symbia Stack:

### Initial Setup - No Default Credentials

**Symbia Stack does not ship with any default usernames, passwords, or API keys.**

On first run, the `./start.sh` script requires interactive console input for:
- Admin name (display name)
- Admin email (validated format)
- Admin password (minimum 8 characters, with confirmation)
- Organization name

The first user registered is automatically granted **super admin** privileges (`isSuperAdmin: true`), providing:
- Visibility into all organizations in the system
- Access to admin endpoints for user and organization management
- Full audit log access across all tenants

This ensures:
- No publicly known default credentials exist
- Credentials cannot be accidentally committed to source control
- Each deployment has unique, operator-defined authentication
- Password strength is enforced at setup time
- Platform operator has full administrative access from first login

```bash
# First run - prompts for all credentials
./start.sh

# Subsequent runs - skips setup (users exist)
./start.sh
```

### Environment Variables

- Never commit `.env` files
- Use strong, unique secrets for each environment
- Rotate secrets regularly
- Use a secrets manager in production

### Network Security

- Deploy services behind a reverse proxy
- Use TLS for all communications
- Restrict CORS origins to known domains
- Enable rate limiting

### Database Security

- Use strong database passwords
- Enable SSL for database connections
- Restrict database access to service IPs
- Regular backups with encryption

### Authentication

- **No default credentials**: Super admin must be created interactively on first run
- Use strong session secrets (32+ characters)
- Minimum password length enforced (8 characters)
- Password confirmation required to prevent typos
- Email format validation on admin account
- Enable MFA where possible
- Regular token rotation

### Monitoring

- Enable audit logging
- Monitor for unusual patterns
- Set up alerts for security events
- Regular security reviews

## Security Features

### Built-in Protections

Scope is stated per item. A protection that exists in one service is not a
platform property, and this list said otherwise until 14 Aug 2026.

- **Hash-based event verification** *(network, assistants)*: SDN events carry an
  HMAC-SHA256 over payload, id, timestamp, source, run, boundary, and target,
  verified in constant time with `timingSafeEqual` (`@symbia/crypto`). Dev mode
  without `NETWORK_HASH_SECRET` uses a repo-visible fallback secret, so
  integrity holds only where the secret is configured.
- **Credential encryption at rest** *(identity)*: HKDF-SHA256 → AES-256-GCM with
  versioned ciphertexts (`@symbia/crypto`). Identity refuses to start in
  production without `CREDENTIAL_ENCRYPTION_KEY`.
- **Row-level tenant isolation** *(all six org-scoped DB services)*: Postgres RLS
  driven by a fail-closed AsyncLocalStorage scope (`@symbia/db`), with
  `X-Org-Id` membership checked at the auth layer. **Not in force in dev**: the
  in-memory pg-mem path does not implement RLS and says so loudly at startup.
- **Outbound egress guard** *(runtime components, assistants webhook/notify)*:
  component and action `fetch` whose URL comes from graph config or conversation
  context routes through `@symbia/egress`, which denies loopback, RFC1918,
  link-local/cloud-metadata, CGNAT, ULA and non-HTTP schemes. A DNS-rebinding
  TOCTOU window remains and is documented in that package's header.
- **Log redaction** *(all services)*: request bodies and query strings are
  deep-redacted by `@symbia/redact` — one implementation, recursive,
  cycle-safe. Until 14 Aug this was four top-level key names in
  `symbia-http` plus a stronger recursive copy that only `integrations` used.
- **Path confinement** *(runtime, assistants)*: one validator,
  `@symbia/pathguard` — separator-boundary and symlink aware.
- **Contract-based access control** *(network)*: services must establish
  contracts before SDN communication.
- **Input validation**: Zod schemas on service route inputs.
- **Circuit breakers** *(integrations only)*. This was listed as a platform-wide
  protection and is not one.

Regression tests for the above run as `npm run test:security` and are gated in
CI by `.github/workflows/verify.yml`, which additionally runs RLS isolation
against a real PostgreSQL.

### Known Gaps (tracked, not yet fixed)

See `STATUS.md`, `docs/2026-08-13-adversarial-analysis.md` (and its round-2
follow-up), and `docs/2026-08-14-privacy-security-availability-stance.md` for the
full ledger. Headlines:

- **Code-tool execution is not sandboxed.** Bash/command execution was removed
  outright on 13 Aug rather than described as contained; what remains is
  off-by-default and confined, not isolated. The real boundary (a
  capability-scoped wasm component runtime) is a proposal with spikes, not code.
- **pg-mem dev mode has no RLS.** A startup warning is not a control.
- **Route surfaces reachable without authentication have never been
  enumerated.** `npm run audit:unauth` now probes every read operation in every
  committed OpenAPI spec against a running stack with no credentials, and
  reports unreachable probes as unmeasured rather than clean. Write operations
  are not probed — see that script's header for why. **Run it and record the
  result; until then this gap has an instrument but no measurement.**
- **The console has a hardcoded login.** `useAuth.ts` auto-authenticates as
  `dev@example.com` when `DEBUG` is set.
- **There is no data retention or erasure mechanism.** Retention appears in
  `INTENT.md` and service intent documents as intent only; `messaging/INTENT.md`
  states plainly that archival and retention are a future concern. Redaction
  keeps credentials out of logs; it is not retention, and neither is provenance.

### Availability

Stated separately because it is the weakest of the three and should not be read
off the security list.

- All long-running services carry `restart: unless-stopped` (14 Aug). Before
  that, a crashed service stayed down.
- **There is no backup.** No `pg_dump`, no snapshot, no restore procedure
  anywhere in the repository.
- **There is no redundancy.** Single PostgreSQL, single instance of each service,
  no replicas.
- **Survival of a database restart is unmeasured.** The mechanism that killed
  services on Postgres loss (an unhandled pool `error` event) is removed; that
  is an observation. "Survives a restart" would be an inference, and the live
  test is still owed.
- **Rate limiting is off unless `RATE_LIMIT_ENABLED=true`**, and identity's
  limiter is an in-process `Map` that resets on restart and does not span
  instances.
- Liveness can be checked on demand via `/health` on every service.

### Recommended Additional Measures

- Web Application Firewall (WAF)
- DDoS protection
- Regular penetration testing
- Security-focused code reviews

## Acknowledgments

We appreciate security researchers who help keep Symbia Stack secure. Contributors who report valid vulnerabilities will be acknowledged here (with permission).

---

Thank you for helping keep Symbia Stack and its users safe!
