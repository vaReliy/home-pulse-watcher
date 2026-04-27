#include <unity.h>
#include "HomePulse/credentials.h"

// ─── credentialsAreUsable ────────────────────────────────────────────────────

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
  strncpy(c.device_secret, "abc123def456abc123def456abc123de",  CRED_SECRET_MAX - 1);
  strncpy(c.backend_url,   "http://192.168.1.1/api",            CRED_URL_MAX - 1);
  TEST_ASSERT_FALSE(credentialsAreUsable(c));
}

void test_empty_secret_returns_false(void) {
  DeviceCredentials c;
  memset(&c, 0, sizeof(c));
  strncpy(c.wifi_ssid,   "MyNetwork",              CRED_SSID_MAX - 1);
  strncpy(c.backend_url, "http://192.168.1.1/api", CRED_URL_MAX - 1);
  TEST_ASSERT_FALSE(credentialsAreUsable(c));
}

void test_empty_url_returns_false(void) {
  DeviceCredentials c;
  memset(&c, 0, sizeof(c));
  strncpy(c.wifi_ssid,     "MyNetwork",                         CRED_SSID_MAX - 1);
  strncpy(c.device_secret, "abc123def456abc123def456abc123de",  CRED_SECRET_MAX - 1);
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
  TEST_ASSERT_TRUE(credentialsAreUsable(c));
}

// ─── mergeSubmittedCredentials ───────────────────────────────────────────────

void test_merge_keeps_existing_secret_when_blank(void) {
  DeviceCredentials existing, submitted;
  memset(&existing, 0, sizeof(existing));
  memset(&submitted, 0, sizeof(submitted));

  strncpy(existing.device_secret, "secret-s1",            CRED_SECRET_MAX - 1);
  strncpy(existing.backend_url,   "http://old.host/api",  CRED_URL_MAX - 1);
  strncpy(submitted.wifi_ssid,    "NewNetwork",           CRED_SSID_MAX - 1);
  strncpy(submitted.backend_url,  "http://old.host/api",  CRED_URL_MAX - 1);
  // submitted.device_secret intentionally empty

  DeviceCredentials result = mergeSubmittedCredentials(existing, submitted, false, true);
  TEST_ASSERT_EQUAL_STRING("secret-s1", result.device_secret);
  TEST_ASSERT_EQUAL_STRING("NewNetwork", result.wifi_ssid);
}

void test_merge_overwrites_secret_when_provided(void) {
  DeviceCredentials existing, submitted;
  memset(&existing, 0, sizeof(existing));
  memset(&submitted, 0, sizeof(submitted));

  strncpy(existing.device_secret, "old-secret",   CRED_SECRET_MAX - 1);
  strncpy(submitted.wifi_ssid,    "Net",          CRED_SSID_MAX - 1);
  strncpy(submitted.device_secret, "new-secret",  CRED_SECRET_MAX - 1);
  strncpy(submitted.backend_url,  "http://h/api", CRED_URL_MAX - 1);

  DeviceCredentials result = mergeSubmittedCredentials(existing, submitted, true, true);
  TEST_ASSERT_EQUAL_STRING("new-secret", result.device_secret);
}

void test_merge_keeps_existing_url_when_blank(void) {
  DeviceCredentials existing, submitted;
  memset(&existing, 0, sizeof(existing));
  memset(&submitted, 0, sizeof(submitted));

  strncpy(existing.backend_url,   "http://stored.host/api", CRED_URL_MAX - 1);
  strncpy(submitted.wifi_ssid,    "Net",   CRED_SSID_MAX - 1);
  strncpy(submitted.device_secret, "sec",  CRED_SECRET_MAX - 1);
  // submitted.backend_url intentionally empty

  DeviceCredentials result = mergeSubmittedCredentials(existing, submitted, true, false);
  TEST_ASSERT_EQUAL_STRING("http://stored.host/api", result.backend_url);
}

void test_merge_overwrites_url_when_provided(void) {
  DeviceCredentials existing, submitted;
  memset(&existing, 0, sizeof(existing));
  memset(&submitted, 0, sizeof(submitted));

  strncpy(existing.backend_url,   "http://old.host/api",    CRED_URL_MAX - 1);
  strncpy(submitted.wifi_ssid,    "Net",                    CRED_SSID_MAX - 1);
  strncpy(submitted.device_secret, "sec",                   CRED_SECRET_MAX - 1);
  strncpy(submitted.backend_url,  "http://new.host/api",    CRED_URL_MAX - 1);

  DeviceCredentials result = mergeSubmittedCredentials(existing, submitted, true, true);
  TEST_ASSERT_EQUAL_STRING("http://new.host/api", result.backend_url);
}

void test_merge_both_blank_yields_empty(void) {
  // When neither existing nor submitted have a secret, result has empty secret.
  // Caller is responsible for rejecting this case.
  DeviceCredentials existing, submitted;
  memset(&existing, 0, sizeof(existing));
  memset(&submitted, 0, sizeof(submitted));

  strncpy(submitted.wifi_ssid, "Net", CRED_SSID_MAX - 1);

  DeviceCredentials result = mergeSubmittedCredentials(existing, submitted, false, false);
  TEST_ASSERT_EQUAL_STRING("", result.device_secret);
  TEST_ASSERT_EQUAL_STRING("", result.backend_url);
}

