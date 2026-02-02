# Symbia Integrations Service
# Optimized build using shared base image

FROM symbia-base:latest AS builder

WORKDIR /app

# Copy service package files
COPY integrations/package*.json ./integrations/

# Install service dependencies only
WORKDIR /app/integrations
RUN npm install --ignore-scripts

# Copy service source
WORKDIR /app
COPY integrations/ ./integrations/

# Link to pre-built libraries from base image
COPY --from=symbia-base /symbia-libs/symbia-sys ./symbia-sys
COPY --from=symbia-base /symbia-libs/symbia-auth ./symbia-auth
COPY --from=symbia-base /symbia-libs/symbia-db ./symbia-db
COPY --from=symbia-base /symbia-libs/symbia-http ./symbia-http
COPY --from=symbia-base /symbia-libs/symbia-relay ./symbia-relay
COPY --from=symbia-base /symbia-libs/symbia-logging-client ./symbia-logging-client
COPY --from=symbia-base /symbia-libs/symbia-md ./symbia-md

# Build service
WORKDIR /app/integrations
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/integrations/dist ./dist
COPY --from=builder /app/integrations/docs ./docs
COPY --from=builder /app/integrations/package*.json ./
COPY --from=builder /app/integrations/node_modules ./node_modules

# Production environment
ENV NODE_ENV=production
ENV HOST=0.0.0.0

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5007/health/live || exit 1

EXPOSE 5007

CMD ["node", "dist/index.mjs"]
