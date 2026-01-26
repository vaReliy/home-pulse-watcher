import type { UserDevice as PrismaUserDevice } from '@prisma/client';
import { UserDevice, DeviceRole } from '@home-pulse-watcher/core';

/**
 * Maps Prisma UserDevice model to Domain UserDevice entity.
 */
export function mapPrismaUserDeviceToEntity(
  prismaUserDevice: PrismaUserDevice
): UserDevice {
  return new UserDevice({
    userId: prismaUserDevice.userId,
    deviceId: prismaUserDevice.deviceId,
    customName: prismaUserDevice.customName,
    role: prismaUserDevice.role as DeviceRole,
  });
}
