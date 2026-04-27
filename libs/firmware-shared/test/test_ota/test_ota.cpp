#include <unity.h>
#include "HomePulse/ota.h"
#include "HomePulse/telemetry.h"  // for buildOtaSignatureInput (test 4)
#include <cstring>

using namespace HomePulse::Ota;

// ─── parseOtaResponse ────────────────────────────────────────────────────────

void test_parse_no_update(void) {
    UpdateInfo info;
    CheckResult r = parseOtaResponse("{\"hasUpdate\":false}", info);
    TEST_ASSERT_EQUAL_INT((int)CheckResult::NoUpdate, (int)r);
}

void test_parse_update_available_populates_fields(void) {
    UpdateInfo info;
    const char* body =
        "{\"hasUpdate\":true"
        ",\"version\":\"2.0.0\""
        ",\"url\":\"https://storage.example.com/fw-2.0.0.bin\""
        ",\"checksum\":\"abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789\""
        ",\"isCritical\":false}";

    CheckResult r = parseOtaResponse(body, info);
    TEST_ASSERT_EQUAL_INT((int)CheckResult::UpdateAvailable, (int)r);
    TEST_ASSERT_EQUAL_STRING("2.0.0", info.version.c_str());
    TEST_ASSERT_EQUAL_STRING("https://storage.example.com/fw-2.0.0.bin", info.url.c_str());
    TEST_ASSERT_EQUAL_STRING(
        "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
        info.checksum.c_str());
    TEST_ASSERT_FALSE(info.isCritical);
}

void test_parse_update_available_critical_flag(void) {
    UpdateInfo info;
    const char* body =
        "{\"hasUpdate\":true"
        ",\"version\":\"3.0.0\""
        ",\"url\":\"https://storage.example.com/fw-3.0.0.bin\""
        ",\"checksum\":\"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff\""
        ",\"isCritical\":true}";

    CheckResult r = parseOtaResponse(body, info);
    TEST_ASSERT_EQUAL_INT((int)CheckResult::UpdateAvailable, (int)r);
    TEST_ASSERT_TRUE(info.isCritical);
}

void test_parse_malformed_json_returns_parse_error(void) {
    UpdateInfo info;
    CheckResult r = parseOtaResponse("not json at all", info);
    TEST_ASSERT_EQUAL_INT((int)CheckResult::ParseError, (int)r);
}

void test_parse_null_body_returns_parse_error(void) {
    UpdateInfo info;
    CheckResult r = parseOtaResponse(nullptr, info);
    TEST_ASSERT_EQUAL_INT((int)CheckResult::ParseError, (int)r);
}

void test_parse_missing_url_field_returns_parse_error(void) {
    // hasUpdate:true but missing url → ParseError
    UpdateInfo info;
    const char* body = "{\"hasUpdate\":true,\"version\":\"1.0.0\","
                       "\"checksum\":\"abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234\"}";
    CheckResult r = parseOtaResponse(body, info);
    TEST_ASSERT_EQUAL_INT((int)CheckResult::ParseError, (int)r);
}

// ─── Canonical string format (integration with buildOtaSignatureInput) ────────

void test_ota_canonical_string_format(void) {
    // Verify the string that would be HMAC-signed for the OTA check request.
    // Format: "<UPPER_MAC>:<ts>:<boardType>:<currentVersion>:<channel>"
    char buf[128];
    HomePulse::buildOtaSignatureInput(
        "aa:bb:cc:dd:ee:ff", 1700000000UL, "esp32c3", "1.2.3", "STABLE",
        buf, sizeof(buf));
    TEST_ASSERT_EQUAL_STRING("AA:BB:CC:DD:EE:FF:1700000000:esp32c3:1.2.3:STABLE", buf);
}

void test_ota_canonical_beta_channel(void) {
    char buf[128];
    HomePulse::buildOtaSignatureInput(
        "AA:BB:CC:DD:EE:FF", 1700000001UL, "esp32c6", "2.0.0", "BETA",
        buf, sizeof(buf));
    TEST_ASSERT_EQUAL_STRING("AA:BB:CC:DD:EE:FF:1700000001:esp32c6:2.0.0:BETA", buf);
}

// ─── Unity wiring ─────────────────────────────────────────────────────────────

void setUp(void) {}
void tearDown(void) {}

int main(void) {
    UNITY_BEGIN();

    RUN_TEST(test_parse_no_update);
    RUN_TEST(test_parse_update_available_populates_fields);
    RUN_TEST(test_parse_update_available_critical_flag);
    RUN_TEST(test_parse_malformed_json_returns_parse_error);
    RUN_TEST(test_parse_null_body_returns_parse_error);
    RUN_TEST(test_parse_missing_url_field_returns_parse_error);
    RUN_TEST(test_ota_canonical_string_format);
    RUN_TEST(test_ota_canonical_beta_channel);

    return UNITY_END();
}
