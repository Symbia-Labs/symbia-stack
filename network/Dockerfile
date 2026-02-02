# Symbia Network Service
# Optimized build using shared base image

FROM symbia-base:latest AS builder

WORKDIR /app

# Copy service package files
COPY network/package*.json ./network/

# Install service dependencies only
WORKDIR /app/network
RUN npm install --ignore-scripts

# Copy service source
WORKDIR /app
COPY network/ ./network/

# Link to pre-built libraries from base image
COPY --from=symbia-base /symbia-libs/symbia-sys ./symbia-sys
COPY --from=symbia-base /symbia-libs/symbia-auth ./symbia-auth
COPY --from=symbia-base /symbia-libs/symbia-http ./symbia-http
COPY --from=symbia-base /symbia-libs/symbia-relay ./symbia-relay
COPY --from=symbia-base /symbia-libs/symbia-logging-client ./symbia-logging-client
COPY --from=symbia-base /symbia-libs/symbia-md ./symbia-md

# Build service
WORKDIR /app/network
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/network/dist ./dist
COPY --from=builder /app/network/docs ./docs
COPY --from=builder /app/network/package*.json ./
COPY --from=builder /app/network/node_modules ./node_modules

# Production environment
ENV NODE_ENV=production
ENV HOST=0.0.0.0

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5054/health/live || exit 1

EXPOSE 5054

CMD ["node", "dist/index.mjs"]
