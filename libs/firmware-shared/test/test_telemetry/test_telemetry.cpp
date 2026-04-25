#include <unity.h>
#include "HomePulse/telemetry.h"
#include <cstring>

// Override FIRMWARE_VERSION for deterministic test output
#ifndef FIRMWARE_VERSION
#define FIRMWARE_VERSION "3.5.0"
#endif

using namespace HomePulse;

// Helper: build a minimal report
static PowerStatusReport makeReport(uint8_t status, bool hasUps) {
  PowerStatusReport r;
  r.mac           = "AA:BB:CC:DD:EE:FF";
  r.status        = status;
  r.adcValue      = 1500;
  r.batteryAdcRaw = hasUps ? 2048 : -1;
  r.hasUps        = hasUps;
  r.timestamp     = 1700000000UL;  // fixed epoch for determinism
  return r;
}

void test_signature_input_format(void) {
  // Format: "MAC:TIMESTAMP:STATUS" — must match exactly what server validates
  PowerStatusReport r = makeReport(1, false);
  String sig = buildSignatureInput(r);
  TEST_ASSERT_EQUAL_STRING("AA:BB:CC:DD:EE:FF:1700000000:1", sig.c_str());
}

void test_signature_input_status_off(void) {
  PowerStatusReport r = makeReport(0, false);
  String sig = buildSignatureInput(r);
  TEST_ASSERT_EQUAL_STRING("AA:BB:CC:DD:EE:FF:1700000000:0", sig.c_str());
}

void test_payload_no_ups_has_no_battery_field(void) {
  PowerStatusReport r = makeReport(1, false);
  String p = buildPowerStatusPayload(r);
  TEST_ASSERT_NULL(strstr(p.c_str(), "batteryVoltage"));
  TEST_ASSERT_NOT_NULL(strstr(p.c_str(), "\"status\":1"));
  TEST_ASSERT_NOT_NULL(strstr(p.c_str(), "\"voltage\":1500"));
  TEST_ASSERT_NOT_NULL(strstr(p.c_str(), "firmwareVersion"));
}

void test_payload_with_ups_has_battery_field(void) {
  PowerStatusReport r = makeReport(0, true);
  String p = buildPowerStatusPayload(r);
  TEST_ASSERT_NOT_NULL(strstr(p.c_str(), "batteryVoltage"));
  TEST_ASSERT_NOT_NULL(strstr(p.c_str(), "\"status\":0"));
}

void test_payload_status_off(void) {
  PowerStatusReport r = makeReport(0, false);
  String p = buildPowerStatusPayload(r);
  TEST_ASSERT_NOT_NULL(strstr(p.c_str(), "\"status\":0"));
}

void test_payload_is_valid_json_start_end(void) {
  PowerStatusReport r = makeReport(1, false);
  String p = buildPowerStatusPayload(r);
  TEST_ASSERT_EQUAL('{', p[0]);
  TEST_ASSERT_EQUAL('}', p[p.length() - 1]);
}

void test_payload_ups_contains_correct_battery_value(void) {
  PowerStatusReport r = makeReport(1, true);
  r.batteryAdcRaw = 3750;
  String p = buildPowerStatusPayload(r);
  TEST_ASSERT_NOT_NULL(strstr(p.c_str(), "\"batteryVoltage\":3750"));
}

void setUp(void) {}
void tearDown(void) {}

int main(void) {
  UNITY_BEGIN();
  RUN_TEST(test_signature_input_format);
  RUN_TEST(test_signature_input_status_off);
  RUN_TEST(test_payload_no_ups_has_no_battery_field);
  RUN_TEST(test_payload_with_ups_has_battery_field);
  RUN_TEST(test_payload_status_off);
  RUN_TEST(test_payload_is_valid_json_start_end);
  RUN_TEST(test_payload_ups_contains_correct_battery_value);
  return UNITY_END();
}
