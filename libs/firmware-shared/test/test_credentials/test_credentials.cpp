#include <unity.h>
#include "HomePulse/credentials.h"

// credentialsAreUsable() is a pure struct-field check — no NVS calls, host-safe.

void test_all_fields_present_returns_true(void) {
  DeviceCredentials c;
  memset(&c, 0, sizeof(c));
  strncpy(c.wifi_ssid,     "MyNetwork",                         CRED_SSID_MAX - 1);
  strncpy(c.device_secret, "abc123def456abc123def456abc123de",  CRED_SECRET_MAX - 1);
  strncpy(c.backend_url,   "http://192.168.1.1/api",            CRED_URL_MAX - 1);
  TEST_ASSERT_TRUE(credentialsAreUsable(c));
}

void test_empty_ssid_returns_false(void) {
  DeviceCredentials c;
  memset(&c, 0, sizeof(c));
  // ssid intentionally left empty
  strncpy(c.device_secret, "abc123def456abc123def456abc123de",  CRED_SECRET_MAX - 1);
  strncpy(c.backend_url,   "http://192.168.1.1/api",            CRED_URL_MAX - 1);
  TEST_ASSERT_FALSE(credentialsAreUsable(c));
}

void test_empty_secret_returns_false(void) {
  DeviceCredentials c;
  memset(&c, 0, sizeof(c));
  strncpy(c.wifi_ssid,   "MyNetwork",              CRED_SSID_MAX - 1);
  strncpy(c.backend_url, "http://192.168.1.1/api", CRED_URL_MAX - 1);
  // device_secret intentionally left empty
  TEST_ASSERT_FALSE(credentialsAreUsable(c));
}

void test_empty_url_returns_false(void) {
  DeviceCredentials c;
  memset(&c, 0, sizeof(c));
  strncpy(c.wifi_ssid,     "MyNetwork",                         CRED_SSID_MAX - 1);
  strncpy(c.device_secret, "abc123def456abc123def456abc123de",  CRED_SECRET_MAX - 1);
  // backend_url intentionally left empty
  TEST_ASSERT_FALSE(credentialsAreUsable(c));
}

void test_all_fields_empty_returns_false(void) {
  DeviceCredentials c;
  memset(&c, 0, sizeof(c));
  TEST_ASSERT_FALSE(credentialsAreUsable(c));
}

void test_password_empty_still_usable(void) {
  // Open WiFi networks have no password — omitting it must not block provisioning.
  DeviceCredentials c;
  memset(&c, 0, sizeof(c));
  strncpy(c.wifi_ssid,     "OpenNetwork",                       CRED_SSID_MAX - 1);
  strncpy(c.device_secret, "abc123def456abc123def456abc123de",  CRED_SECRET_MAX - 1);
  strncpy(c.backend_url,   "http://192.168.1.1/api",            CRED_URL_MAX - 1);
  // wifi_password is empty
  TEST_ASSERT_TRUE(credentialsAreUsable(c));
}

void setUp(void) {}
void tearDown(void) {}

int main(void) {
  UNITY_BEGIN();
  RUN_TEST(test_all_fields_present_returns_true);
  RUN_TEST(test_empty_ssid_returns_false);
  RUN_TEST(test_empty_secret_returns_false);
  RUN_TEST(test_empty_url_returns_false);
  RUN_TEST(test_all_fields_empty_returns_false);
  RUN_TEST(test_password_empty_still_usable);
  return UNITY_END();
}
