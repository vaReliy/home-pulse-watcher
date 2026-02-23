import { mapPrismaPowerEventToEntity } from './power-event.mapper.js';
import { PowerEvent, PowerStatus } from '@home-pulse-watcher/core';

describe('mapPrismaPowerEventToEntity', () => {
  it('should map Prisma PowerEvent to Domain PowerEvent', () => {
    const prismaPowerEvent = {
      id: 'event-1',
      deviceId: 'device-1',
      status: 0,
      timestamp: new Date('2024-01-01T12:00:00Z'),
      duration: 3600,
      voltage: 228.5,
    };

    const result = mapPrismaPowerEventToEntity(prismaPowerEvent);

    expect(result).toBeInstanceOf(PowerEvent);
    expect(result.id).toBe('event-1');
    expect(result.deviceId).toBe('device-1');
    expect(result.status).toBe(PowerStatus.OFF);
    expect(result.timestamp).toEqual(new Date('2024-01-01T12:00:00Z'));
    expect(result.duration).toBe(3600);
    expect(result.voltage).toBe(228.5);
  });

  it('should handle null duration and voltage', () => {
    const prismaPowerEvent = {
      id: 'event-1',
      deviceId: 'device-1',
      status: 1,
      timestamp: new Date('2024-01-01T12:00:00Z'),
      duration: null,
      voltage: null,
    };

    const result = mapPrismaPowerEventToEntity(prismaPowerEvent);

    expect(result.duration).toBeNull();
    expect(result.voltage).toBeNull();
    expect(result.status).toBe(PowerStatus.ON);
  });
});
