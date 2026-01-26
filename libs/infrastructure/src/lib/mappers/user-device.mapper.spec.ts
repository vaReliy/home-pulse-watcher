import { mapPrismaUserDeviceToEntity } from './user-device.mapper.js';
import { UserDevice, DeviceRole } from '@home-pulse-watcher/core';

describe('mapPrismaUserDeviceToEntity', () => {
  it('should map Prisma UserDevice to Domain UserDevice', () => {
    const prismaUserDevice = {
      userId: 'user-1',
      deviceId: 'device-1',
      customName: 'My Kitchen',
      role: 'OWNER',
    };

    const result = mapPrismaUserDeviceToEntity(prismaUserDevice);

    expect(result).toBeInstanceOf(UserDevice);
    expect(result.userId).toBe('user-1');
    expect(result.deviceId).toBe('device-1');
    expect(result.customName).toBe('My Kitchen');
    expect(result.role).toBe(DeviceRole.OWNER);
  });

  it('should handle null customName', () => {
    const prismaUserDevice = {
      userId: 'user-1',
      deviceId: 'device-1',
      customName: null,
      role: 'VIEWER',
    };

    const result = mapPrismaUserDeviceToEntity(prismaUserDevice);

    expect(result.customName).toBeNull();
    expect(result.role).toBe(DeviceRole.VIEWER);
  });

  it('should map all role values correctly', () => {
    const roles = ['OWNER', 'EDITOR', 'VIEWER'] as const;
    const expected = [DeviceRole.OWNER, DeviceRole.EDITOR, DeviceRole.VIEWER];

    roles.forEach((role, index) => {
      const result = mapPrismaUserDeviceToEntity({
        userId: 'user-1',
        deviceId: 'device-1',
        customName: null,
        role,
      });
      expect(result.role).toBe(expected[index]);
    });
  });
});