// ─── buildConfigJson ─────────────────────────────────────────────────────────

void test_build_config_json_has_secret_true(void) {
  DeviceCredentials c;
  memset(&c, 0, sizeof(c));
  strncpy(c.wifi_ssid,     "TestNet",               CRED_SSID_MAX - 1);
  strncpy(c.device_secret, "supersecret",           CRED_SECRET_MAX - 1);
  strncpy(c.backend_url,   "http://host/api",       CRED_URL_MAX - 1);

  String json = buildConfigJson(c);
  TEST_ASSERT_TRUE(json.indexOf("\"hasSecret\":true") >= 0);
  // Secret value must never appear in the JSON payload
  TEST_ASSERT_TRUE(json.indexOf("supersecret") < 0);
}

void test_build_config_json_has_secret_false_when_empty(void) {
  DeviceCredentials c;
  memset(&c, 0, sizeof(c));
  strncpy(c.wifi_ssid, "Net", CRED_SSID_MAX - 1);
  // device_secret empty

  String json = buildConfigJson(c);
  TEST_ASSERT_TRUE(json.indexOf("\"hasSecret\":false") >= 0);
}

void test_build_config_json_contains_url(void) {
  DeviceCredentials c;
  memset(&c, 0, sizeof(c));
  strncpy(c.backend_url, "http://192.168.1.1/api", CRED_URL_MAX - 1);

  String json = buildConfigJson(c);
  TEST_ASSERT_TRUE(json.indexOf("http://192.168.1.1/api") >= 0);
}

void test_build_config_json_escapes_special_chars(void) {
  DeviceCredentials c;
  memset(&c, 0, sizeof(c));
  // SSID containing a double-quote and backslash
  strncpy(c.wifi_ssid, "My\"Net\\work", CRED_SSID_MAX - 1);

  String json = buildConfigJson(c);
  // Raw chars must not appear unescaped in JSON
  TEST_ASSERT_TRUE(json.indexOf("My\\\"Net\\\\work") >= 0);
}

// ─── applyCompileTimeSecrets ─────────────────────────────────────────────────

void test_apply_empty_inputs_returns_false(void) {
  // Fully empty secrets.h stub — must not write anything to NVS.
  DeviceCredentials c;
  memset(&c, 0, sizeof(c));
  bool result = applyCompileTimeSecrets(c, "", "", "", "");
  TEST_ASSERT_FALSE(result);
  TEST_ASSERT_EQUAL_STRING("", c.wifi_ssid);
  TEST_ASSERT_EQUAL_STRING("", c.device_secret);
  TEST_ASSERT_EQUAL_STRING("", c.backend_url);
}

void test_apply_partial_secret_and_url_only(void) {
  // Typical "portal-provision WiFi" workflow: SSID left blank in secrets.h,
  // but DEVICE_SECRET + BACKEND_URL are set. Both should reach NVS; SSID stays empty.
  DeviceCredentials c;
  memset(&c, 0, sizeof(c));
  bool result = applyCompileTimeSecrets(c, "", "", "mysecret64", "http://srv/api");
  TEST_ASSERT_TRUE(result);
  TEST_ASSERT_EQUAL_STRING("", c.wifi_ssid);
  TEST_ASSERT_EQUAL_STRING("mysecret64", c.device_secret);
  TEST_ASSERT_EQUAL_STRING("http://srv/api", c.backend_url);
}

void test_apply_all_fields_written(void) {
  // Normal dev shortcut: all four fields provided — all reach the struct.
  DeviceCredentials c;
  memset(&c, 0, sizeof(c));
  bool result = applyCompileTimeSecrets(c, "mynet", "mypass", "mysecret", "http://srv/api");
  TEST_ASSERT_TRUE(result);
  TEST_ASSERT_EQUAL_STRING("mynet",          c.wifi_ssid);
  TEST_ASSERT_EQUAL_STRING("mypass",         c.wifi_password);
  TEST_ASSERT_EQUAL_STRING("mysecret",       c.device_secret);
  TEST_ASSERT_EQUAL_STRING("http://srv/api", c.backend_url);
}

// ─── NVS round-trip (uses upgraded Preferences mock) ─────────────────────────

void test_save_then_load_round_trip(void) {
  DeviceCredentials orig;
  memset(&orig, 0, sizeof(orig));
  strncpy(orig.wifi_ssid,     "RoundTripNet",     CRED_SSID_MAX - 1);
  strncpy(orig.wifi_password, "p@ssw0rd",         CRED_PASSWORD_MAX - 1);
  strncpy(orig.device_secret, "secretvalue",      CRED_SECRET_MAX - 1);
  strncpy(orig.backend_url,   "http://srv/api",   CRED_URL_MAX - 1);

  TEST_ASSERT_TRUE(saveCredentials(&orig));

  DeviceCredentials loaded;
  memset(&loaded, 0, sizeof(loaded));
  bool usable = loadCredentials(&loaded);

  TEST_ASSERT_TRUE(usable);
  TEST_ASSERT_EQUAL_STRING(orig.wifi_ssid,     loaded.wifi_ssid);
  TEST_ASSERT_EQUAL_STRING(orig.wifi_password, loaded.wifi_password);
  TEST_ASSERT_EQUAL_STRING(orig.device_secret, loaded.device_secret);
  TEST_ASSERT_EQUAL_STRING(orig.backend_url,   loaded.backend_url);
}

