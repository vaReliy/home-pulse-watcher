import 'reflect-metadata';
import type { RegisterDeviceService } from '@home-pulse-watcher/application';
import { BoardType, DeviceType } from '@home-pulse-watcher/core';
import { RegisterDeviceCommand } from './register-device.command.js';

const OPTION_META_KEY = 'CommandBuilder:Option:Meta';

function makeMockService(): jest.Mocked<RegisterDeviceService> {
  return {
    run: jest.fn().mockResolvedValue({
      data: {
        device: {
          id: 'device-1',
          macAddress: 'AA:BB:CC:DD:EE:FF',
          label: null,
        },
        secret: 'plain-secret',
      },
    }),
  } as unknown as jest.Mocked<RegisterDeviceService>;
}

describe('RegisterDeviceCommand', () => {
  let exitSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env['DEVICE_SECRET_ENCRYPTION_KEY'] = 'a'.repeat(64);
    exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env['DEVICE_SECRET_ENCRYPTION_KEY'];
  });

  describe('run', () => {
    it('passes boardType through to the service', async () => {
      const service = makeMockService();
      const command = new RegisterDeviceCommand(service);

      await command.run([], {
        mac: 'AA:BB:CC:DD:EE:FF',
        boardType: BoardType.ESP32_C3,
      });

      expect(service.run).toHaveBeenCalledWith(
        expect.objectContaining({ boardType: BoardType.ESP32_C3 }),
        expect.anything(),
      );
      expect(exitSpy).not.toHaveBeenCalled();
    });
  });

  describe('parseBoardType', () => {
    it('does not uppercase the value (boardType values are lowercase)', () => {
      const service = makeMockService();
      const command = new RegisterDeviceCommand(service);

      expect(command.parseBoardType('esp32c3')).toBe('esp32c3');
      expect(command.parseBoardType('esp32c6')).toBe('esp32c6');
    });
  });

  describe('parseDeviceType', () => {
    it('still uppercases deviceType (unrelated, unaffected field)', () => {
      const service = makeMockService();
      const command = new RegisterDeviceCommand(service);

      expect(command.parseDeviceType('ups')).toBe(DeviceType.UPS);
    });
  });

  describe('--board-type option metadata', () => {
    it('is marked required', () => {
      const service = makeMockService();
      const command = new RegisterDeviceCommand(service);

      const meta = Reflect.getMetadata(
        OPTION_META_KEY,
        command.parseBoardType,
      ) as { required?: boolean; flags?: string } | undefined;

      expect(meta?.required).toBe(true);
      expect(meta?.flags).toContain('--board-type');
    });
  });
});
