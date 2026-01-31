# Symbia Logging Service
# Optimized build using shared base image

FROM symbia-base:latest AS builder

WORKDIR /app

# Copy service package files
COPY logging/package*.json ./logging/

# Install service dependencies only
WORKDIR /app/logging
RUN npm install --ignore-scripts

# Copy service source
WORKDIR /app
COPY logging/ ./logging/

# Link to pre-built libraries from base image
COPY --from=symbia-base /symbia-libs/symbia-sys ./symbia-sys
COPY --from=symbia-base /symbia-libs/symbia-db ./symbia-db
COPY --from=symbia-base /symbia-libs/symbia-http ./symbia-http
COPY --from=symbia-base /symbia-libs/symbia-relay ./symbia-relay
COPY --from=symbia-base /symbia-libs/symbia-logging-client ./symbia-logging-client
COPY --from=symbia-base /symbia-libs/symbia-md ./symbia-md

# Build service
WORKDIR /app/logging
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/logging/dist ./dist
COPY --from=builder /app/logging/package*.json ./
COPY --from=builder /app/logging/node_modules ./node_modules

# Production environment
ENV NODE_ENV=production
ENV HOST=0.0.0.0

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5002/health/live || exit 1

EXPOSE 5002

CMD ["node", "dist/index.mjs"]
