# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please report it responsibly.

### How to Report

**DO NOT** open a public GitHub issue for security vulnerabilities.

Instead, please email: **hello@example.com**

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

- Use strong session secrets (32+ characters)
- Implement proper password policies
- Enable MFA where possible
- Regular token rotation

### Monitoring

- Enable audit logging
- Monitor for unusual patterns
- Set up alerts for security events
- Regular security reviews

## Security Features

### Built-in Protections

- **Hash-based event verification**: SDN events are cryptographically signed
- **Contract-based access control**: Services must establish contracts before communication
- **Credential sanitization**: API keys are never logged
- **Circuit breakers**: Prevent cascading failures
- **Input validation**: Zod schemas validate all inputs

### Recommended Additional Measures

- Web Application Firewall (WAF)
- DDoS protection
- Regular penetration testing
- Security-focused code reviews

## Acknowledgments

We appreciate security researchers who help keep Symbia Stack secure. Contributors who report valid vulnerabilities will be acknowledged here (with permission).

---

Thank you for helping keep Symbia Stack and its users safe!
