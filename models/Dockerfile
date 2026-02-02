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
COPY symbia-auth/ ./symbia-auth/
COPY symbia-http/ ./symbia-http/
COPY symbia-relay/ ./symbia-relay/
COPY symbia-logging-client/ ./symbia-logging-client/
COPY symbia-md/ ./symbia-md/

# Build shared libraries
WORKDIR /app/symbia-sys
RUN npm install && npm run build

WORKDIR /app/symbia-logging-client
RUN npm install && npm run build

WORKDIR /app/symbia-relay
RUN npm install && npm run build

WORKDIR /app/symbia-auth
RUN npm install && npm run build

WORKDIR /app/symbia-http
RUN npm install && npm run build

WORKDIR /app/symbia-md
RUN npm install && npm run build

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
