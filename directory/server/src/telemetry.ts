/**
 * Directory Service telemetry.
 */
import { createTelemetryClient } from '@symbia/logging-client';
import { ServiceId } from '@symbia/sys';

export const telemetry = createTelemetryClient({
  serviceId: ServiceId.DIRECTORY,
});

export const DirectoryEvents = {
  SERVICE_STARTED: 'directory.service.started',
  PEER_REGISTERED: 'directory.peer.registered',
  PEER_REMOVED: 'directory.peer.removed',
  FOREIGN_REGISTERED: 'directory.foreign.registered',
  FOREIGN_EVICTED: 'directory.foreign.evicted',
} as const;

export const DirectoryMetrics = {
  PEER_ACTIVE_COUNT: 'directory.peer.active_count',
  FOREIGN_ACTIVE_COUNT: 'directory.foreign.active_count',
  FOREIGN_EVICTED: 'directory.foreign.evicted',
} as const;
