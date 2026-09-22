/**
 * @symbia/sys - System utilities and service registry
 *
 * Provides service ID constants, port resolution, and endpoint mappings
 * for all Symbia microservices.
 *
 * Also includes Symbia Script - the unified reference syntax for the platform.
 */
export * from './script.js';
export * from './namespace-client.js';
export * from './bootstrap.js';
export * from './auth.js';
export * from './trace-context.js';
export * from './event-headers.js';
/**
 * Service identifiers used across the platform
 */
export declare const ServiceId: {
    /**
     * Reserved. Nothing listens on this. Held so the slot is not claimed by
     * something else. See `RunningServices` — anything enumerating this registry
     * in order to *reach* a service must exclude it, and must do so through that
     * export rather than by repeating the filter.
     */
    readonly SERVER: "server";
    readonly IDENTITY: "identity";
    readonly LOGGING: "logging";
    readonly CATALOG: "catalog";
    readonly ASSISTANTS: "assistants";
    readonly MESSAGING: "messaging";
    readonly RUNTIME: "runtime";
    readonly INTEGRATIONS: "integrations";
    readonly MODELS: "models";
    readonly NETWORK: "network";
    /**
     * Federation directory (control plane): the peer directory (BDT) of networks
     * this one federates with, the foreign-node table (FDT), and admission. The
     * bridge node is the data plane; this holds the policy. See
     * docs/2026-08-09-network-bridge-bbmd.md.
     */
    readonly DIRECTORY: "directory";
    /** Operator console. Serves its own built assets and proxies /svc/{id}. */
    readonly CONTROL_CENTER: "control-center";
    /** Admin/API front end. Was `service-admin` on 3000, unregistered. */
    readonly API: "api";
};
export type ServiceId = (typeof ServiceId)[keyof typeof ServiceId];
/**
 * Default ports for each service.
 *
 * Tiers: base services 5000+, control center 8000, API 9000.
 */
export declare const ServicePorts: Record<ServiceId, number>;
export declare const RunningServices: ServiceId[];
/**
 * Services the console can reach over HTTP, and therefore the services it can
 * honestly report on: everything running except the console itself, which does
 * not proxy to itself and answers 404 at `/svc/control-center/health`.
 *
 * This exists because the same list was being derived twice. The server knew
 * it (`PROXIED_SERVICES` in the control center's proxy, derived correctly from
 * the registry) and the browser did not — `config/services.ts` restated it as
 * a hand-written literal of eight, omitting `models` and `api`.
 *
 * The consequence was not a missing row. The Overview card read **8/8,
 * "responding to /health"**, while eleven containers ran and the mesh reported
 * ten nodes. That tile already distinguishes healthy from unhealthy from
 * unknown, and it was still wrong, because the denominator itself was short:
 * `models` and `api` were not unknown, they were never asked. A count cannot
 * be honest about services it does not know exist.
 *
 * So the list lives here, once, and both sides import it. Discipline 7: a
 * shared concern with N independent implementations is not shared.
 *
 * `SERVER` joins the console in being excluded, for the same reason stated
 * differently: a gateway cannot proxy to itself. The front door would loop a
 * request back into its own process, and the console no longer routes per
 * service at all — it forwards everything to the front door (19 Aug 2026), so
 * this list describes what the FRONT DOOR fronts, not what the console does.
 */
export declare const ProxiedServices: ServiceId[];
/**
 * Local development endpoints for each service.
 *
 * Derived from ServicePorts. Previously hand-maintained alongside it, which
 * meant the two could disagree and nothing would say so.
 */
export declare const ServiceLocalEndpoints: Record<ServiceId, string>;
/**
 * Which port is THAT service on.
 *
 * Priority:
 * 1. Service-specific environment variable (e.g. `CATALOG_PORT`)
 * 2. Default port from ServicePorts
 *
 * THE GENERIC `PORT` IS NOT CONSULTED HERE, AND MUST NOT BE. `PORT` means
 * "which port am I on". This function answers "which port is catalog on".
 * Those are two different facts, and reading one to answer the other is F66:
 *
 *   Measured 26 Aug 2026. `start-local.sh` starts the front door with
 *   `PORT=5100` and passes no `*_PORT` values. Inside that process the
 *   service-specific lookup missed for every id, the generic `PORT` hit, and
 *   `resolveServicePort` returned 5100 for all thirteen services. Every
 *   `/svc/<id>/**` request was proxied to the front door itself. It answered
 *   for eleven services, reached none of them, and returned 200 throughout.
 *
 * The fallback was only ever correct where every service shares one port
 * number and the host distinguishes them, which is a property of the container
 * topology rather than of the platform. Under compose it was not even
 * exercised: each container is given its registry default as `PORT`
 * (identity 5001, catalog 5003, …) and the front door's container sets
 * `SERVER_PORT`, not `PORT`. Checked 26 Aug, both blocks.
 *
 * Binding your own port is `resolveOwnPort`, which still reads `PORT`.
 */
