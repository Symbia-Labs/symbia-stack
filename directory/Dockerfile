# Symbia Directory Service
# Optimized build using shared base image

FROM symbia-base:latest AS builder

WORKDIR /app

# Copy service package files
COPY directory/package*.json ./directory/

# Install service dependencies only
WORKDIR /app/directory
RUN npm install --ignore-scripts

# Copy service source
WORKDIR /app
COPY directory/ ./directory/

# Link to pre-built libraries from base image
COPY --from=symbia-base /symbia-libs/symbia-sys ./symbia-sys
COPY --from=symbia-base /symbia-libs/symbia-auth ./symbia-auth
COPY --from=symbia-base /symbia-libs/symbia-http ./symbia-http
COPY --from=symbia-base /symbia-libs/symbia-relay ./symbia-relay
COPY --from=symbia-base /symbia-libs/symbia-logging-client ./symbia-logging-client

# Build service
WORKDIR /app/directory
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/directory/dist ./dist
COPY --from=builder /app/directory/package*.json ./
COPY --from=builder /app/directory/node_modules ./node_modules

# Production environment
ENV NODE_ENV=production
ENV HOST=0.0.0.0

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5010/health/live || exit 1

EXPOSE 5010

CMD ["node", "dist/index.mjs"]
