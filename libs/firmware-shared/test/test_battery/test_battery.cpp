#include <unity.h>
#include "HomePulse/BatteryUtils.h"

void test_battery_percent_full(void) {
  TEST_ASSERT_EQUAL(100, HomePulse::calculateBatteryPercent(4200));
}

void test_battery_percent_empty(void) {
  TEST_ASSERT_EQUAL(0, HomePulse::calculateBatteryPercent(3000));
}

void test_battery_percent_below_empty_clamps_to_zero(void) {
  TEST_ASSERT_EQUAL(0, HomePulse::calculateBatteryPercent(2500));
}

void test_battery_percent_above_full_clamps_to_100(void) {
  TEST_ASSERT_EQUAL(100, HomePulse::calculateBatteryPercent(4500));
}

void test_battery_percent_at_low_threshold(void) {
  // 3400mV: (3400 - 3000) * 100 / (4200 - 3000) = 400 * 100 / 1200 = 33
  int pct = HomePulse::calculateBatteryPercent(3400);
  TEST_ASSERT_EQUAL(33, pct);
}

void test_battery_percent_midpoint(void) {
  // 3600mV: (3600 - 3000) * 100 / 1200 = 50
  int pct = HomePulse::calculateBatteryPercent(3600);
  TEST_ASSERT_EQUAL(50, pct);
}

void test_battery_mv_calculation_default_divider(void) {
  // Default divider: x2 (num=2, den=1)
  // 1650 mV input → 3300 mV output
  uint16_t result = HomePulse::calculateBatteryMv(1650);
  TEST_ASSERT_EQUAL(3300, result);
}

void test_battery_mv_calculation_calibrated_divider(void) {
  // C6 calibrated divider: 1993/1000
  // 1800 * 1993 / 1000 = 3587 mV
  uint16_t result = HomePulse::calculateBatteryMv(1800, 1993, 1000);
  TEST_ASSERT_EQUAL(3587, result);
}

void setUp(void) {}
void tearDown(void) {}

int main(void) {
  UNITY_BEGIN();
  RUN_TEST(test_battery_percent_full);
  RUN_TEST(test_battery_percent_empty);
  RUN_TEST(test_battery_percent_below_empty_clamps_to_zero);
  RUN_TEST(test_battery_percent_above_full_clamps_to_100);
  RUN_TEST(test_battery_percent_at_low_threshold);
  RUN_TEST(test_battery_percent_midpoint);
  RUN_TEST(test_battery_mv_calculation_default_divider);
  RUN_TEST(test_battery_mv_calculation_calibrated_divider);
  return UNITY_END();
}
