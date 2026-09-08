#include <unity.h>
#include "HomePulse/telemetry.h"
#include <cstring>

using namespace HomePulse;

// Fixed version for deterministic payload assertions. Supplied as report data,
// not a macro: the shared library never sees a board's config.h, which is why
// reading FIRMWARE_VERSION here used to compile to a stub and ship a bogus
// version to the backend for months.
static const char* const kTestVersion = "3.5.0";

// Helper: build a minimal report
static PowerStatusReport makeReport(uint8_t status, bool hasUps) {
  PowerStatusReport r;
  r.mac             = "AA:BB:CC:DD:EE:FF";
  r.status          = status;
  r.adcValue        = 1500;
  r.batteryAdcRaw   = hasUps ? 2048 : -1;
  r.hasUps          = hasUps;
  r.timestamp       = 1700000000UL;  // fixed epoch for determinism
  r.firmwareVersion = kTestVersion;
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

// Asserting the *key* alone is what let a stubbed version ship unnoticed —
// these pin the emitted value.

void test_payload_carries_reported_version_no_ups(void) {
  PowerStatusReport r = makeReport(1, false);
  String p = buildPowerStatusPayload(r);
  TEST_ASSERT_NOT_NULL(strstr(p.c_str(), "\"firmwareVersion\":\"3.5.0\""));
}

void test_payload_carries_reported_version_with_ups(void) {
  PowerStatusReport r = makeReport(1, true);
  String p = buildPowerStatusPayload(r);
  TEST_ASSERT_NOT_NULL(strstr(p.c_str(), "\"firmwareVersion\":\"3.5.0\""));
}

void test_payload_carries_prerelease_version_verbatim(void) {
  PowerStatusReport r = makeReport(1, false);
  r.firmwareVersion = "3.5.4-alpha.1";
  String p = buildPowerStatusPayload(r);
  TEST_ASSERT_NOT_NULL(strstr(p.c_str(), "\"firmwareVersion\":\"3.5.4-alpha.1\""));
}

// A missing version must emit valid semver, not a placeholder the backend's
// semver rule would silently drop — an unknown version has to stay visible.
void test_payload_null_version_falls_back_to_valid_semver_sentinel(void) {
  PowerStatusReport r = makeReport(1, false);
  r.firmwareVersion = nullptr;
  String p = buildPowerStatusPayload(r);
  TEST_ASSERT_NOT_NULL(strstr(p.c_str(), "\"firmwareVersion\":\"0.0.0-test\""));
}

void test_payload_empty_version_falls_back_to_valid_semver_sentinel(void) {
  PowerStatusReport r = makeReport(1, false);
  r.firmwareVersion = "";
  String p = buildPowerStatusPayload(r);
  TEST_ASSERT_NOT_NULL(strstr(p.c_str(), "\"firmwareVersion\":\"0.0.0-test\""));
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
  RUN_TEST(test_payload_carries_reported_version_no_ups);
  RUN_TEST(test_payload_carries_reported_version_with_ups);
  RUN_TEST(test_payload_carries_prerelease_version_verbatim);
  RUN_TEST(test_payload_null_version_falls_back_to_valid_semver_sentinel);
  RUN_TEST(test_payload_empty_version_falls_back_to_valid_semver_sentinel);
  return UNITY_END();
}
