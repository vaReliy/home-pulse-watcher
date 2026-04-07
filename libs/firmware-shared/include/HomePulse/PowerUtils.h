#ifndef HOMEPULSE_POWER_UTILS_H
#define HOMEPULSE_POWER_UTILS_H

namespace HomePulse {

// Default ADC thresholds (match config.h for both C3 and C6)
static const int kDefaultThresholdHigh = 2200;
static const int kDefaultThresholdLow  = 1000;

// Power status constants (match backend protocol)
static const int kPowerStatusOff     =  0;
static const int kPowerStatusOn      =  1;
static const int kPowerStatusUnknown = -1;

/**
 * Convert ADC value to power status with hysteresis.
 *
 * - Above thresholdHigh: power ON
 * - Below thresholdLow:  power OFF
 * - In between (brownout band): retain lastStatus, or OFF if unknown
 *
 * @param adcValue       Averaged 12-bit ADC reading (0-4095)
 * @param lastStatus     Current known power status
 * @param thresholdHigh  ADC value at or above which power is ON  (default: 2200)
 * @param thresholdLow   ADC value at or below which power is OFF (default: 1000)
 * @return Resolved power status: kPowerStatusOn, kPowerStatusOff, or kPowerStatusUnknown
 */
inline int computePowerStatus(int adcValue, int lastStatus,
                              int thresholdHigh = kDefaultThresholdHigh,
                              int thresholdLow  = kDefaultThresholdLow) {
    if (adcValue >= thresholdHigh) return kPowerStatusOn;
    if (adcValue <= thresholdLow)  return kPowerStatusOff;
    // Hysteresis band: retain current state (brownout ignored)
    return (lastStatus >= 0) ? lastStatus : kPowerStatusOff;
}

}  // namespace HomePulse

#endif  // HOMEPULSE_POWER_UTILS_H
