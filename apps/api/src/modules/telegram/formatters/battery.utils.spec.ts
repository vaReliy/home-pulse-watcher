import { batteryPercentage, formatVoltage } from './battery.utils.js';

describe('batteryPercentage', () => {
  it('should return 0% at or below empty voltage (3000 mV)', () => {
    expect(batteryPercentage(3000)).toBe(0);
    expect(batteryPercentage(2500)).toBe(0);
    expect(batteryPercentage(0)).toBe(0);
  });

  it('should return 100% at or above full voltage (4200 mV)', () => {
    expect(batteryPercentage(4200)).toBe(100);
    expect(batteryPercentage(4500)).toBe(100);
  });

  it('should return 50% at midpoint (3600 mV)', () => {
    expect(batteryPercentage(3600)).toBe(50);
  });

  it('should calculate correctly at low-battery threshold (3400 mV ~33%)', () => {
    expect(batteryPercentage(3400)).toBe(33);
  });

  it('should round percentages to the nearest integer', () => {
    // 3100 mV: (100 / 1200) * 100 = 8.33... -> 8
    expect(batteryPercentage(3100)).toBe(8);
  });

  it('should calculate correctly for near-full battery (~4050 mV → 88%)', () => {
    // Reflects corrected firmware output: GPIO3=1.93V → analogReadMilliVolts≈1930 → 1930×2107/1000=4066 mV
    // (4050 - 3000) / 1200 * 100 = 87.5 -> 88
    expect(batteryPercentage(4050)).toBe(88);
  });

  it('should calculate correctly for typical operating voltage (3800 mV → 67%)', () => {
    // (3800 - 3000) / 1200 * 100 = 66.67 -> 67
    expect(batteryPercentage(3800)).toBe(67);
  });
});

describe('formatVoltage', () => {
  it('should format voltage to 2 decimal places in volts', () => {
    expect(formatVoltage(3850)).toBe('3.85');
    expect(formatVoltage(4200)).toBe('4.20');
    expect(formatVoltage(3000)).toBe('3.00');
    expect(formatVoltage(3400)).toBe('3.40');
  });
});
