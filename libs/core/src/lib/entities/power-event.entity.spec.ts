import { PowerEvent } from './power-event.entity.js';
import { PowerStatus } from '../types/power-status.enum.js';

describe('PowerEvent', () => {
  const createPowerEvent = (
    overrides?: Partial<ConstructorParameters<typeof PowerEvent>[0]>
  ) =>
    new PowerEvent({
      id: 'event-1',
      deviceId: 'device-1',
      status: PowerStatus.OFF,
      timestamp: new Date('2024-01-01T12:00:00Z'),
      duration: 3600,
      ...overrides,
    });

  describe('constructor', () => {
    it('should create power event with all properties', () => {
      const event = createPowerEvent();

      expect(event.id).toBe('event-1');
      expect(event.deviceId).toBe('device-1');
      expect(event.status).toBe(PowerStatus.OFF);
      expect(event.timestamp).toEqual(new Date('2024-01-01T12:00:00Z'));
      expect(event.duration).toBe(3600);
    });

    it('should create power event with null duration', () => {
      const event = createPowerEvent({ duration: null });

      expect(event.duration).toBeNull();
    });
  });

  describe('formatDuration', () => {
    it('should return null when duration is null', () => {
      const event = createPowerEvent({ duration: null });

      expect(event.formatDuration()).toBeNull();
    });

    it('should format hours, minutes, and seconds', () => {
      const event = createPowerEvent({ duration: 9015 }); // 2h 30m 15s

      expect(event.formatDuration()).toBe('2h 30m 15s');
    });

    it('should format only hours and minutes when seconds is 0', () => {
      const event = createPowerEvent({ duration: 9000 }); // 2h 30m 0s

      expect(event.formatDuration()).toBe('2h 30m');
    });

    it('should format only minutes and seconds when hours is 0', () => {
      const event = createPowerEvent({ duration: 1815 }); // 30m 15s

      expect(event.formatDuration()).toBe('30m 15s');
    });

    it('should format only seconds when under a minute', () => {
      const event = createPowerEvent({ duration: 45 });

      expect(event.formatDuration()).toBe('45s');
    });

    it('should show 0s for zero duration', () => {
      const event = createPowerEvent({ duration: 0 });

      expect(event.formatDuration()).toBe('0s');
    });

    it('should format only hours when minutes and seconds are 0', () => {
      const event = createPowerEvent({ duration: 7200 }); // 2h

      expect(event.formatDuration()).toBe('2h');
    });
  });
});
