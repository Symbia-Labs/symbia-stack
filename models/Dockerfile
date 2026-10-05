# Symbia Models Service
# Local LLM inference using node-llama-cpp
#
# Uses Debian-based image because node-llama-cpp requires glibc
# Note: For GPU support, use nvidia/cuda base image instead

# Build stage - need full Debian for native compilation
FROM node:20 AS builder

WORKDIR /app

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
    cmake \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy shared library sources needed for build
COPY symbia-sys/ ./symbia-sys/
COPY symbia-crypto/ ./symbia-crypto/
COPY symbia-redact/ ./symbia-redact/
COPY symbia-auth/ ./symbia-auth/
COPY symbia-http/ ./symbia-http/
COPY symbia-relay/ ./symbia-relay/
COPY symbia-logging-client/ ./symbia-logging-client/
COPY symbia-md/ ./symbia-md/
# The artifact ledger: models seals a signed artifact.registered event for
# every pull (15 Aug). Depends on @symbia/crypto, built below.
COPY symbia-lineage/ ./symbia-lineage/

# Build shared libraries
WORKDIR /app/symbia-sys
RUN npm install && npm run build

WORKDIR /app/symbia-logging-client
RUN npm install && npm run build

WORKDIR /app/symbia-relay
RUN npm install && npm run build

WORKDIR /app/symbia-auth
RUN npm install && npm run build

# crypto before http: symbia-http imports @symbia/crypto for service identity
WORKDIR /app/symbia-crypto
RUN npm install && npm run build

# redact before http too: symbia-http imports @symbia/redact to redact request
# logs. Zero dependencies, so its position here is only about ordering.
WORKDIR /app/symbia-redact
RUN npm install && npm run build

WORKDIR /app/symbia-http
RUN npm install && npm run build

WORKDIR /app/symbia-md
RUN npm install && npm run build

# lineage after crypto — it signs with @symbia/crypto's primitives.
#
# NO `npm install` here: @symbia/crypto is a peerDependency at "*", so npm
# goes to the public registry and 404s (measured 15 Aug during the first
# docker build of the artifact ledger). The assistants Dockerfile solved
# this the same way — link the sibling and build with the local tsc.
# --legacy-peer-deps is load-bearing, not a workaround for a broken tree:
# @symbia/crypto is a peerDependency at "*", and npm 7+ tries to satisfy
# peers from the public registry, where no @symbia package exists (404,
# measured 15 Aug). The peer is satisfied by the sibling symlink below.
# Borrowing crypto's own tsc/@types instead produced a type skew that does
# not exist in either package on its own — libraries build with their own
# declared toolchain.
# Symlink AFTER npm install: install prunes anything it did not put there,
# so linking first silently removes the link (measured — the build then
# fails with "Cannot find module '@symbia/crypto'").
WORKDIR /app/symbia-lineage
RUN npm install --legacy-peer-deps \
    && mkdir -p node_modules/@symbia \
    && ln -sfn /app/symbia-crypto node_modules/@symbia/crypto \
    && npm run build

# Copy service package files
WORKDIR /app
COPY models/package*.json ./models/

# Install service dependencies (includes native build for node-llama-cpp)
WORKDIR /app/models
RUN npm install

# Copy service source
WORKDIR /app
COPY models/ ./models/

# Build service
WORKDIR /app/models
RUN npm run build

# Production stage - slim Debian
FROM node:20-slim AS production

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Copy built artifacts
COPY --from=builder /app/models/dist ./dist
COPY --from=builder /app/models/docs ./docs
COPY --from=builder /app/models/package*.json ./
COPY --from=builder /app/models/node_modules ./node_modules

# Create models directory
RUN mkdir -p /data/models

# Production environment
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV MODELS_PATH=/data/models

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5008/health/live || exit 1

EXPOSE 5008

CMD ["node", "dist/index.mjs"]
