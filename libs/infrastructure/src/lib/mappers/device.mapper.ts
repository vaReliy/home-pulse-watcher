import {
  Device,
  PowerStatus,
  ReleaseChannel,
  isReleaseChannel,
  DeviceType,
  isDeviceType,
} from '@home-pulse-watcher/core';
import type { Device as PrismaDevice } from '@prisma/client';

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
    statusChangedAt: prismaDevice.statusChangedAt,
    firmwareVersion: prismaDevice.firmwareVersion,
    batteryVoltage: prismaDevice.batteryVoltage,
    releaseChannel: isReleaseChannel(prismaDevice.releaseChannel)
      ? prismaDevice.releaseChannel
      : ReleaseChannel.STABLE,
    deviceType: isDeviceType(prismaDevice.deviceType)
      ? prismaDevice.deviceType
      : DeviceType.MAINS,
  });
}
