# Symbia Control Center — service #10.
#
# Serves the built console and proxies /svc/{id} to the services. Built here
# rather than mounted, so the image contains the assets it serves: the app that
# ships is the app that was built, not whatever a developer's dist/ happened to
# hold.
FROM node:20-alpine AS build

WORKDIR /app

# Workspace manifests first, so a dependency change invalidates the layer but a
# source change does not.
COPY package.json package-lock.json ./
COPY symbia-sys/package.json          symbia-sys/
COPY symbia-crypto/package.json       symbia-crypto/
COPY symbia-http/package.json         symbia-http/
COPY symbia-auth/package.json         symbia-auth/
COPY symbia-db/package.json           symbia-db/
COPY symbia-relay/package.json        symbia-relay/
COPY symbia-logging-client/package.json  symbia-logging-client/
COPY symbia-messaging-client/package.json symbia-messaging-client/
COPY symbia-catalog-client/package.json  symbia-catalog-client/
COPY symbia-seed/package.json         symbia-seed/
COPY symbia-md/package.json           symbia-md/
COPY symbia-id/package.json           symbia-id/
COPY symbia-stream-client/package.json symbia-stream-client/
COPY symbia-control-center/package.json symbia-control-center/

# NODE_ENV is set to development for the install ON PURPOSE. With
# NODE_ENV=production npm omits devDependencies — which here are esbuild,
# tailwind, tsx and typescript, i.e. the entire build. The install would report
# success and the build would then fail on a missing binary. This bit the host
# environment on 6 Aug (F11); it would bite this image identically.
ENV NODE_ENV=development
RUN npm ci --include=dev --workspaces --include-workspace-root || npm install --include=dev

COPY symbia-sys/            symbia-sys/
COPY symbia-crypto/         symbia-crypto/
COPY symbia-http/           symbia-http/
COPY symbia-auth/           symbia-auth/
COPY symbia-db/             symbia-db/
COPY symbia-relay/          symbia-relay/
COPY symbia-logging-client/ symbia-logging-client/
COPY symbia-messaging-client/ symbia-messaging-client/
COPY symbia-catalog-client/ symbia-catalog-client/
COPY symbia-seed/           symbia-seed/
COPY symbia-md/             symbia-md/
COPY symbia-id/             symbia-id/
COPY symbia-stream-client/   symbia-stream-client/
COPY symbia-control-center/ symbia-control-center/

RUN npm run build:libs
RUN npm run build -w symbia-control-center

# ---------------------------------------------------------------------------
FROM node:20-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

# The server bundle is self-contained apart from these two, which are left
# external because bundling a proxy's native-ish deps buys nothing.
COPY --from=build /app/symbia-control-center/dist ./dist
COPY --from=build /app/node_modules/express ./node_modules/express
COPY --from=build /app/node_modules/http-proxy-middleware ./node_modules/http-proxy-middleware
COPY --from=build /app/node_modules ./node_modules

EXPOSE 8000

# Liveness against the service's own health endpoint, not against `/`. A
# console that serves index.html while every proxy target is unreachable is
# not healthy, but it is also not this container's job to say so — see the
# readiness comment in server/src/index.ts.
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8000/health/live || exit 1

CMD ["node", "dist/server.mjs"]
