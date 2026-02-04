import type {
  IPowerEventRepository,
  PowerEvent,
  PowerStatus,
} from '@home-pulse-watcher/core';
import {
  type LivrRules,
  type ServiceContext,
} from '@home-pulse-watcher/shared';
import { BaseService } from '../../base-service.js';

export interface GetPowerHistoryInput {
  deviceId: string;
  status?: number;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
  orderBy?: 'asc' | 'desc';
}

export interface GetPowerHistoryOutput {
  events: PowerEvent[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Retrieves power event history for a device with filtering and pagination.
 */
export class GetPowerHistoryService extends BaseService<
  GetPowerHistoryInput,
  GetPowerHistoryOutput
> {
  constructor(private readonly powerEventRepository: IPowerEventRepository) {
    super();
  }

  protected validationRules(): LivrRules {
    return {
      deviceId: ['required', 'string'],
      status: ['integer', { min_number: 0 }, { max_number: 1 }],
      startDate: 'iso_date',
      endDate: 'iso_date',
      limit: ['positive_integer', { max_number: 100 }],
      offset: ['integer', { min_number: 0 }],
      orderBy: { one_of: ['asc', 'desc'] },
    };
  }

  protected async execute(
    params: GetPowerHistoryInput,
    _context: ServiceContext,
  ): Promise<GetPowerHistoryOutput> {
    const limit = params.limit ?? 20;
    const offset = params.offset ?? 0;
    const orderBy = params.orderBy ?? 'desc';

    const queryOptions = {
      deviceId: params.deviceId,
      status: params.status as PowerStatus | undefined,
      startDate: params.startDate ? new Date(params.startDate) : undefined,
      endDate: params.endDate ? new Date(params.endDate) : undefined,
      limit,
      offset,
      orderBy,
    };

    const [events, total] = await Promise.all([
      this.powerEventRepository.findMany(queryOptions),
      this.powerEventRepository.count({
        deviceId: params.deviceId,
        status: params.status as PowerStatus | undefined,
        startDate: queryOptions.startDate,
        endDate: queryOptions.endDate,
      }),
    ]);

    return {
      events,
      total,
      limit,
      offset,
    };
  }
}
