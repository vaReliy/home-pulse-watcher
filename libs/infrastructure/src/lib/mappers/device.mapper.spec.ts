import { mapPrismaDeviceToEntity } from './device.mapper.js';
import { Device, PowerStatus } from '@home-pulse-watcher/core';

describe('mapPrismaDeviceToEntity', () => {
  it('should map Prisma Device to Domain Device', () => {
    const statusChangedAt = new Date('2024-01-02');
    const prismaDevice = {
      id: 'device-1',
      macAddress: 'AA:BB:CC:DD:EE:FF',
      encryptedSecret: 'iv:authtag:ciphertext',
      label: 'Kitchen',
      lastStatus: 1,
      lastSeenAt: new Date('2024-01-01'),
      statusChangedAt,
      firmwareVersion: '3.1.0',
    };

    const result = mapPrismaDeviceToEntity(prismaDevice);

    expect(result).toBeInstanceOf(Device);
    expect(result.id).toBe('device-1');
    expect(result.macAddress).toBe('AA:BB:CC:DD:EE:FF');
    expect(result.encryptedSecret).toBe('iv:authtag:ciphertext');
    expect(result.label).toBe('Kitchen');
    expect(result.lastStatus).toBe(PowerStatus.ON);
    expect(result.lastSeenAt).toEqual(new Date('2024-01-01'));
    expect(result.statusChangedAt).toEqual(statusChangedAt);
    expect(result.firmwareVersion).toBe('3.1.0');
  });

  it('should handle null optional fields', () => {
    const prismaDevice = {
      id: 'device-1',
      macAddress: 'AA:BB:CC:DD:EE:FF',
      encryptedSecret: 'iv:authtag:ciphertext',
      label: null,
      lastStatus: null,
      lastSeenAt: null,
      statusChangedAt: null,
      firmwareVersion: null,
    };

    const result = mapPrismaDeviceToEntity(prismaDevice);

    expect(result.label).toBeNull();
    expect(result.lastStatus).toBeNull();
    expect(result.lastSeenAt).toBeNull();
    expect(result.statusChangedAt).toBeNull();
    expect(result.firmwareVersion).toBeNull();
  });

  it('should map lastStatus 0 to PowerStatus.OFF', () => {
    const prismaDevice = {
      id: 'device-1',
      macAddress: 'AA:BB:CC:DD:EE:FF',
      encryptedSecret: 'iv:authtag:ciphertext',
      label: null,
      lastStatus: 0,
      lastSeenAt: null,
      statusChangedAt: null,
      firmwareVersion: null,
    };

    const result = mapPrismaDeviceToEntity(prismaDevice);

    expect(result.lastStatus).toBe(PowerStatus.OFF);
  });
});
