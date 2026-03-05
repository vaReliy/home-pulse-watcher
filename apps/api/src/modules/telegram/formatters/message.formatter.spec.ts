import { TranslationService } from '../i18n/index.js';
import { MessageFormatter } from './message.formatter.js';

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
      expect(result).toBe('1год 1хв 1с');
    });

    it('should use English suffixes for en locale', () => {
      const result = formatter.formatDuration(3661, 'en');
      expect(result).toBe('1h 1m 1s');
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
    it('should use locale-aware month name for Ukrainian', () => {
      const events = [
        {
          label: 'Kitchen',
          events: [
            {
              id: '1',
              deviceId: 'd1',
              status: 0,
              timestamp: new Date('2026-02-10T08:00:00Z'),
              duration: 3600,
            },
          ],
        },
      ];

      const result = formatter.formatHistory(
        events as Parameters<typeof formatter.formatHistory>[0],
        'uk',
        'Europe/Kyiv',
      );
      expect(result).toContain('Історія відключень');
      expect(result).toContain('Kitchen');
    });

    it('should use English month name for en locale', () => {
      const events = [
        {
          label: 'Kitchen',
          events: [
            {
              id: '1',
              deviceId: 'd1',
              status: 0,
              timestamp: new Date('2026-02-10T08:00:00Z'),
              duration: 3600,
            },
          ],
        },
      ];

      const result = formatter.formatHistory(
        events as Parameters<typeof formatter.formatHistory>[0],
        'en',
        'America/New_York',
      );
      expect(result).toContain('Outage History');
      expect(result).toContain('February');
    });
  });
});
