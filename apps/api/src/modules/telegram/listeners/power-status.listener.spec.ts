import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { PowerStatusListener } from './power-status.listener.js';
import {
  PowerStatusChangedEvent,
  type GetDeviceNotificationRecipientsService,
  type NotificationRecipient,
} from '@home-pulse-watcher/application';
import { PowerStatus } from '@home-pulse-watcher/core';
import { SERVICE_TOKENS } from '../../services/service.tokens.js';
import { TELEGRAM_TOKENS } from '../telegram.tokens.js';
import { MessageFormatter } from '../formatters/message.formatter.js';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.js';
import { TranslationService } from '../i18n/index.js';

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

function makePowerStatusEvent(
  overrides: Partial<
    ConstructorParameters<typeof PowerStatusChangedEvent>[0]
  > = {},
): PowerStatusChangedEvent {
  return new PowerStatusChangedEvent({
    deviceId: 'device-1',
    deviceLabel: 'Kitchen',
    previousStatus: PowerStatus.ON,
    newStatus: PowerStatus.OFF,
    timestamp: new Date('2026-02-10T08:00:00Z'),
    eventId: 'event-1',
    durationSeconds: null,
    voltage: null,
    batteryVoltage: null,
    ...overrides,
  });
}

describe('PowerStatusListener', () => {
  let listener: PowerStatusListener;
  let mockBot: { telegram: { sendMessage: jest.Mock } } | null;
  let mockGetRecipientsService: jest.Mocked<
    Pick<GetDeviceNotificationRecipientsService, 'run'>
  >;
  let mockMessageFormatter: jest.Mocked<
    Pick<
      MessageFormatter,
      | 'formatPowerLost'
      | 'formatPowerRestored'
      | 'formatDeviceOnline'
      | 'formatDeviceOffline'
    >
  >;

  const createModule = async (bot: typeof mockBot): Promise<TestingModule> => {
    mockGetRecipientsService = {
      run: jest.fn(),
    };

    mockMessageFormatter = {
      formatPowerLost: jest.fn().mockReturnValue('⚡ *Power lost\\!*'),
      formatPowerRestored: jest.fn().mockReturnValue('✅ *Power restored\\!*'),
      formatDeviceOnline: jest.fn().mockReturnValue('🟢 *Device online*'),
      formatDeviceOffline: jest.fn().mockReturnValue('🔴 *Device offline*'),
    };

    const module = await Test.createTestingModule({
      providers: [
        PowerStatusListener,
        { provide: TELEGRAM_TOKENS.BOT, useValue: bot },
        {
          provide: SERVICE_TOKENS.GET_DEVICE_NOTIFICATION_RECIPIENTS,
          useValue: mockGetRecipientsService,
        },
        NotificationDispatcher,
        { provide: MessageFormatter, useValue: mockMessageFormatter },
        TranslationService,
      ],
    }).compile();

    listener = module.get(PowerStatusListener);
    return module;
  };

  describe('when bot is not configured', () => {
    beforeEach(async () => {
      await createModule(null);
    });

    it('should return early without errors', async () => {
      const event = makePowerStatusEvent();
      await expect(
        listener.handlePowerStatusChanged(event),
      ).resolves.toBeUndefined();
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

      await listener.handlePowerStatusChanged(makePowerStatusEvent());

      expect(mockBot!.telegram.sendMessage).not.toHaveBeenCalled();
    });

    it('should format and send a power-lost message with check-status button', async () => {
      mockGetRecipientsService.run.mockResolvedValue({
        data: { recipients: [makeRecipient()] },
      });

      await listener.handlePowerStatusChanged(
        makePowerStatusEvent({
          previousStatus: PowerStatus.ON,
          newStatus: PowerStatus.OFF,
        }),
      );

      expect(mockMessageFormatter.formatPowerLost).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceLabel: 'Kitchen',
          locale: 'en',
          timezone: 'Europe/Kyiv',
          durationSeconds: null,
        }),
      );
      expect(mockBot!.telegram.sendMessage).toHaveBeenCalledWith(
        '111111',
        '⚡ *Power lost\\!*',
        expect.objectContaining({
          parse_mode: 'MarkdownV2',
          reply_markup: expect.objectContaining({
            inline_keyboard: [
              [expect.objectContaining({ callback_data: 'check_status' })],
            ],
          }),
        }),
      );
    });

    it('should format and send a power-restored message with view-history button and duration', async () => {
      mockGetRecipientsService.run.mockResolvedValue({
        data: { recipients: [makeRecipient()] },
      });

      await listener.handlePowerStatusChanged(
        makePowerStatusEvent({
          previousStatus: PowerStatus.OFF,
          newStatus: PowerStatus.ON,
          durationSeconds: 300,
        }),
      );

      expect(mockMessageFormatter.formatPowerRestored).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceLabel: 'Kitchen',
          durationSeconds: 300,
        }),
      );
      expect(mockBot!.telegram.sendMessage).toHaveBeenCalledWith(
        '111111',
        '✅ *Power restored\\!*',
        expect.objectContaining({
          parse_mode: 'MarkdownV2',
          reply_markup: expect.objectContaining({
            inline_keyboard: [
              [expect.objectContaining({ callback_data: 'view_history' })],
            ],
          }),
        }),
      );
    });

    it('should format and send a device-online message without duration when there is no previous status', async () => {
      mockGetRecipientsService.run.mockResolvedValue({
        data: { recipients: [makeRecipient()] },
      });

      await listener.handlePowerStatusChanged(
        makePowerStatusEvent({
          previousStatus: null,
          newStatus: PowerStatus.ON,
        }),
      );

      expect(mockMessageFormatter.formatDeviceOnline).toHaveBeenCalledWith(
        'Kitchen',
        'en',
      );
      expect(mockMessageFormatter.formatPowerLost).not.toHaveBeenCalled();
      expect(mockMessageFormatter.formatPowerRestored).not.toHaveBeenCalled();
      expect(mockBot!.telegram.sendMessage).toHaveBeenCalledWith(
        '111111',
        '🟢 *Device online*',
        expect.objectContaining({ parse_mode: 'MarkdownV2' }),
      );
      // no inline keyboard for the first-report case
      expect(mockBot!.telegram.sendMessage).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ reply_markup: expect.anything() }),
      );
    });

    it('should format and send a device-offline message when there is no previous status', async () => {
      mockGetRecipientsService.run.mockResolvedValue({
        data: { recipients: [makeRecipient()] },
      });

      await listener.handlePowerStatusChanged(
        makePowerStatusEvent({
          previousStatus: null,
          newStatus: PowerStatus.OFF,
        }),
      );

      expect(mockMessageFormatter.formatDeviceOffline).toHaveBeenCalledWith(
        'Kitchen',
        'en',
      );
      expect(mockBot!.telegram.sendMessage).toHaveBeenCalledWith(
        '111111',
        '🔴 *Device offline*',
        expect.objectContaining({ parse_mode: 'MarkdownV2' }),
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

      await listener.handlePowerStatusChanged(makePowerStatusEvent());

      expect(mockMessageFormatter.formatPowerLost).toHaveBeenCalledTimes(2);
      expect(mockMessageFormatter.formatPowerLost).toHaveBeenCalledWith(
        expect.objectContaining({ locale: 'en', timezone: 'America/New_York' }),
      );
      expect(mockMessageFormatter.formatPowerLost).toHaveBeenCalledWith(
        expect.objectContaining({ locale: 'uk', timezone: 'Europe/Kyiv' }),
      );
      expect(mockBot!.telegram.sendMessage).toHaveBeenCalledTimes(2);
    });
  });
});
