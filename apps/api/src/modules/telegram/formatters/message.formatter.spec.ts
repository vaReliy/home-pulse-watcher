import { Device, PowerStatus } from '@home-pulse-watcher/core';
import { BatteryLowEvent } from '@home-pulse-watcher/application';
import type { CollapsedEvent } from './collapse-events.js';
import { TranslationService } from '../i18n/index.js';
import { MessageFormatter } from './message.formatter.js';

function makeCollapsed(
  status: PowerStatus,
  timestamp: string,
  duration: number | null = null,
  eventCount = 1,
): CollapsedEvent {
  return { status, timestamp: new Date(timestamp), duration, eventCount };
}

describe('MessageFormatter', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-15T12:00:00Z'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  const translationService = new TranslationService();
  const formatter = new MessageFormatter(translationService);

  const makeDevice = (
    overrides: Partial<Omit<Device, 'isOnline' | 'hasUps'>> = {},
  ): Device =>
    ({
      id: 'device-1',
      macAddress: 'AA:BB:CC:DD:EE:FF',
      encryptedSecret: 'secret',
      label: 'Kitchen',
      lastStatus: PowerStatus.ON,
      lastSeenAt: new Date('2026-02-10T10:00:00Z'),
      statusChangedAt: null,
      firmwareVersion: null,
      batteryVoltage: null,
      ...overrides,
      isOnline: () => true,
      get hasUps() {
        return this.batteryVoltage !== null;
      },
    }) as Device;

  describe('formatDeviceStatus', () => {
    it('should show lastSeenAt and no status-since line when statusChangedAt is null', () => {
      const device = makeDevice({ statusChangedAt: null });
      const result = formatter.formatDeviceStatus(
        device,
        null,
        'en',
        'Europe/Kyiv',
      );
      expect(result).toContain('Last seen:');
      expect(result).not.toContain('Status since:');
    });

    it('should show both lastSeenAt and statusSince when statusChangedAt is set', () => {
      const device = makeDevice({
        statusChangedAt: new Date('2026-02-10T08:00:00Z'),
      });
      const result = formatter.formatDeviceStatus(
        device,
        null,
        'en',
        'Europe/Kyiv',
      );
      expect(result).toContain('Last seen:');
      expect(result).toContain('Status since:');
    });

    it('should show Ukrainian label for statusSince', () => {
      const device = makeDevice({
        statusChangedAt: new Date('2026-02-10T08:00:00Z'),
      });
      const result = formatter.formatDeviceStatus(
        device,
        null,
        'uk',
        'Europe/Kyiv',
      );
      expect(result).toContain('Статус з:');
      // MarkdownV2 escapes the apostrophe in "з'єднання"
      expect(result).toContain("Останнє з\\'єднання:");
    });
  });

  describe('formatDateTime', () => {
    const date = new Date('2026-02-10T08:00:00Z');

    it('should format date in Europe/Kyiv timezone (Ukrainian locale)', () => {
      const result = formatter.formatDateTime(date, 'uk', 'Europe/Kyiv');
      // Kyiv is UTC+2, so 08:00 UTC → 10:00 Kyiv
      expect(result).toContain('10:00');
    });

    it('should format date in en-US locale', () => {
      const result = formatter.formatDateTime(date, 'en', 'America/New_York');
      // New York is UTC-5, so 08:00 UTC → 03:00 New York
      expect(result).toContain('03:00');
    });

    it('should default to Europe/Kyiv when timezone not provided', () => {
      const result = formatter.formatDateTime(date);
      expect(result).toContain('10:00');
    });

    it('should not include timezone name in output', () => {
      const result = formatter.formatDateTime(date, 'en', 'America/New_York');
      expect(result).not.toContain('EST');
      expect(result).not.toContain('GMT');
      expect(result).not.toContain('UTC');
    });
  });

  describe('formatDuration', () => {
    it('should use Ukrainian suffixes by default', () => {
      const result = formatter.formatDuration(3661);
      expect(result).toBe('1год 1хв');
    });

    it('should use English suffixes for en locale', () => {
      const result = formatter.formatDuration(3661, 'en');
      expect(result).toBe('1h 1m');
    });

    it('should show seconds only when sub-minute', () => {
      const result = formatter.formatDuration(45, 'uk');
      expect(result).toBe('45с');
    });

    it('should omit seconds when hours present but no minutes', () => {
      const result = formatter.formatDuration(3659, 'uk');
      expect(result).toBe('1год');
    });

    it('should format hours only', () => {
      const result = formatter.formatDuration(7200, 'uk');
      expect(result).toBe('2год');
    });

    it('should format minutes only', () => {
      const result = formatter.formatDuration(300, 'uk');
      expect(result).toBe('5хв');
    });

    it('should show 0s for zero duration', () => {
      const result = formatter.formatDuration(0, 'uk');
      expect(result).toBe('0с');
    });
  });

  describe('formatHistory', () => {
    it('should use locale-aware header for Ukrainian', () => {
      const events = [
        {
          label: 'Kitchen',
          events: [
            makeCollapsed(PowerStatus.OFF, '2026-02-10T08:00:00Z', 3600),
          ],
        },
      ];

      const result = formatter.formatHistory(events, 'uk', 'Europe/Kyiv');
      expect(result).toContain('Історія відключень');
      expect(result).toContain('Kitchen');
    });

    it('should use English period label for en locale', () => {
      const events = [
        {
          label: 'Kitchen',
          events: [
            makeCollapsed(PowerStatus.OFF, '2026-02-10T08:00:00Z', 3600),
          ],
        },
      ];

      const result = formatter.formatHistory(events, 'en', 'America/New_York');
      expect(result).toContain('Outage History');
      expect(result).toContain('last 7 days');
    });

    it('should only count OFF event durations in statistics', () => {
      const events = [
        {
          label: 'Kitchen',
          events: [
            makeCollapsed(PowerStatus.OFF, '2026-02-10T08:00:00Z', 3600),
            makeCollapsed(PowerStatus.ON, '2026-02-10T09:00:00Z', 7200),
            makeCollapsed(PowerStatus.OFF, '2026-02-10T11:00:00Z', 1800),
          ],
        },
      ];

      const result = formatter.formatHistory(events, 'en', 'Europe/Kyiv');
      // Summary should show 2 outages / 1h 30m (3600 + 1800 = 5400s)
      // NOT 3h 30m (which would include the ON duration)
      expect(result).toContain('1h 30m');
      expect(result).not.toContain('3h 30m');
    });

    it('should display collapsed events correctly', () => {
      const events = [
        {
          label: 'Kitchen',
          events: [
            makeCollapsed(PowerStatus.OFF, '2026-02-10T08:00:00Z', 7200, 24),
            makeCollapsed(PowerStatus.ON, '2026-02-10T10:00:00Z', 14400, 48),
          ],
        },
      ];

      const result = formatter.formatHistory(events, 'en', 'Europe/Kyiv');
      // Should show 2h duration for the OFF event
      expect(result).toContain('2h');
      // Should show only 1 outage in summary (collapsed)
      expect(result).toMatch(/1 \/ 2h/);
    });

    it('should truncate message exceeding 4096 characters', () => {
      const makeEvents = (count: number) =>
        Array.from({ length: count }, (_, i) =>
          makeCollapsed(
            i % 2 === 0 ? PowerStatus.OFF : PowerStatus.ON,
            `2026-02-${String((i % 28) + 1).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00:00Z`,
            3600 + i * 60,
          ),
        );

      const deviceHistories = Array.from({ length: 5 }, (_, i) => ({
        label: `Device ${String.fromCharCode(65 + i)}`,
        events: makeEvents(50),
      }));

      const result = formatter.formatHistory(
        deviceHistories,
        'en',
        'Europe/Kyiv',
      );

      expect(result.length).toBeLessThanOrEqual(4096);
      expect(result).toContain('showing');
      expect(result).toMatch(/showing \d+ of \d+ events/);
    });
  });

  describe('formatDeviceStatus with battery', () => {
    it('should not include battery line when batteryVoltage is null', () => {
      const device = makeDevice({ batteryVoltage: null });
      const result = formatter.formatDeviceStatus(
        device,
        null,
        'en',
        'Europe/Kyiv',
      );
      expect(result).not.toContain('Battery');
      expect(result).not.toContain('🔋');
    });

    it('should append battery line when batteryVoltage is set', () => {
      const device = makeDevice({ batteryVoltage: 3850 });
      const result = formatter.formatDeviceStatus(
        device,
        null,
        'en',
        'Europe/Kyiv',
      );
      expect(result).toContain('🔋');
      expect(result).toContain('3\\.85');
      expect(result).toContain('71');
    });

    it('should show 100% for fully charged battery', () => {
      const device = makeDevice({ batteryVoltage: 4200 });
      const result = formatter.formatDeviceStatus(
        device,
        null,
        'en',
        'Europe/Kyiv',
      );
      expect(result).toContain('4\\.20');
      expect(result).toContain('100');
    });

    // Repro: same invalid-reading guard as appendBatteryLine, but
    // formatDeviceStatus has its own separate `> 0` check (line 75) that is
    // not covered by the appendBatteryLine-based tests below.
    it('should not include battery line when batteryVoltage is 0 (invalid reading)', () => {
      const device = makeDevice({ batteryVoltage: 0 });
      const result = formatter.formatDeviceStatus(
        device,
        null,
        'en',
        'Europe/Kyiv',
      );
      expect(result).not.toContain('Battery');
      expect(result).not.toContain('🔋');
    });

    it('should not include battery line when batteryVoltage is negative (invalid reading)', () => {
      const device = makeDevice({ batteryVoltage: -1 });
      const result = formatter.formatDeviceStatus(
        device,
        null,
        'en',
        'Europe/Kyiv',
      );
      expect(result).not.toContain('Battery');
      expect(result).not.toContain('🔋');
    });
  });

  describe('formatPowerLost with battery', () => {
    it('should not include battery info when batteryVoltage is null', () => {
      const result = formatter.formatPowerLost({
        deviceLabel: 'Kitchen',
        timestamp: new Date('2026-02-10T08:00:00Z'),
        durationSeconds: null,
        locale: 'en',
        timezone: 'Europe/Kyiv',
        batteryVoltage: null,
      });
      expect(result).not.toContain('🔋');
    });

    it('should append battery info when batteryVoltage is provided', () => {
      const result = formatter.formatPowerLost({
        deviceLabel: 'Kitchen',
        timestamp: new Date('2026-02-10T08:00:00Z'),
        durationSeconds: null,
        locale: 'en',
        timezone: 'Europe/Kyiv',
        batteryVoltage: 3850,
      });
      expect(result).toContain('🔋');
      expect(result).toContain('3\\.85');
    });

    // Repro: device reports batteryVoltage=0 (stale/uninitialised firmware reading
    // before first heartbeat). 0 mV is physically implausible for a live device and
    // must be treated as "no reading", matching the SOS guard (batteryVoltage > 0)
    // in ProcessPowerStatusService. Should NOT render "0.00V (0%)".
    it('should not include battery info when batteryVoltage is 0 (invalid reading)', () => {
      const result = formatter.formatPowerLost({
        deviceLabel: 'Kitchen',
        timestamp: new Date('2026-02-10T08:00:00Z'),
        durationSeconds: null,
        locale: 'en',
        timezone: 'Europe/Kyiv',
        batteryVoltage: 0,
      });
      expect(result).not.toContain('🔋');
      expect(result).not.toContain('0\\.00');
    });

    it('should not include battery info when batteryVoltage is negative (invalid reading)', () => {
      const result = formatter.formatPowerLost({
        deviceLabel: 'Kitchen',
        timestamp: new Date('2026-02-10T08:00:00Z'),
        durationSeconds: null,
        locale: 'en',
        timezone: 'Europe/Kyiv',
        batteryVoltage: -50,
      });
      expect(result).not.toContain('🔋');
    });
  });

  describe('formatPowerRestored with battery', () => {
    it('should not include battery info when batteryVoltage is null', () => {
      const result = formatter.formatPowerRestored({
        deviceLabel: 'Kitchen',
        timestamp: new Date('2026-02-10T08:00:00Z'),
        durationSeconds: 3600,
        locale: 'en',
        timezone: 'Europe/Kyiv',
        batteryVoltage: null,
      });
      expect(result).not.toContain('🔋');
    });

    it('should append battery info when batteryVoltage is provided', () => {
      const result = formatter.formatPowerRestored({
        deviceLabel: 'Kitchen',
        timestamp: new Date('2026-02-10T08:00:00Z'),
        durationSeconds: 3600,
        locale: 'en',
        timezone: 'Europe/Kyiv',
        batteryVoltage: 4200,
      });
      expect(result).toContain('🔋');
      expect(result).toContain('4\\.20');
      expect(result).toContain('100');
    });

    // Repro: power-restored right after a reboot mid-outage, before the first
    // heartbeat refreshed the battery reading → device sends batteryVoltage=0.
    // Must be treated as "no reading", not rendered as "0.00V (0%)".
    it('should not include battery info when batteryVoltage is 0 (invalid reading)', () => {
      const result = formatter.formatPowerRestored({
        deviceLabel: 'Kitchen',
        timestamp: new Date('2026-02-10T08:00:00Z'),
        durationSeconds: 14160,
        locale: 'en',
        timezone: 'Europe/Kyiv',
        batteryVoltage: 0,
      });
      expect(result).not.toContain('🔋');
      expect(result).not.toContain('0\\.00');
    });
  });

  describe('formatBatteryLowAlert', () => {
    it('should format SOS alert with device label and battery info', () => {
      const event = new BatteryLowEvent({
        deviceId: 'device-1',
        deviceLabel: 'Kitchen',
        batteryVoltage: 3350,
        timestamp: new Date('2026-02-10T08:00:00Z'),
      });
      const result = formatter.formatBatteryLowAlert(
        event,
        'en',
        'Europe/Kyiv',
      );
      expect(result).toContain('Low Battery Alert');
      expect(result).toContain('Kitchen');
      expect(result).toContain('3\\.35');
      expect(result).toContain('29');
    });

    it('should use "Unknown Device" when deviceLabel is null', () => {
      const event = new BatteryLowEvent({
        deviceId: 'device-1',
        deviceLabel: null,
        batteryVoltage: 3200,
        timestamp: new Date('2026-02-10T08:00:00Z'),
      });
      const result = formatter.formatBatteryLowAlert(
        event,
        'en',
        'Europe/Kyiv',
      );
      expect(result).toContain('Unknown Device');
    });

    it('should format SOS alert in Ukrainian', () => {
      const event = new BatteryLowEvent({
        deviceId: 'device-1',
        deviceLabel: 'Kitchen',
        batteryVoltage: 3400,
        timestamp: new Date('2026-02-10T08:00:00Z'),
      });
      const result = formatter.formatBatteryLowAlert(
        event,
        'uk',
        'Europe/Kyiv',
      );
      expect(result).toContain('Kitchen');
      expect(result).toContain('3\\.40');
    });
  });
});
