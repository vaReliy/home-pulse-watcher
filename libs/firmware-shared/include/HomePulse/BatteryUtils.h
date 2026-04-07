#ifndef HOMEPULSE_BATTERY_UTILS_H
#define HOMEPULSE_BATTERY_UTILS_H

#include <stdint.h>

namespace HomePulse {

// Default divider ratio: simple x2 (symmetric divider, e.g. C3 100k/100k)
static const int kDefaultDividerNum = 2;
static const int kDefaultDividerDen = 1;

// Battery voltage thresholds in millivolts (match config.h)
static const uint16_t kBatteryFullMv  = 4200;
static const uint16_t kBatteryLowMv   = 3400;
static const uint16_t kBatteryEmptyMv = 3000;

/**
 * Apply voltage divider correction to a raw ADC millivolt reading.
 *
 * C6 (10k/10k calibrated): call with (mvAvg, BATTERY_DIVIDER_RATIO_NUM, BATTERY_DIVIDER_RATIO_DEN)
 * C3 (100k/100k symmetric): call with (mvAvg) — uses default x2 ratio
 *
 * @param adcMillivolts  Averaged reading from analogReadMilliVolts()
 * @param dividerNum     Numerator of the divider ratio   (C6: 1993, default: 2)
 * @param dividerDen     Denominator of the divider ratio  (C6: 1000, default: 1)
 * @return Estimated battery voltage in millivolts
 */
inline uint16_t calculateBatteryMv(int adcMillivolts,
                                   int dividerNum = kDefaultDividerNum,
                                   int dividerDen = kDefaultDividerDen) {
    return (uint16_t)((long)adcMillivolts * dividerNum / dividerDen);
}

/**
 * Convert battery voltage to a percentage (0–100), clamped.
 * Uses a linear mapping from EMPTY (0%) to FULL (100%).
 *
 * @param batteryMv  Battery voltage in millivolts
 * @return Battery percentage 0–100
 */
inline uint8_t calculateBatteryPercent(uint16_t batteryMv) {
    if (batteryMv >= kBatteryFullMv)  return 100;
    if (batteryMv <= kBatteryEmptyMv) return 0;
    return (uint8_t)((uint32_t)(batteryMv - kBatteryEmptyMv) * 100
                     / (kBatteryFullMv - kBatteryEmptyMv));
}

}  // namespace HomePulse

#endif  // HOMEPULSE_BATTERY_UTILS_H
