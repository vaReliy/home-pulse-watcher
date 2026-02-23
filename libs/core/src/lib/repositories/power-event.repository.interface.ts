import type { PowerEvent } from '../entities/power-event.entity.js';
import type { PowerStatus } from '../types/power-status.enum.js';

/**
 * Options for querying power events.
 */
export interface PowerEventQueryOptions {
  /** Filter by device ID */
  deviceId?: string;
  /** Filter by status */
  status?: PowerStatus;
  /** Events after this timestamp */
  startDate?: Date;
  /** Events before this timestamp */
  endDate?: Date;
  /** Maximum number of results */
  limit?: number;
  /** Number of results to skip */
  offset?: number;
  /** Sort order by timestamp */
  orderBy?: 'asc' | 'desc';
}

/**
 * Repository interface for PowerEvent entity operations.
 */
export interface IPowerEventRepository {
  /**
   * Find event by ID.
   */
  findById(id: string): Promise<PowerEvent | null>;

  /**
   * Find events matching query options.
   */
  findMany(options: PowerEventQueryOptions): Promise<PowerEvent[]>;

  /**
   * Find the most recent event for a device.
   */
  findLatestByDeviceId(deviceId: string): Promise<PowerEvent | null>;

  /**
   * Create a new power event.
   */
  create(data: {
    deviceId: string;
    status: PowerStatus;
    timestamp?: Date;
    duration?: number | null;
    voltage?: number | null;
  }): Promise<PowerEvent>;

  /**
   * Update event (primarily for setting duration).
   */
  update(id: string, data: { duration?: number | null }): Promise<PowerEvent>;

  /**
   * Delete event by ID.
   */
  delete(id: string): Promise<void>;

  /**
   * Delete all events for a device.
   */
  deleteByDeviceId(deviceId: string): Promise<number>;

  /**
   * Count events matching query options.
   */
  count(
    options: Omit<PowerEventQueryOptions, 'limit' | 'offset' | 'orderBy'>,
  ): Promise<number>;
}
