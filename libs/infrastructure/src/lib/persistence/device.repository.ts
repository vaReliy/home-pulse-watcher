import type { PrismaClient } from '@prisma/client';
import type {
  IDeviceRepository,
  Device,
  PowerStatus,
} from '@home-pulse-watcher/core';
import { mapPrismaDeviceToEntity } from '../mappers/device.mapper.js';
import { withPrismaError } from './prisma-error.wrapper.js';

/**
 * Prisma implementation of IDeviceRepository.
 * Plain TypeScript class - no NestJS decorators.
 */
export class PrismaDeviceRepository implements IDeviceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Device | null> {
    const device = await withPrismaError('Device', () =>
      this.prisma.device.findUnique({ where: { id } }),
    );
    return device ? mapPrismaDeviceToEntity(device) : null;
  }

  async findByMacAddress(macAddress: string): Promise<Device | null> {
    const device = await withPrismaError('Device', () =>
      this.prisma.device.findUnique({ where: { macAddress } }),
    );
    return device ? mapPrismaDeviceToEntity(device) : null;
  }

  async create(data: {
    macAddress: string;
    encryptedSecret: string;
    label?: string | null;
  }): Promise<Device> {
    const device = await withPrismaError('Device', () =>
      this.prisma.device.create({
        data: {
          macAddress: data.macAddress,
          encryptedSecret: data.encryptedSecret,
          label: data.label ?? null,
        },
      }),
    );
    return mapPrismaDeviceToEntity(device);
  }

  async update(
    id: string,
    data: { label?: string | null; encryptedSecret?: string },
  ): Promise<Device> {
    const device = await withPrismaError('Device', () =>
      this.prisma.device.update({ where: { id }, data }),
    );
    return mapPrismaDeviceToEntity(device);
  }

  async updateStatus(
    id: string,
    data: {
      lastStatus: PowerStatus;
      lastSeenAt: Date;
      statusChangedAt?: Date;
      firmwareVersion?: string;
    },
  ): Promise<Device> {
    const device = await withPrismaError('Device', () =>
      this.prisma.device.update({
        where: { id },
        data: {
          lastStatus: data.lastStatus,
          lastSeenAt: data.lastSeenAt,
          ...(data.statusChangedAt !== undefined && {
            statusChangedAt: data.statusChangedAt,
          }),
          ...(data.firmwareVersion !== undefined && {
            firmwareVersion: data.firmwareVersion,
          }),
        },
      }),
    );
    return mapPrismaDeviceToEntity(device);
  }

  async delete(id: string): Promise<void> {
    await withPrismaError('Device', () =>
      this.prisma.device.delete({ where: { id } }),
    );
  }

  async existsByMacAddress(macAddress: string): Promise<boolean> {
    const count = await withPrismaError('Device', () =>
      this.prisma.device.count({ where: { macAddress } }),
    );
    return count > 0;
  }

  async findByUserId(userId: string): Promise<Device[]> {
    const devices = await withPrismaError('Device', () =>
      this.prisma.device.findMany({
        where: { users: { some: { userId } } },
      }),
    );
    return devices.map(mapPrismaDeviceToEntity);
  }
}
