/** Minimum battery voltage in millivolts (0% charge — fully depleted Li-ion). */
const BATTERY_VOLTAGE_EMPTY_MV = 3000;

/** Maximum battery voltage in millivolts (100% charge — fully charged Li-ion). */
const BATTERY_VOLTAGE_FULL_MV = 4200;

/**
 * Calculate battery percentage from voltage using linear mapping (3000–4200 mV → 0–100%).
 * Clamps to [0, 100] range.
 */
export function batteryPercentage(millivolts: number): number {
  const range = BATTERY_VOLTAGE_FULL_MV - BATTERY_VOLTAGE_EMPTY_MV;
  const pct = ((millivolts - BATTERY_VOLTAGE_EMPTY_MV) / range) * 100;
  return Math.round(Math.max(0, Math.min(100, pct)));
}

/**
 * Format battery voltage for display (e.g. 3850 → "3.85").
 */
export function formatVoltage(millivolts: number): string {
  return (millivolts / 1000).toFixed(2);
}
