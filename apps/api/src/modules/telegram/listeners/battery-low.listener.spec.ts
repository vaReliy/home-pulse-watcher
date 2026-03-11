import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { BatteryLowListener } from './battery-low.listener.js';
import { BatteryLowEvent } from '@home-pulse-watcher/application';
import { User, UserDevice, DeviceRole } from '@home-pulse-watcher/core';
import type {
  IUserRepository,
  IUserDeviceRepository,
} from '@home-pulse-watcher/core';
import { REPOSITORY_TOKENS } from '../../repositories/repository.tokens.js';
import { TELEGRAM_TOKENS } from '../telegram.tokens.js';
import { MessageFormatter } from '../formatters/message.formatter.js';

function makeUser(
  overrides: Partial<ConstructorParameters<typeof User>[0]> = {},
): User {
  return new User({
    id: 'user-1',
    telegramId: BigInt(111111),
    username: 'testuser',
    locale: 'en',
    timezone: 'Europe/Kyiv',
    createdAt: new Date(),
    ...overrides,
  });
}

function makeUserDevice(
  overrides: Partial<ConstructorParameters<typeof UserDevice>[0]> = {},
): UserDevice {
  return new UserDevice({
    userId: 'user-1',
    deviceId: 'device-1',
    customName: null,
    role: DeviceRole.VIEWER,
    ...overrides,
  });
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
  let mockUserRepository: jest.Mocked<IUserRepository>;
  let mockUserDeviceRepository: jest.Mocked<IUserDeviceRepository>;
  let mockMessageFormatter: jest.Mocked<
    Pick<MessageFormatter, 'formatBatteryLowAlert'>
  >;

  const createModule = async (bot: typeof mockBot): Promise<TestingModule> => {
    mockUserRepository = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<IUserRepository>;

    mockUserDeviceRepository = {
      findByDeviceId: jest.fn(),
    } as unknown as jest.Mocked<IUserDeviceRepository>;

    mockMessageFormatter = {
      formatBatteryLowAlert: jest
        .fn()
        .mockReturnValue('🆘 *Low Battery Alert\\!*'),
    };

    const module = await Test.createTestingModule({
      providers: [
        BatteryLowListener,
        { provide: TELEGRAM_TOKENS.BOT, useValue: bot },
        { provide: REPOSITORY_TOKENS.USER, useValue: mockUserRepository },
        {
          provide: REPOSITORY_TOKENS.USER_DEVICE,
          useValue: mockUserDeviceRepository,
        },
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
      expect(mockUserDeviceRepository.findByDeviceId).not.toHaveBeenCalled();
    });
  });

  describe('when bot is configured', () => {
    beforeEach(async () => {
      mockBot = { telegram: { sendMessage: jest.fn().mockResolvedValue({}) } };
      await createModule(mockBot);
    });

    it('should return early when no users are subscribed', async () => {
      mockUserDeviceRepository.findByDeviceId.mockResolvedValue([]);

      await listener.handleBatteryLow(makeBatteryLowEvent());

      expect(mockBot!.telegram.sendMessage).not.toHaveBeenCalled();
    });

    it('should send SOS alert to a single subscribed user', async () => {
      const user = makeUser();
      mockUserDeviceRepository.findByDeviceId.mockResolvedValue([
        makeUserDevice(),
      ]);
      mockUserRepository.findById.mockResolvedValue(user);

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
      const userEn = makeUser({
        id: 'user-1',
        telegramId: BigInt(111111),
        locale: 'en',
        timezone: 'America/New_York',
      });
      const userUk = makeUser({
        id: 'user-2',
        telegramId: BigInt(222222),
        locale: 'uk',
        timezone: 'Europe/Kyiv',
      });

      mockUserDeviceRepository.findByDeviceId.mockResolvedValue([
        makeUserDevice({ userId: 'user-1' }),
        makeUserDevice({ userId: 'user-2' }),
      ]);
      mockUserRepository.findById
        .mockResolvedValueOnce(userEn)
        .mockResolvedValueOnce(userUk);

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

    it('should skip users that cannot be found', async () => {
      mockUserDeviceRepository.findByDeviceId.mockResolvedValue([
        makeUserDevice({ userId: 'user-1' }),
        makeUserDevice({ userId: 'user-deleted' }),
      ]);
      mockUserRepository.findById
        .mockResolvedValueOnce(makeUser())
        .mockResolvedValueOnce(null);

      await listener.handleBatteryLow(makeBatteryLowEvent());

      expect(mockBot!.telegram.sendMessage).toHaveBeenCalledTimes(1);
    });
  });
});
