#include <unity.h>
#include "HomePulse/PowerUtils.h"

using namespace HomePulse;

void test_above_high_threshold_returns_on(void) {
  TEST_ASSERT_EQUAL(kPowerStatusOn, computePowerStatus(2200, kPowerStatusUnknown));
  TEST_ASSERT_EQUAL(kPowerStatusOn, computePowerStatus(3000, kPowerStatusUnknown));
  TEST_ASSERT_EQUAL(kPowerStatusOn, computePowerStatus(4095, kPowerStatusOn));
}

void test_below_low_threshold_returns_off(void) {
  TEST_ASSERT_EQUAL(kPowerStatusOff, computePowerStatus(1000, kPowerStatusUnknown));
  TEST_ASSERT_EQUAL(kPowerStatusOff, computePowerStatus(0,    kPowerStatusUnknown));
  TEST_ASSERT_EQUAL(kPowerStatusOff, computePowerStatus(500,  kPowerStatusOn));
}

void test_hysteresis_band_was_on_stays_on(void) {
  // In-band (1001–2199), last status = ON → retain ON
  TEST_ASSERT_EQUAL(kPowerStatusOn, computePowerStatus(1500, kPowerStatusOn));
  TEST_ASSERT_EQUAL(kPowerStatusOn, computePowerStatus(2199, kPowerStatusOn));
  TEST_ASSERT_EQUAL(kPowerStatusOn, computePowerStatus(1001, kPowerStatusOn));
}

void test_hysteresis_band_was_off_stays_off(void) {
  // In-band, last status = OFF → retain OFF
  TEST_ASSERT_EQUAL(kPowerStatusOff, computePowerStatus(1500, kPowerStatusOff));
  TEST_ASSERT_EQUAL(kPowerStatusOff, computePowerStatus(2000, kPowerStatusOff));
}

void test_hysteresis_band_was_unknown_returns_off(void) {
  // In-band, last status = UNKNOWN (-1) → default to OFF
  TEST_ASSERT_EQUAL(kPowerStatusOff, computePowerStatus(1500, kPowerStatusUnknown));
}

void test_custom_thresholds(void) {
  // High=3000, Low=500
  TEST_ASSERT_EQUAL(kPowerStatusOn,  computePowerStatus(3000, kPowerStatusOff,  3000, 500));
  TEST_ASSERT_EQUAL(kPowerStatusOff, computePowerStatus(500,  kPowerStatusOn,   3000, 500));
  // In-band 501–2999, was ON → stays ON
  TEST_ASSERT_EQUAL(kPowerStatusOn,  computePowerStatus(1500, kPowerStatusOn,   3000, 500));
}

void setUp(void) {}
void tearDown(void) {}

int main(void) {
  UNITY_BEGIN();
  RUN_TEST(test_above_high_threshold_returns_on);
  RUN_TEST(test_below_low_threshold_returns_off);
  RUN_TEST(test_hysteresis_band_was_on_stays_on);
  RUN_TEST(test_hysteresis_band_was_off_stays_off);
  RUN_TEST(test_hysteresis_band_was_unknown_returns_off);
  RUN_TEST(test_custom_thresholds);
  return UNITY_END();
}
