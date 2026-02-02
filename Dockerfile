# Symbia Stack - Multi-Service Dockerfile
# Build any service using: docker build --build-arg SERVICE=identity .
#
# For Fly.io UI deployment, set the SERVICE build arg in the dashboard.

ARG SERVICE=identity

# =============================================================================
# Stage 1: Base with dependencies
# =============================================================================
FROM node:22-slim AS base

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files for dependency installation
COPY package.json package-lock.json ./
COPY symbia-sys/package.json ./symbia-sys/
COPY symbia-db/package.json ./symbia-db/
COPY symbia-http/package.json ./symbia-http/
COPY symbia-auth/package.json ./symbia-auth/
COPY symbia-id/package.json ./symbia-id/
COPY symbia-logging-client/package.json ./symbia-logging-client/
COPY symbia-relay/package.json ./symbia-relay/
COPY symbia-seed/package.json ./symbia-seed/
COPY symbia-md/package.json ./symbia-md/

# Copy all service package.json files
COPY identity/package.json ./identity/
COPY logging/package.json ./logging/
COPY catalog/package.json ./catalog/
COPY assistants/package.json ./assistants/
COPY messaging/package.json ./messaging/
COPY runtime/package.json ./runtime/
COPY integrations/package.json ./integrations/
COPY network/package.json ./network/
COPY models/package.json ./models/

# Install all dependencies
RUN npm ci --include=dev

# =============================================================================
# Stage 2: Build shared packages
# =============================================================================
FROM base AS packages

# Copy shared package source
COPY symbia-sys/ ./symbia-sys/
COPY symbia-db/ ./symbia-db/
COPY symbia-http/ ./symbia-http/
COPY symbia-auth/ ./symbia-auth/
COPY symbia-id/ ./symbia-id/
COPY symbia-logging-client/ ./symbia-logging-client/
COPY symbia-relay/ ./symbia-relay/
COPY symbia-seed/ ./symbia-seed/
COPY symbia-md/ ./symbia-md/

# Build shared packages
RUN npm run build -w symbia-sys \
    && npm run build -w symbia-db \
    && npm run build -w symbia-http \
    && npm run build -w symbia-auth \
    && npm run build -w symbia-id \
    && npm run build -w symbia-logging-client \
    && npm run build -w symbia-relay \
    && npm run build -w symbia-seed \
    && npm run build -w symbia-md

# =============================================================================
# Stage 3: Build the target service
# =============================================================================
FROM packages AS builder

ARG SERVICE

# Copy service source
COPY ${SERVICE}/ ./${SERVICE}/

# Build the service
RUN npm run build -w ${SERVICE}

# Prepare clean output (handles optional data/docs directories)
RUN mkdir -p /output \
    && cp -r ${SERVICE}/dist /output/dist \
    && (cp -r ${SERVICE}/data /output/data 2>/dev/null || true) \
    && (cp -r ${SERVICE}/docs /output/docs 2>/dev/null || true)

# =============================================================================
# Stage 4: Production image
# =============================================================================
FROM node:22-slim AS production

ARG SERVICE
ENV SERVICE=${SERVICE}
ENV NODE_ENV=production

WORKDIR /app

# Install wget for healthcheck
RUN apt-get update && apt-get install -y wget && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json package-lock.json ./
COPY symbia-sys/package.json ./symbia-sys/
COPY symbia-db/package.json ./symbia-db/
COPY symbia-http/package.json ./symbia-http/
COPY symbia-auth/package.json ./symbia-auth/
COPY symbia-id/package.json ./symbia-id/
COPY symbia-logging-client/package.json ./symbia-logging-client/
COPY symbia-relay/package.json ./symbia-relay/
COPY symbia-seed/package.json ./symbia-seed/
COPY symbia-md/package.json ./symbia-md/
COPY ${SERVICE}/package.json ./${SERVICE}/

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built shared packages
COPY --from=builder /app/symbia-sys/dist ./symbia-sys/dist
COPY --from=builder /app/symbia-db/dist ./symbia-db/dist
COPY --from=builder /app/symbia-http/dist ./symbia-http/dist
COPY --from=builder /app/symbia-auth/dist ./symbia-auth/dist
COPY --from=builder /app/symbia-id/dist ./symbia-id/dist
COPY --from=builder /app/symbia-logging-client/dist ./symbia-logging-client/dist
COPY --from=builder /app/symbia-relay/dist ./symbia-relay/dist
COPY --from=builder /app/symbia-seed/dist ./symbia-seed/dist
COPY --from=builder /app/symbia-md/dist ./symbia-md/dist

# Copy service build output (dist, and data/docs if they exist)
COPY --from=builder /output/ ./${SERVICE}/

EXPOSE 5001 5002 5003 5004 5005 5006 5007 5008 5054

CMD ["sh", "-c", "node ${SERVICE}/dist/index.js"]
