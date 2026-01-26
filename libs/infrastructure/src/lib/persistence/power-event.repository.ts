import type { PrismaClient, Prisma } from '@prisma/client';
import type {
  IPowerEventRepository,
  PowerEvent,
  PowerEventQueryOptions,
  PowerStatus,
} from '@home-pulse-watcher/core';
import { mapPrismaPowerEventToEntity } from '../mappers/power-event.mapper.js';

/**
 * Prisma implementation of IPowerEventRepository.
 * Plain TypeScript class - no NestJS decorators.
 */
export class PrismaPowerEventRepository implements IPowerEventRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<PowerEvent | null> {
    const event = await this.prisma.powerEvent.findUnique({ where: { id } });
    return event ? mapPrismaPowerEventToEntity(event) : null;
  }

  async findMany(options: PowerEventQueryOptions): Promise<PowerEvent[]> {
    const where = this.buildWhereClause(options);

    const events = await this.prisma.powerEvent.findMany({
      where,
      take: options.limit,
      skip: options.offset,
      orderBy: { timestamp: options.orderBy ?? 'desc' },
    });

    return events.map(mapPrismaPowerEventToEntity);
  }

  async findLatestByDeviceId(deviceId: string): Promise<PowerEvent | null> {
    const event = await this.prisma.powerEvent.findFirst({
      where: { deviceId },
      orderBy: { timestamp: 'desc' },
    });
    return event ? mapPrismaPowerEventToEntity(event) : null;
  }

  async create(data: {
    deviceId: string;
    status: PowerStatus;
    timestamp?: Date;
    duration?: number | null;
  }): Promise<PowerEvent> {
    const event = await this.prisma.powerEvent.create({
      data: {
        deviceId: data.deviceId,
        status: data.status,
        timestamp: data.timestamp ?? new Date(),
        duration: data.duration ?? null,
      },
    });
    return mapPrismaPowerEventToEntity(event);
  }

  async update(
    id: string,
    data: { duration?: number | null }
  ): Promise<PowerEvent> {
    const event = await this.prisma.powerEvent.update({
      where: { id },
      data,
    });
    return mapPrismaPowerEventToEntity(event);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.powerEvent.delete({ where: { id } });
  }

  async deleteByDeviceId(deviceId: string): Promise<number> {
    const result = await this.prisma.powerEvent.deleteMany({
      where: { deviceId },
    });
    return result.count;
  }

  async count(
    options: Omit<PowerEventQueryOptions, 'limit' | 'offset' | 'orderBy'>
  ): Promise<number> {
    const where = this.buildWhereClause(options);
    return this.prisma.powerEvent.count({ where });
  }

  private buildWhereClause(
    options: Omit<PowerEventQueryOptions, 'limit' | 'offset' | 'orderBy'>
  ): Prisma.PowerEventWhereInput {
    const where: Prisma.PowerEventWhereInput = {};

    if (options.deviceId) {
      where.deviceId = options.deviceId;
    }

    if (options.status !== undefined) {
      where.status = options.status;
    }

    if (options.startDate || options.endDate) {
      where.timestamp = {};
      if (options.startDate) {
        where.timestamp.gte = options.startDate;
      }
      if (options.endDate) {
        where.timestamp.lte = options.endDate;
      }
    }

    return where;
  }
}
