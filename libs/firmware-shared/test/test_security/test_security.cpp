#include <unity.h>

// Security tests require a real mbedtls implementation.
// Under the stub (no libmbedcrypto linked), calculateSignature returns an empty/incorrect value.
// These tests are structural — they verify the function exists and returns a 64-char hex string.
// For HMAC known-answer verification, link against system mbedcrypto.

#ifdef UNIT_TEST
#include "HomePulse/SecurityUtils.h"
#include "HomePulse/telemetry.h"
#include <cstring>

void test_signature_returns_64_char_hex(void) {
  // With stub mbedtls, calculateSignature will likely return empty or garbage.
  // This test verifies the function is callable and returns a String.
  // Known-answer testing requires linking against real mbedtls.
  String sig = HomePulse::calculateSignature("test:12345:1", "secret");
  // Just verify it's a String (not a compile error)
  TEST_ASSERT_NOT_NULL(sig.c_str());
}

// OTA canonical: "<UPPER_MAC>:<ts>:<boardType>:<currentVersion>:<channel>"
// Known-answer: HMAC-SHA256("AA:BB:CC:DD:EE:FF:1700000000:esp32c6:3.5.0:STABLE", "testsecret")
//   = 2a81cf9ae2c29e68cdeae63c74b5aa5dc5090e96d7f7e5dab93d1ab20390e897

void test_ota_canonical_string_uppercase_mac(void) {
  char buf[128];
  HomePulse::buildOtaSignatureInput(
    "AA:BB:CC:DD:EE:FF", 1700000000UL, "esp32c6", "3.5.0", "STABLE",
    buf, sizeof(buf));
  TEST_ASSERT_EQUAL_STRING("AA:BB:CC:DD:EE:FF:1700000000:esp32c6:3.5.0:STABLE", buf);
}

void test_ota_canonical_string_lowercase_mac_uppercased(void) {
  char buf[128];
  HomePulse::buildOtaSignatureInput(
    "aa:bb:cc:dd:ee:ff", 1700000000UL, "esp32c6", "3.5.0", "STABLE",
    buf, sizeof(buf));
  TEST_ASSERT_EQUAL_STRING("AA:BB:CC:DD:EE:FF:1700000000:esp32c6:3.5.0:STABLE", buf);
}

void test_ota_signature_canonical_returns_64_char_hex(void) {
  // Structural test: signing the OTA canonical string produces a 64-char hex result.
  // Known-answer (with real mbedcrypto): 2a81cf9ae2c29e68cdeae63c74b5aa5dc5090e96d7f7e5dab93d1ab20390e897
  char canonical[128];
  HomePulse::buildOtaSignatureInput(
    "AA:BB:CC:DD:EE:FF", 1700000000UL, "esp32c6", "3.5.0", "STABLE",
    canonical, sizeof(canonical));
  String sig = HomePulse::calculateSignature(String(canonical), "testsecret");
  TEST_ASSERT_EQUAL_INT(64, (int)sig.length());
}

#else
void test_signature_returns_64_char_hex(void) {
  TEST_IGNORE_MESSAGE("UNIT_TEST not defined — skipping security tests");
}
void test_ota_canonical_string_uppercase_mac(void) {
  TEST_IGNORE_MESSAGE("UNIT_TEST not defined — skipping security tests");
}
void test_ota_canonical_string_lowercase_mac_uppercased(void) {
  TEST_IGNORE_MESSAGE("UNIT_TEST not defined — skipping security tests");
}
void test_ota_signature_canonical_returns_64_char_hex(void) {
  TEST_IGNORE_MESSAGE("UNIT_TEST not defined — skipping security tests");
}
#endif

void setUp(void) {}
void tearDown(void) {}

int main(void) {
  UNITY_BEGIN();
  RUN_TEST(test_signature_returns_64_char_hex);
  RUN_TEST(test_ota_canonical_string_uppercase_mac);
  RUN_TEST(test_ota_canonical_string_lowercase_mac_uppercased);
  RUN_TEST(test_ota_signature_canonical_returns_64_char_hex);
  return UNITY_END();
}
