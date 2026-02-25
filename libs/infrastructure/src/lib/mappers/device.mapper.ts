import type { Device as PrismaDevice } from '@prisma/client';
import { Device, PowerStatus } from '@home-pulse-watcher/core';

/**
 * Maps Prisma Device model to Domain Device entity.
 */
export function mapPrismaDeviceToEntity(prismaDevice: PrismaDevice): Device {
  return new Device({
    id: prismaDevice.id,
    macAddress: prismaDevice.macAddress,
    encryptedSecret: prismaDevice.encryptedSecret,
    label: prismaDevice.label,
    lastStatus:
      prismaDevice.lastStatus !== null
        ? (prismaDevice.lastStatus as PowerStatus)
        : null,
    lastSeenAt: prismaDevice.lastSeenAt,
    firmwareVersion: prismaDevice.firmwareVersion,
  });
}
