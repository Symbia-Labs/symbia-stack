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

- **Hash-based event verification**: SDN events carry a keyed SHA-256 hash
  (not HMAC yet — migration tracked in `STATUS.md`; dev mode uses a
  repo-visible fallback secret, so this is no integrity guarantee outside
  production configuration)
- **Contract-based access control**: Services must establish contracts before communication
- **Credential sanitization**: API keys are never logged
- **Circuit breakers**: Prevent cascading failures
- **Input validation**: Zod schemas validate all inputs

### Known Gaps (tracked, not yet fixed)

See `STATUS.md` and `docs/2026-08-13-adversarial-analysis.md` for the full
ledger. Headlines: code-tool bash execution is not sandboxed; the credential
vault has no KDF and a fallback key; RLS context is set at pool level rather
than per-transaction; `X-Org-Id` is not validated against token membership.

### Recommended Additional Measures

- Web Application Firewall (WAF)
- DDoS protection
- Regular penetration testing
- Security-focused code reviews

## Acknowledgments

We appreciate security researchers who help keep Symbia Stack secure. Contributors who report valid vulnerabilities will be acknowledged here (with permission).

---

Thank you for helping keep Symbia Stack and its users safe!
