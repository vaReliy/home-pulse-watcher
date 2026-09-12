import type { ListDevicesService } from '@home-pulse-watcher/application';
import {
  Device,
  DeviceType,
  ReleaseChannel,
  BoardType,
} from '@home-pulse-watcher/core';
import { NotFoundError } from '@home-pulse-watcher/shared';
import { ListDevicesCommand } from './list-devices.command.js';

function makeDevice(
  overrides: Partial<ConstructorParameters<typeof Device>[0]> = {},
): Device {
  return new Device({
    id: 'device-uuid-1',
    macAddress: 'AA:BB:CC:DD:EE:FF',
    encryptedSecret: 'secret',
    label: 'Living Room',
    lastStatus: 1,
    lastSeenAt: new Date(),
    statusChangedAt: new Date(),
    firmwareVersion: '1.2.3',
    batteryVoltage: null,
    releaseChannel: ReleaseChannel.STABLE,
    deviceType: DeviceType.MAINS,
    boardType: BoardType.ESP32_C6,
    ...overrides,
  });
}

function makeMockService(
  devices: Device[] = [],
): jest.Mocked<ListDevicesService> {
  return {
    run: jest
      .fn()
      .mockResolvedValue({ data: { devices, total: devices.length } }),
  } as unknown as jest.Mocked<ListDevicesService>;
}

describe('ListDevicesCommand', () => {
  let exitSpy: jest.SpyInstance;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('prints releaseChannel and firmwareVersion columns and values', async () => {
    const device = makeDevice({
      firmwareVersion: '1.2.3',
      releaseChannel: ReleaseChannel.BETA,
    });
    const service = makeMockService([device]);
    const command = new ListDevicesCommand(service);

    await command.run([], { userId: 'user-uuid' });

    const output = consoleSpy.mock.calls.map((call) => call[0]).join('\n');
    expect(output).toContain('Channel');
    expect(output).toContain('Firmware');
    expect(output).toContain('BETA');
    expect(output).toContain('1.2.3');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('prints "-" for a null firmwareVersion', async () => {
    const device = makeDevice({ firmwareVersion: null });
    const service = makeMockService([device]);
    const command = new ListDevicesCommand(service);

    await command.run([], { userId: 'user-uuid' });

    const rowLine = consoleSpy.mock.calls
      .map((call) => String(call[0]))
      .find((line) => line.includes(device.id));
    expect(rowLine).toBeDefined();
    expect(rowLine).toMatch(/STABLE\s*-\s*$/);
  });

  it('exits with code 1 when neither --user-id nor --telegram-id is given', async () => {
    const service = makeMockService([]);
    const command = new ListDevicesCommand(service);

    await command.run([], {});

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exits with code 1 when the service throws', async () => {
    const service = makeMockService([]);
    service.run.mockRejectedValue(new NotFoundError('User', 'user-uuid'));
    const command = new ListDevicesCommand(service);

    await command.run([], { userId: 'user-uuid' });

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('prints "No devices found." when list is empty', async () => {
    const service = makeMockService([]);
    const command = new ListDevicesCommand(service);

    await command.run([], { userId: 'user-uuid' });

    expect(consoleSpy).toHaveBeenCalledWith('No devices found.\n');
  });

  it('prints a row per device with correct channel/firmware for each, for multiple devices', async () => {
    const deviceA = makeDevice({
      id: 'device-uuid-a',
      firmwareVersion: '1.0.0',
      releaseChannel: ReleaseChannel.STABLE,
    });
    const deviceB = makeDevice({
      id: 'device-uuid-b',
      firmwareVersion: null,
      releaseChannel: ReleaseChannel.BETA,
    });
    const service = makeMockService([deviceA, deviceB]);
    const command = new ListDevicesCommand(service);

    await command.run([], { userId: 'user-uuid' });

    const lines = consoleSpy.mock.calls.map((call) => String(call[0]));
    const rowA = lines.find((line) => line.includes(deviceA.id));
    const rowB = lines.find((line) => line.includes(deviceB.id));
    expect(rowA).toMatch(/STABLE\s*1\.0\.0\s*$/);
    expect(rowB).toMatch(/BETA\s*-\s*$/);
    expect(lines.some((line) => line.includes('Total: 2 device(s)'))).toBe(
      true,
    );
  });

  it('labels the output by telegramId when --telegram-id is used instead of --user-id', async () => {
    const service = makeMockService([]);
    const command = new ListDevicesCommand(service);

    await command.run([], { telegramId: '123456789' });

    expect(consoleSpy).toHaveBeenCalledWith(
      '\nDevices for user telegramId=123456789:\n',
    );
    expect(service.run).toHaveBeenCalledWith({
      userId: undefined,
      telegramId: '123456789',
    });
  });
});
