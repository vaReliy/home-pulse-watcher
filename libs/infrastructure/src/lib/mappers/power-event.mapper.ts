import type { PowerEvent as PrismaPowerEvent } from '@prisma/client';
import { PowerEvent, PowerStatus } from '@home-pulse-watcher/core';

/**
 * Maps Prisma PowerEvent model to Domain PowerEvent entity.
 */
export function mapPrismaPowerEventToEntity(
  prismaPowerEvent: PrismaPowerEvent,
): PowerEvent {
  return new PowerEvent({
    id: prismaPowerEvent.id,
    deviceId: prismaPowerEvent.deviceId,
    status: prismaPowerEvent.status as PowerStatus,
    timestamp: prismaPowerEvent.timestamp,
    duration: prismaPowerEvent.duration,
    voltage: prismaPowerEvent.voltage,
  });
}