export declare function resolveServicePort(serviceId: ServiceId | string): number;
/**
 * Which port am I on — for a service deciding what to bind.
 *
 * Priority:
 * 1. Service-specific environment variable (e.g. `CATALOG_PORT`)
 * 2. Generic `PORT` environment variable
 * 3. Default port from ServicePorts
 *
 * The generic `PORT` belongs here and only here. Platforms that inject `PORT`
 * (compose, most PaaS hosts, `start-local.sh`) are telling THIS process where
 * to listen, and a process is entitled to believe that about itself.
 *
 * Split out of `resolveServicePort` on 26 Aug 2026. The two questions had been
 * sharing one function since the rebuild, so a caller asking about a peer
 * inherited an answer about the caller. Separating them means the peer lookup
 * cannot return the asker's own port — not because callers are careful, but
 * because the function that would have done it no longer reads that variable.
 */
export declare function resolveOwnPort(serviceId: ServiceId | string): number;
/**
 * Resolve the HOST a service is reachable at.
 *
 * `{SERVICE_ID}_HOST` if set, else localhost. In compose the service name is
 * the DNS name, so compose sets these explicitly rather than relying on a
 * default that means different things in different places.
 *
 * This exists because two proxies had two conventions: the control center
 * defaulted to `localhost`, service-admin defaulted to the docker service
 * name. Same concern, two implementations, which is the defect that let
 * identity's forked authMiddleware survive a patch to @symbia/auth. Both now
 * call this.
 */
/**
 * The one human-readable name for a service.
 *
 * There were at least three ways to spell one of these. Each service hardcoded
 * a name in its own index.ts ("Identity Service", "Catalog Service"), while
 * @symbia/http derived a different one from the id ("network", "assistants",
 * "control center"), and whichever registered last won the race. Measured
 * 7 Aug 2026, the topology listed ten nodes in three different styles at once:
 *
 *   network            Identity Service      Models Service
 *   assistants         Integrations Service  control center
 *
 * A display name is a shared concern, and a shared concern with N independent
 * implementations is not shared. Title Case, no "Service" suffix — the UI
 * already badges each card with its node type, so repeating it is noise.
 */
export declare function serviceDisplayName(serviceId: ServiceId | string): string;
export declare function resolveServiceHost(serviceId: ServiceId | string): string;
/**
 * Resolve the full base URL for a service: host from the environment, port
 * from the registry. Never a hardcoded literal at the call site.
 */
export declare function resolveServiceTarget(serviceId: ServiceId | string): string;
/**
 * Get the local endpoint URL for a service.
 *
 * Derived from `resolveServicePort`, not read out of `ServiceLocalEndpoints`.
 * That map is frozen at the registry defaults, so reading it first made this
 * function ignore `*_PORT` overrides — and `resolveServiceTarget`, which does
 * not ignore them, then disagreed with it about the same service.
 *
 * Measured 26 Aug 2026 in a native process started the way `start-local.sh`
 * starts catalog: `resolveServiceUrl('server')` returned `localhost:5000` while
 * `resolveServiceTarget('server')` returned `localhost:5003` and the front door
 * was listening on 5100. Three answers, one question (F68). The 5003 came from
 * the generic `PORT` fallback and is fixed above; the 5000 came from here.
 */
export declare function getServiceLocalEndpoint(serviceId: ServiceId | string): string;
/**
 * Get environment variable for service URL
 *
 * @param serviceId - The service identifier
 * @returns The environment variable name for the service URL
 */
export declare function getServiceUrlEnvVar(serviceId: ServiceId | string): string;
/**
 * Resolve service URL from environment or default
 *
 * @param serviceId - The service identifier
 * @returns The service URL
 */
export declare function resolveServiceUrl(serviceId: ServiceId | string): string;
//# sourceMappingURL=index.d.ts.map