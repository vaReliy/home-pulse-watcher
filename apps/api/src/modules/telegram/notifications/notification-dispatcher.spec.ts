import { Logger } from '@nestjs/common';
import type { NotificationRecipient } from '@home-pulse-watcher/application';
import { NotificationDispatcher } from './notification-dispatcher.js';
import { DEFAULT_LOCALE, DEFAULT_TIMEZONE } from '../i18n/locale.config.js';

function makeRecipient(
  overrides: Partial<NotificationRecipient> = {},
): NotificationRecipient {
  return {
    userId: 'user-1',
    chatId: '111111',
    locale: 'en',
    timezone: 'Europe/London',
    ...overrides,
  };
}

describe('NotificationDispatcher', () => {
  describe('groupByLocaleAndTimezone', () => {
    it('groups recipients sharing the same locale/timezone into one group', () => {
      const dispatcher = new NotificationDispatcher();
      const groups = dispatcher.groupByLocaleAndTimezone([
        makeRecipient({ userId: 'user-1', chatId: '1' }),
        makeRecipient({ userId: 'user-2', chatId: '2' }),
      ]);

      expect(groups).toHaveLength(1);
      expect(groups[0].recipients).toHaveLength(2);
      expect(groups[0].locale).toBe('en');
      expect(groups[0].timezone).toBe('Europe/London');
    });

    it('splits recipients with different locale/timezone into separate groups', () => {
      const dispatcher = new NotificationDispatcher();
      const groups = dispatcher.groupByLocaleAndTimezone([
        makeRecipient({ userId: 'user-1', locale: 'en', timezone: 'A' }),
        makeRecipient({ userId: 'user-2', locale: 'uk', timezone: 'B' }),
      ]);

      expect(groups).toHaveLength(2);
    });

    it('applies default locale/timezone fallback for missing values', () => {
      const dispatcher = new NotificationDispatcher();
      const groups = dispatcher.groupByLocaleAndTimezone([
        makeRecipient({
          locale: undefined as unknown as string,
          timezone: undefined as unknown as string,
        }),
      ]);

      expect(groups[0].locale).toBe(DEFAULT_LOCALE);
      expect(groups[0].timezone).toBe(DEFAULT_TIMEZONE);
    });
  });

  describe('dispatch', () => {
    it('sends one formatted message per group, rate-limited in batches', async () => {
      const dispatcher = new NotificationDispatcher();
      const sendMessage = jest.fn().mockResolvedValue({});
      const bot = { telegram: { sendMessage } } as unknown as Parameters<
        NotificationDispatcher['dispatch']
      >[0];

      const recipients = [
        makeRecipient({ userId: 'user-1', chatId: '1', locale: 'en' }),
        makeRecipient({ userId: 'user-2', chatId: '2', locale: 'uk' }),
      ];

      const buildMessage = jest.fn((group) => ({
        text: `hello-${group.locale}`,
      }));

      await dispatcher.dispatch(bot, recipients, buildMessage);

      expect(buildMessage).toHaveBeenCalledTimes(2);
      expect(sendMessage).toHaveBeenCalledTimes(2);
      expect(sendMessage).toHaveBeenCalledWith(
        '1',
        'hello-en',
        expect.objectContaining({ parse_mode: 'MarkdownV2' }),
      );
      expect(sendMessage).toHaveBeenCalledWith(
        '2',
        'hello-uk',
        expect.objectContaining({ parse_mode: 'MarkdownV2' }),
      );
    });

    it('does not abort the batch when a single send fails', async () => {
      const dispatcher = new NotificationDispatcher();
      const sendMessage = jest
        .fn()
        .mockRejectedValueOnce(new Error('blocked by user'))
        .mockResolvedValueOnce({});
      const bot = { telegram: { sendMessage } } as unknown as Parameters<
        NotificationDispatcher['dispatch']
      >[0];

      const recipients = [
        makeRecipient({ userId: 'user-1', chatId: '1' }),
        makeRecipient({ userId: 'user-2', chatId: '2' }),
      ];

      await expect(
        dispatcher.dispatch(bot, recipients, () => ({ text: 'hi' })),
      ).resolves.toBeUndefined();
      expect(sendMessage).toHaveBeenCalledTimes(2);
    });

    it('splits a single group of >25 recipients into rate-limited batches of 25', async () => {
      jest.useFakeTimers();
      try {
        const dispatcher = new NotificationDispatcher();
        const sendMessage = jest.fn().mockResolvedValue({});
        const bot = { telegram: { sendMessage } } as unknown as Parameters<
          NotificationDispatcher['dispatch']
        >[0];

        const recipients = Array.from({ length: 30 }, (_, i) =>
          makeRecipient({
            userId: `user-${i}`,
            chatId: `${i}`,
            locale: 'en',
            timezone: 'Europe/London',
          }),
        );

        const dispatchPromise = dispatcher.dispatch(bot, recipients, () => ({
          text: 'hi',
        }));

        // First batch (25 recipients) sends immediately.
        await jest.advanceTimersByTimeAsync(0);
        expect(sendMessage).toHaveBeenCalledTimes(25);

        // Second batch (5 recipients) only fires after BATCH_DELAY_MS.
        await jest.advanceTimersByTimeAsync(999);
        expect(sendMessage).toHaveBeenCalledTimes(25);

        await jest.advanceTimersByTimeAsync(1);
        await dispatchPromise;

        expect(sendMessage).toHaveBeenCalledTimes(30);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('recipient ID log masking (PII)', () => {
    const longChatId = '987654321';
    const longUserId = '123456789';
    let debugSpy: jest.SpyInstance;
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
      debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation();
      warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    });

    afterEach(() => {
      debugSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('masks the chatId when logging a successful send', async () => {
      const dispatcher = new NotificationDispatcher();
      const sendMessage = jest.fn().mockResolvedValue({});
      const bot = { telegram: { sendMessage } } as unknown as Parameters<
        NotificationDispatcher['dispatch']
      >[0];

      const recipients = [
        makeRecipient({ userId: longUserId, chatId: longChatId }),
      ];

      await dispatcher.dispatch(bot, recipients, () => ({ text: 'hi' }));

      expect(debugSpy).toHaveBeenCalled();
      const combined = debugSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(combined).not.toContain(longChatId);
      expect(combined).toContain('...4321');
    });

    it('masks the userId when logging a failed send', async () => {
      const dispatcher = new NotificationDispatcher();
      const sendMessage = jest
        .fn()
        .mockRejectedValue(new Error('blocked by user'));
      const bot = { telegram: { sendMessage } } as unknown as Parameters<
        NotificationDispatcher['dispatch']
      >[0];

      const recipients = [
        makeRecipient({ userId: longUserId, chatId: longChatId }),
      ];

      await dispatcher.dispatch(bot, recipients, () => ({ text: 'hi' }));

      expect(warnSpy).toHaveBeenCalled();
      const combined = warnSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(combined).not.toContain(longUserId);
      expect(combined).not.toContain(longChatId);
      expect(combined).toContain('...6789');
    });

    // The *** short-input fallback branch itself is covered once, by
    // maskTrailing's own spec in libs/shared — no need to re-exercise it
    // through every call site.

    it('redacts the bot token from a network-level FetchError stack/message', async () => {
      const dispatcher = new NotificationDispatcher();
      const fakeToken = '123456:FAKE_TOKEN_ABC';
      const fetchError = new Error(
        `request to https://api.telegram.org/bot${fakeToken}/sendMessage failed, reason: connect ETIMEDOUT`,
      );
      fetchError.name = 'FetchError';
      fetchError.stack = `FetchError: request to https://api.telegram.org/bot${fakeToken}/sendMessage failed, reason: connect ETIMEDOUT\n    at ClientRequest.<anonymous>`;

      const sendMessage = jest.fn().mockRejectedValue(fetchError);
      const bot = { telegram: { sendMessage } } as unknown as Parameters<
        NotificationDispatcher['dispatch']
      >[0];

      const recipients = [
        makeRecipient({ userId: longUserId, chatId: longChatId }),
      ];

      await dispatcher.dispatch(bot, recipients, () => ({ text: 'hi' }));

      expect(warnSpy).toHaveBeenCalled();
      const combined = warnSpy.mock.calls
        .map((c) => c.map(String).join(' '))
        .join('\n');
      expect(combined).not.toContain(fakeToken);
      expect(combined).toContain('bot***');
    });

    it('redacts the bot token from message alone when stack is undefined', async () => {
      const dispatcher = new NotificationDispatcher();
      const fakeToken = '123456:FAKE_TOKEN_ABC';
      const fetchError = new Error(
        `request to https://api.telegram.org/bot${fakeToken}/sendMessage failed, reason: connect ETIMEDOUT`,
      );
      fetchError.name = 'FetchError';
      fetchError.stack = undefined;

      const sendMessage = jest.fn().mockRejectedValue(fetchError);
      const bot = { telegram: { sendMessage } } as unknown as Parameters<
        NotificationDispatcher['dispatch']
      >[0];

      const recipients = [
        makeRecipient({ userId: longUserId, chatId: longChatId }),
      ];

      await dispatcher.dispatch(bot, recipients, () => ({ text: 'hi' }));

      expect(warnSpy).toHaveBeenCalled();
      const combined = warnSpy.mock.calls
        .map((c) => c.map(String).join(' '))
        .join('\n');
      expect(combined).not.toContain(fakeToken);
      expect(combined).toContain('bot***');
    });

    it('does not alter a normal error with no token-shaped substring', async () => {
      const dispatcher = new NotificationDispatcher();
      const plainError = new Error('blocked by user');
      plainError.name = 'TelegramError';
      plainError.stack = 'TelegramError: blocked by user\n    at somewhere';

      const sendMessage = jest.fn().mockRejectedValue(plainError);
      const bot = { telegram: { sendMessage } } as unknown as Parameters<
        NotificationDispatcher['dispatch']
      >[0];

      const recipients = [
        makeRecipient({ userId: longUserId, chatId: longChatId }),
      ];

      await dispatcher.dispatch(bot, recipients, () => ({ text: 'hi' }));

      expect(warnSpy).toHaveBeenCalled();
      const combined = warnSpy.mock.calls
        .map((c) => c.map(String).join(' '))
        .join('\n');
      expect(combined).toContain('blocked by user');
      expect(combined).not.toContain('bot***');
    });
  });
});
