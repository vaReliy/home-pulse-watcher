import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { BatteryLowListener } from './battery-low.listener.js';
import {
  BatteryLowEvent,
  type GetDeviceNotificationRecipientsService,
  type NotificationRecipient,
} from '@home-pulse-watcher/application';
import { SERVICE_TOKENS } from '../../services/service.tokens.js';
import { TELEGRAM_TOKENS } from '../telegram.tokens.js';
import { MessageFormatter } from '../formatters/message.formatter.js';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.js';

function makeRecipient(
  overrides: Partial<NotificationRecipient> = {},
): NotificationRecipient {
  return {
    userId: 'user-1',
    chatId: '111111',
    locale: 'en',
    timezone: 'Europe/Kyiv',
    ...overrides,
  };
}

function makeBatteryLowEvent(
  overrides: Partial<ConstructorParameters<typeof BatteryLowEvent>[0]> = {},
): BatteryLowEvent {
  return new BatteryLowEvent({
    deviceId: 'device-1',
    deviceLabel: 'Kitchen',
    batteryVoltage: 3350,
    timestamp: new Date('2026-02-10T08:00:00Z'),
    ...overrides,
  });
}

describe('BatteryLowListener', () => {
  let listener: BatteryLowListener;
  let mockBot: { telegram: { sendMessage: jest.Mock } } | null;
  let mockGetRecipientsService: jest.Mocked<
    Pick<GetDeviceNotificationRecipientsService, 'run'>
  >;
  let mockMessageFormatter: jest.Mocked<
    Pick<MessageFormatter, 'formatBatteryLowAlert'>
  >;

  const createModule = async (bot: typeof mockBot): Promise<TestingModule> => {
    mockGetRecipientsService = {
      run: jest.fn(),
    };

    mockMessageFormatter = {
      formatBatteryLowAlert: jest
        .fn()
        .mockReturnValue('🆘 *Low Battery Alert\\!*'),
    };

    const module = await Test.createTestingModule({
      providers: [
        BatteryLowListener,
        { provide: TELEGRAM_TOKENS.BOT, useValue: bot },
        {
          provide: SERVICE_TOKENS.GET_DEVICE_NOTIFICATION_RECIPIENTS,
          useValue: mockGetRecipientsService,
        },
        NotificationDispatcher,
        { provide: MessageFormatter, useValue: mockMessageFormatter },
      ],
    }).compile();

    listener = module.get(BatteryLowListener);
    return module;
  };

  describe('when bot is not configured', () => {
    beforeEach(async () => {
      await createModule(null);
    });

    it('should return early without errors', async () => {
      const event = makeBatteryLowEvent();
      await expect(listener.handleBatteryLow(event)).resolves.toBeUndefined();
      expect(mockGetRecipientsService.run).not.toHaveBeenCalled();
    });
  });

  describe('when bot is configured', () => {
    beforeEach(async () => {
      mockBot = { telegram: { sendMessage: jest.fn().mockResolvedValue({}) } };
      await createModule(mockBot);
    });

    it('should return early when no users are subscribed', async () => {
      mockGetRecipientsService.run.mockResolvedValue({
        data: { recipients: [] },
      });

      await listener.handleBatteryLow(makeBatteryLowEvent());

      expect(mockBot!.telegram.sendMessage).not.toHaveBeenCalled();
    });

    it('should send SOS alert to a single subscribed user', async () => {
      mockGetRecipientsService.run.mockResolvedValue({
        data: { recipients: [makeRecipient()] },
      });

      await listener.handleBatteryLow(makeBatteryLowEvent());

      expect(mockMessageFormatter.formatBatteryLowAlert).toHaveBeenCalledWith(
        expect.any(BatteryLowEvent),
        'en',
        'Europe/Kyiv',
      );
      expect(mockBot!.telegram.sendMessage).toHaveBeenCalledWith(
        '111111',
        '🆘 *Low Battery Alert\\!*',
        { parse_mode: 'MarkdownV2' },
      );
    });

    it('should group recipients by locale and timezone', async () => {
      mockGetRecipientsService.run.mockResolvedValue({
        data: {
          recipients: [
            makeRecipient({
              userId: 'user-1',
              chatId: '111111',
              locale: 'en',
              timezone: 'America/New_York',
            }),
            makeRecipient({
              userId: 'user-2',
              chatId: '222222',
              locale: 'uk',
              timezone: 'Europe/Kyiv',
            }),
          ],
        },
      });

      await listener.handleBatteryLow(makeBatteryLowEvent());

      expect(mockMessageFormatter.formatBatteryLowAlert).toHaveBeenCalledTimes(
        2,
      );
      expect(mockMessageFormatter.formatBatteryLowAlert).toHaveBeenCalledWith(
        expect.any(BatteryLowEvent),
        'en',
        'America/New_York',
      );
      expect(mockMessageFormatter.formatBatteryLowAlert).toHaveBeenCalledWith(
        expect.any(BatteryLowEvent),
        'uk',
        'Europe/Kyiv',
      );
      expect(mockBot!.telegram.sendMessage).toHaveBeenCalledTimes(2);
    });
  });
});
