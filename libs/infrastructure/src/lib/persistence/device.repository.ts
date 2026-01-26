import type { PrismaClient } from '@prisma/client';
import type {
  IDeviceRepository,
  Device,
  PowerStatus,
} from '@home-pulse-watcher/core';
import { mapPrismaDeviceToEntity } from '../mappers/device.mapper.js';

/**
 * Prisma implementation of IDeviceRepository.
 * Plain TypeScript class - no NestJS decorators.
 */
export class PrismaDeviceRepository implements IDeviceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Device | null> {
    const device = await this.prisma.device.findUnique({ where: { id } });
    return device ? mapPrismaDeviceToEntity(device) : null;
  }

  async findByMacAddress(macAddress: string): Promise<Device | null> {
    const device = await this.prisma.device.findUnique({
      where: { macAddress },
    });
    return device ? mapPrismaDeviceToEntity(device) : null;
  }

  async create(data: {
    macAddress: string;
    secretHash: string;
    label?: string | null;
  }): Promise<Device> {
    const device = await this.prisma.device.create({
      data: {
        macAddress: data.macAddress,
        secretHash: data.secretHash,
        label: data.label ?? null,
      },
    });
    return mapPrismaDeviceToEntity(device);
  }

  async update(
    id: string,
    data: { label?: string | null; secretHash?: string }
  ): Promise<Device> {
    const device = await this.prisma.device.update({
      where: { id },
      data,
    });
    return mapPrismaDeviceToEntity(device);
  }

  async updateStatus(
    id: string,
    data: { lastStatus: PowerStatus; lastSeenAt: Date }
  ): Promise<Device> {
    const device = await this.prisma.device.update({
      where: { id },
      data: {
        lastStatus: data.lastStatus,
        lastSeenAt: data.lastSeenAt,
      },
    });
    return mapPrismaDeviceToEntity(device);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.device.delete({ where: { id } });
  }

  async existsByMacAddress(macAddress: string): Promise<boolean> {
    const count = await this.prisma.device.count({
      where: { macAddress },
    });
    return count > 0;
  }

  async findByUserId(userId: string): Promise<Device[]> {
    const devices = await this.prisma.device.findMany({
      where: {
        users: {
          some: { userId },
        },
      },
    });
    return devices.map(mapPrismaDeviceToEntity);
  }
}
