import { Device } from './device.entity.js';
import { PowerStatus, ReleaseChannel } from '../types/index.js';

describe('Device', () => {
  const createDevice = (
    overrides?: Partial<ConstructorParameters<typeof Device>[0]>,
  ) =>
    new Device({
      id: 'device-1',
      macAddress: 'AA:BB:CC:DD:EE:FF',
      encryptedSecret: 'iv:authtag:ciphertext',
      label: 'Kitchen',
      lastStatus: PowerStatus.ON,
      lastSeenAt: new Date(),
      statusChangedAt: null,
      firmwareVersion: null,
      batteryVoltage: null,
      releaseChannel: ReleaseChannel.STABLE,
      ...overrides,
    });

  describe('constructor', () => {
    it('should create device with all properties', () => {
      const device = createDevice();

      expect(device.id).toBe('device-1');
      expect(device.macAddress).toBe('AA:BB:CC:DD:EE:FF');
      expect(device.encryptedSecret).toBe('iv:authtag:ciphertext');
      expect(device.label).toBe('Kitchen');
      expect(device.lastStatus).toBe(PowerStatus.ON);
      expect(device.lastSeenAt).toBeInstanceOf(Date);
    });

    it('should create device with null optional fields', () => {
      const device = createDevice({
        label: null,
        lastStatus: null,
        lastSeenAt: null,
      });

      expect(device.label).toBeNull();
      expect(device.lastStatus).toBeNull();
      expect(device.lastSeenAt).toBeNull();
    });
  });

  describe('isOnline', () => {
    it('should return true when lastSeenAt is within threshold', () => {
      const device = createDevice({
        lastSeenAt: new Date(Date.now() - 60_000), // 1 minute ago
      });

      expect(device.isOnline(2_100_000)).toBe(true);
    });

    it('should return false when lastSeenAt is beyond threshold', () => {
      const device = createDevice({
        lastSeenAt: new Date(Date.now() - 3_600_000), // 1 hour ago
      });

      expect(device.isOnline(2_100_000)).toBe(false);
    });

    it('should return false when lastSeenAt is null', () => {
      const device = createDevice({ lastSeenAt: null });

      expect(device.isOnline()).toBe(false);
    });

    it('should use default threshold of 35 minutes', () => {
      const device = createDevice({
        lastSeenAt: new Date(Date.now() - 2_099_000), // Just under 35 minutes
      });

      expect(device.isOnline()).toBe(true);
    });
  });

  describe('hasUps', () => {
    it('should return false when batteryVoltage is null', () => {
      const device = createDevice({ batteryVoltage: null });

      expect(device.hasUps).toBe(false);
    });

    it('should return true when batteryVoltage is a number', () => {
      const device = createDevice({ batteryVoltage: 3850 });

      expect(device.hasUps).toBe(true);
    });

    it('should return false when batteryVoltage is 0 (no-reading sentinel)', () => {
      const device = createDevice({ batteryVoltage: 0 });

      expect(device.hasUps).toBe(false);
    });
  });
});
