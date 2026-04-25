import type { PrismaClient } from '@prisma/client';
import type {
  IUserDeviceRepository,
  UserDevice,
  DeviceRole,
} from '@home-pulse-watcher/core';
import { mapPrismaUserDeviceToEntity } from '../mappers/user-device.mapper.js';
import { withPrismaError } from './prisma-error.wrapper.js';

/**
 * Prisma implementation of IUserDeviceRepository.
 * Plain TypeScript class - no NestJS decorators.
 */
export class PrismaUserDeviceRepository implements IUserDeviceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByUserAndDevice(
    userId: string,
    deviceId: string,
  ): Promise<UserDevice | null> {
    const userDevice = await withPrismaError('UserDevice', () =>
      this.prisma.userDevice.findUnique({
        where: { userId_deviceId: { userId, deviceId } },
      }),
    );
    return userDevice ? mapPrismaUserDeviceToEntity(userDevice) : null;
  }

  async findByUserId(userId: string): Promise<UserDevice[]> {
    const userDevices = await withPrismaError('UserDevice', () =>
      this.prisma.userDevice.findMany({ where: { userId } }),
    );
    return userDevices.map(mapPrismaUserDeviceToEntity);
  }

  async findByDeviceId(deviceId: string): Promise<UserDevice[]> {
    const userDevices = await withPrismaError('UserDevice', () =>
      this.prisma.userDevice.findMany({ where: { deviceId } }),
    );
    return userDevices.map(mapPrismaUserDeviceToEntity);
  }

  async create(data: {
    userId: string;
    deviceId: string;
    customName?: string | null;
    role?: DeviceRole;
  }): Promise<UserDevice> {
    const userDevice = await withPrismaError('UserDevice', () =>
      this.prisma.userDevice.create({
        data: {
          userId: data.userId,
          deviceId: data.deviceId,
          customName: data.customName ?? null,
          role: data.role ?? 'VIEWER',
        },
      }),
    );
    return mapPrismaUserDeviceToEntity(userDevice);
  }

  async update(
    userId: string,
    deviceId: string,
    data: { customName?: string | null; role?: DeviceRole },
  ): Promise<UserDevice> {
    const updateData: Record<string, unknown> = {};
    if (data.customName !== undefined)
      updateData['customName'] = data.customName;
    if (data.role !== undefined) updateData['role'] = data.role;

    const userDevice = await withPrismaError('UserDevice', () =>
      this.prisma.userDevice.update({
        where: { userId_deviceId: { userId, deviceId } },
        data: updateData,
      }),
    );
    return mapPrismaUserDeviceToEntity(userDevice);
  }

  async delete(userId: string, deviceId: string): Promise<void> {
    await withPrismaError('UserDevice', () =>
      this.prisma.userDevice.delete({
        where: { userId_deviceId: { userId, deviceId } },
      }),
    );
  }

  async exists(userId: string, deviceId: string): Promise<boolean> {
    const count = await withPrismaError('UserDevice', () =>
      this.prisma.userDevice.count({ where: { userId, deviceId } }),
    );
    return count > 0;
  }

  async countByDeviceId(deviceId: string): Promise<number> {
    return withPrismaError('UserDevice', () =>
      this.prisma.userDevice.count({ where: { deviceId } }),
    );
  }
}
