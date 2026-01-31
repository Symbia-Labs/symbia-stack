FROM node:20-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY service-admin/package.json .
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
