import { UserDevice } from './user-device.entity.js';
import { DeviceRole } from '../types/device-role.enum.js';

describe('UserDevice', () => {
  const createUserDevice = (
    overrides?: Partial<ConstructorParameters<typeof UserDevice>[0]>
  ) =>
    new UserDevice({
      userId: 'user-1',
      deviceId: 'device-1',
      customName: 'My Kitchen Sensor',
      role: DeviceRole.VIEWER,
      ...overrides,
    });

  describe('constructor', () => {
    it('should create user-device with all properties', () => {
      const userDevice = createUserDevice();

      expect(userDevice.userId).toBe('user-1');
      expect(userDevice.deviceId).toBe('device-1');
      expect(userDevice.customName).toBe('My Kitchen Sensor');
      expect(userDevice.role).toBe(DeviceRole.VIEWER);
    });

    it('should create user-device with null customName', () => {
      const userDevice = createUserDevice({ customName: null });

      expect(userDevice.customName).toBeNull();
    });
  });

  describe('hasAtLeastRole', () => {
    it('should return true when role matches exactly', () => {
      const viewer = createUserDevice({ role: DeviceRole.VIEWER });
      const editor = createUserDevice({ role: DeviceRole.EDITOR });
      const owner = createUserDevice({ role: DeviceRole.OWNER });

      expect(viewer.hasAtLeastRole(DeviceRole.VIEWER)).toBe(true);
      expect(editor.hasAtLeastRole(DeviceRole.EDITOR)).toBe(true);
      expect(owner.hasAtLeastRole(DeviceRole.OWNER)).toBe(true);
    });

    it('should return true when role is higher than required', () => {
      const editor = createUserDevice({ role: DeviceRole.EDITOR });
      const owner = createUserDevice({ role: DeviceRole.OWNER });

      expect(editor.hasAtLeastRole(DeviceRole.VIEWER)).toBe(true);
      expect(owner.hasAtLeastRole(DeviceRole.VIEWER)).toBe(true);
      expect(owner.hasAtLeastRole(DeviceRole.EDITOR)).toBe(true);
    });

    it('should return false when role is lower than required', () => {
      const viewer = createUserDevice({ role: DeviceRole.VIEWER });
      const editor = createUserDevice({ role: DeviceRole.EDITOR });

      expect(viewer.hasAtLeastRole(DeviceRole.EDITOR)).toBe(false);
      expect(viewer.hasAtLeastRole(DeviceRole.OWNER)).toBe(false);
      expect(editor.hasAtLeastRole(DeviceRole.OWNER)).toBe(false);
    });
  });
});
