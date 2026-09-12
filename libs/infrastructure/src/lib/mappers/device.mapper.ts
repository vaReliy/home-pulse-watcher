import {
  Device,
  PowerStatus,
  ReleaseChannel,
  isReleaseChannel,
  DeviceType,
  isDeviceType,
  isBoardType,
} from '@home-pulse-watcher/core';
import type { Device as PrismaDevice } from '@prisma/client';

/**
 * Maps Prisma Device model to Domain Device entity.
 * @throws {Error} if the DB-sourced boardType value is not a known BoardType member —
 * unlike deviceType/releaseChannel, boardType has no safe default to fall back to.
 */
export function mapPrismaDeviceToEntity(prismaDevice: PrismaDevice): Device {
  if (!isBoardType(prismaDevice.boardType)) {
    throw new Error(
      `Device ${prismaDevice.id} has invalid boardType: ${prismaDevice.boardType}`,
    );
  }

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
    boardType: prismaDevice.boardType,
  });
}
