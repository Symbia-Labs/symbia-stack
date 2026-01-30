# Symbia Integrations Service
# Multi-stage build for production deployment

FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace package files for local dependencies
COPY symbia-sys/package*.json ./symbia-sys/
COPY symbia-db/package*.json ./symbia-db/
COPY symbia-http/package*.json ./symbia-http/
COPY symbia-relay/package*.json ./symbia-relay/
COPY symbia-logging-client/package*.json ./symbia-logging-client/
COPY symbia-md/package*.json ./symbia-md/

# Copy service package files
COPY integrations/package*.json ./integrations/

# Install dependencies for libraries
WORKDIR /app/symbia-sys
RUN npm ci --ignore-scripts

WORKDIR /app/symbia-db
RUN npm ci --ignore-scripts

WORKDIR /app/symbia-http
RUN npm ci --ignore-scripts

WORKDIR /app/symbia-relay
RUN npm ci --ignore-scripts

WORKDIR /app/symbia-logging-client
RUN npm ci --ignore-scripts

WORKDIR /app/symbia-md
RUN npm ci --ignore-scripts

# Install service dependencies
WORKDIR /app/integrations
RUN npm install --ignore-scripts

# Copy source files
WORKDIR /app
COPY symbia-sys/ ./symbia-sys/
COPY symbia-db/ ./symbia-db/
COPY symbia-http/ ./symbia-http/
COPY symbia-relay/ ./symbia-relay/
COPY symbia-logging-client/ ./symbia-logging-client/
COPY symbia-md/ ./symbia-md/
COPY integrations/ ./integrations/

# Build libraries
WORKDIR /app/symbia-sys
RUN npm run build || true

WORKDIR /app/symbia-db
RUN npm run build || true

WORKDIR /app/symbia-http
RUN npm run build || true

WORKDIR /app/symbia-relay
RUN npm run build || true

WORKDIR /app/symbia-logging-client
RUN npm run build || true

WORKDIR /app/symbia-md
RUN npm run build || true

# Build service
WORKDIR /app/integrations
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/integrations/dist ./dist
COPY --from=builder /app/integrations/package*.json ./
COPY --from=builder /app/integrations/node_modules ./node_modules

# Production environment
# PORT is resolved by @symbia/sys (default: 5007, override with PORT env var)
ENV NODE_ENV=production
ENV HOST=0.0.0.0

# Health check using default port (override PORT at runtime if needed)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5007/health/live || exit 1

# Default port from @symbia/sys ServicePorts
EXPOSE 5007

CMD ["node", "dist/index.mjs"]
