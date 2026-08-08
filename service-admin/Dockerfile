# Symbia Service Admin
# Requires the shared base image for @symbia/sys:
#   docker build -t symbia-base -f docker/Dockerfile.base .

FROM node:20-alpine

WORKDIR /app

# Pre-built shared library from the base image; package.json refers to it
# as file:../symbia-sys, so it must sit alongside the service directory.
COPY --from=symbia-base:latest /symbia-libs/symbia-sys ./symbia-sys

# Install service dependencies
COPY service-admin/package.json ./service-admin/
WORKDIR /app/service-admin
RUN npm install --production

# Copy application files
COPY service-admin/server.js .
COPY service-admin/index.html .

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health || exit 1

# Start server
CMD ["node", "server.js"]
