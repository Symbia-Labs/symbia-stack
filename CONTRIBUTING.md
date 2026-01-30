# Contributing to Symbia Stack

Thank you for your interest in contributing to Symbia Stack! This document provides guidelines and information for contributors.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for everyone.

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+
- PostgreSQL 15+ (or use in-memory mode for development)
- Docker (optional, for containerized development)

### Local Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/symbia-labs/symbia-stack.git
   cd symbia-stack
   ```

2. Install dependencies for each service:
   ```bash
   cd identity && npm install
   cd ../catalog && npm install
   # Repeat for each service you need
   ```

3. Copy environment files:
   ```bash
   cp identity/.env.example identity/.env
   cp catalog/.env.example catalog/.env
   # etc.
   ```

4. Start services in development mode:
   ```bash
   cd identity && SESSION_SECRET=dev-secret npm run dev
   cd catalog && npm run dev
   ```

## Project Structure

```
symbia-stack/
├── network/          # SDN event routing and service discovery
├── messaging/        # Real-time conversation management
├── catalog/          # Resource registry and access control
├── assistants/       # Rule engine and action execution
├── integrations/     # LLM provider gateway
├── identity/         # Authentication and authorization
├── symbia-relay/     # Client library for service integration
├── symbia-http/      # HTTP server utilities
├── symbia-db/        # Database abstraction layer
├── symbia-sys/       # Shared types and constants
├── symbia-seed/      # Development seed data
├── symbia-logging-client/  # Telemetry client
└── symbia-md/        # Documentation utilities
```

## How to Contribute

### Reporting Issues

- Check existing issues before creating a new one
- Use the issue templates when available
- Include reproduction steps for bugs
- For security issues, see [SECURITY.md](SECURITY.md)

### Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Test your changes with in-memory database mode
5. Run TypeScript checks: `npm run check` (in the relevant service)
6. Commit with clear messages: `git commit -m "feat: add new feature"`
7. Push to your fork: `git push origin feature/your-feature`
8. Open a Pull Request

### Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

### Code Style

- TypeScript for all new code
- Follow existing code patterns in the service you're modifying
- Use Zod for input validation
- Document public APIs with JSDoc comments

## Development Guidelines

### Adding a New Service

1. Create directory with standard structure:
   ```
   new-service/
   ├── server/
   │   └── src/
   │       ├── index.ts      # Entry point
   │       ├── routes.ts     # API routes
   │       └── ...
   ├── shared/
   │   └── schema.ts         # Zod schemas
   ├── package.json
   ├── tsconfig.json
   ├── .env.example
   └── README.md
   ```

2. Use `@symbia/http` for server setup
3. Use `@symbia/db` for database access
4. Use `@symbia/relay` for SDN integration
5. Add local dependencies using `file:../symbia-*` references

### Adding a New Action (Assistants Service)

1. Create handler in `assistants/server/src/engine/actions/`
2. Extend `BaseActionHandler`
3. Register in action registry
4. Add tests
5. Document in README

### Database Migrations

- Use Drizzle ORM for schema management
- Test with both PostgreSQL and in-memory mode
- Migrations go in `server/src/migrations/`

## Testing

### Development Testing

Each service supports in-memory database mode for rapid development:

```bash
# Run with in-memory database
cd identity && SESSION_SECRET=dev npm run dev
cd catalog && CATALOG_USE_MEMORY_DB=true npm run dev
```

### Test Guidelines

- Test with in-memory database mode for isolation
- Verify TypeScript compiles: `npm run check`
- Test API endpoints manually or via the OpenAPI spec
- Mock external services (LLM providers, etc.)

## Documentation

- Update README.md for user-facing changes
- Add JSDoc comments for public APIs
- Update OpenAPI specs when changing endpoints
- Keep examples current

## Release Process

Releases are managed by maintainers. To request a release:

1. Ensure TypeScript compiles in all affected services
2. Test with Docker Compose: `docker-compose up`
3. Open a release PR
4. Maintainers will review and tag

## Getting Help

- Open a [Discussion](https://github.com/symbia-labs/symbia-stack/discussions) for questions
- Email us at hello@example.com
- Check existing documentation and issues

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