// ─── ota_channel ─────────────────────────────────────────────────────────────

void test_load_empty_nvs_gives_stable_channel(void) {
  // Fresh NVS (setUp calls resetAll) — channel must default to "STABLE".
  DeviceCredentials loaded;
  memset(&loaded, 0, sizeof(loaded));
  loadCredentials(&loaded);
  TEST_ASSERT_EQUAL_STRING("STABLE", loaded.ota_channel);
}

void test_ota_channel_round_trip(void) {
  // Save BETA, reload — must come back as BETA.
  DeviceCredentials orig;
  memset(&orig, 0, sizeof(orig));
  strncpy(orig.wifi_ssid,     "Net",           CRED_SSID_MAX - 1);
  strncpy(orig.device_secret, "sec",           CRED_SECRET_MAX - 1);
  strncpy(orig.backend_url,   "http://h/api",  CRED_URL_MAX - 1);
  strncpy(orig.ota_channel,   "BETA",          CRED_OTA_CHAN_MAX - 1);

  TEST_ASSERT_TRUE(saveCredentials(&orig));

  DeviceCredentials loaded;
  memset(&loaded, 0, sizeof(loaded));
  loadCredentials(&loaded);
  TEST_ASSERT_EQUAL_STRING("BETA", loaded.ota_channel);
}

void test_merge_preserves_existing_channel_when_submitted_empty(void) {
  DeviceCredentials existing, submitted;
  memset(&existing, 0, sizeof(existing));
  memset(&submitted, 0, sizeof(submitted));

  strncpy(existing.ota_channel,  "ALPHA",         CRED_OTA_CHAN_MAX - 1);
  strncpy(existing.device_secret, "sec",          CRED_SECRET_MAX - 1);
  strncpy(existing.backend_url,   "http://h/api", CRED_URL_MAX - 1);
  strncpy(submitted.wifi_ssid,    "Net",          CRED_SSID_MAX - 1);
  // submitted.ota_channel intentionally empty

  DeviceCredentials result = mergeSubmittedCredentials(existing, submitted, false, false);
  TEST_ASSERT_EQUAL_STRING("ALPHA", result.ota_channel);
}

void test_isValidOtaChannel_rejects_unknown(void) {
  TEST_ASSERT_TRUE(isValidOtaChannel("STABLE"));
  TEST_ASSERT_TRUE(isValidOtaChannel("BETA"));
  TEST_ASSERT_TRUE(isValidOtaChannel("ALPHA"));
  TEST_ASSERT_FALSE(isValidOtaChannel("INVALID"));
  TEST_ASSERT_FALSE(isValidOtaChannel(""));
  TEST_ASSERT_FALSE(isValidOtaChannel("stable"));  // case-sensitive
}

// ─── Wiring ──────────────────────────────────────────────────────────────────

void setUp(void) { Preferences::resetAll(); }
void tearDown(void) {}

int main(void) {
  UNITY_BEGIN();

  RUN_TEST(test_all_fields_present_returns_true);
  RUN_TEST(test_empty_ssid_returns_false);
  RUN_TEST(test_empty_secret_returns_false);
  RUN_TEST(test_empty_url_returns_false);
  RUN_TEST(test_all_fields_empty_returns_false);
  RUN_TEST(test_password_empty_still_usable);

  RUN_TEST(test_merge_keeps_existing_secret_when_blank);
  RUN_TEST(test_merge_overwrites_secret_when_provided);
  RUN_TEST(test_merge_keeps_existing_url_when_blank);
  RUN_TEST(test_merge_overwrites_url_when_provided);
  RUN_TEST(test_merge_both_blank_yields_empty);

  RUN_TEST(test_build_config_json_has_secret_true);
  RUN_TEST(test_build_config_json_has_secret_false_when_empty);
  RUN_TEST(test_build_config_json_contains_url);
  RUN_TEST(test_build_config_json_escapes_special_chars);

  RUN_TEST(test_save_then_load_round_trip);

  RUN_TEST(test_apply_empty_inputs_returns_false);
  RUN_TEST(test_apply_partial_secret_and_url_only);
  RUN_TEST(test_apply_all_fields_written);

  RUN_TEST(test_load_empty_nvs_gives_stable_channel);
  RUN_TEST(test_ota_channel_round_trip);
  RUN_TEST(test_merge_preserves_existing_channel_when_submitted_empty);
  RUN_TEST(test_isValidOtaChannel_rejects_unknown);

  return UNITY_END();
}
