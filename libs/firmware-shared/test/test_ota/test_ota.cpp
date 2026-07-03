#include <unity.h>
#include "HomePulse/ota.h"
#include "HomePulse/telemetry.h"  // for buildOtaSignatureInput (test 4)
#include <cstring>

using namespace HomePulse::Ota;

// ─── OtaChannel ──────────────────────────────────────────────────────────────

void test_ota_channel_to_string(void) {
    TEST_ASSERT_EQUAL_STRING("ALPHA",  toString(OtaChannel::ALPHA));
    TEST_ASSERT_EQUAL_STRING("BETA",   toString(OtaChannel::BETA));
    TEST_ASSERT_EQUAL_STRING("STABLE", toString(OtaChannel::STABLE));
}

void test_ota_channel_from_string_valid(void) {
    OtaChannel ch;
    TEST_ASSERT_TRUE(fromString("ALPHA", ch));
    TEST_ASSERT_EQUAL_INT((int)OtaChannel::ALPHA, (int)ch);

    TEST_ASSERT_TRUE(fromString("BETA", ch));
    TEST_ASSERT_EQUAL_INT((int)OtaChannel::BETA, (int)ch);

    TEST_ASSERT_TRUE(fromString("STABLE", ch));
    TEST_ASSERT_EQUAL_INT((int)OtaChannel::STABLE, (int)ch);
}

void test_ota_channel_from_string_invalid(void) {
    OtaChannel ch = OtaChannel::STABLE;
    TEST_ASSERT_FALSE(fromString("BOGUS", ch));
    TEST_ASSERT_FALSE(fromString("", ch));
    TEST_ASSERT_FALSE(fromString(nullptr, ch));
    // outChannel untouched on failure
    TEST_ASSERT_EQUAL_INT((int)OtaChannel::STABLE, (int)ch);
}

void test_ota_channel_from_string_case_sensitive(void) {
    // Wire format is uppercase only — lowercase must not match.
    OtaChannel ch;
    TEST_ASSERT_FALSE(fromString("stable", ch));
}

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

void test_parse_long_gcs_signed_url_succeeds(void) {
    // Regression: url[] was 384 bytes — GCS V4 signed URLs with 512-hex-char
    // RSA-2048 signatures easily exceed this. Buffer is now 1024.
    UpdateInfo info;
    // X-Goog-Signature is 512 hex chars (RSA-2048), giving ~810-char total URL.
    const char* body =
        "{\"hasUpdate\":true"
        ",\"version\":\"1.1.0\""
        ",\"url\":\"https://storage.googleapis.com/homepulse-fw/esp32c3/v1.1.0/firmware.bin"
        "?X-Goog-Algorithm=GOOG4-RSA-SHA256"
        "&X-Goog-Credential=sa%40project.iam.gserviceaccount.com%2F20260428%2Fauto%2Fstorage%2Fgoog4_request"
        "&X-Goog-Date=20260428T120000Z"
        "&X-Goog-Expires=900"
        "&X-Goog-SignedHeaders=host"
        "&X-Goog-Signature=aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899"
                           "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899"
                           "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899"
                           "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899\""
        ",\"checksum\":\"abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789\""
        ",\"isCritical\":false}";

    CheckResult r = parseOtaResponse(body, info);
    TEST_ASSERT_EQUAL_INT((int)CheckResult::UpdateAvailable, (int)r);
    TEST_ASSERT_EQUAL_STRING("1.1.0", info.version.c_str());
    // URL must exceed old 384-byte limit to prove the buffer fix holds.
    TEST_ASSERT_TRUE(info.url.length() > 384);
}

// ─── extractJsonString — escape sequence handling ────────────────────────────

void test_extract_escaped_quote_in_url(void) {
    // JSON value with \" should unescape to a literal " in the extracted string.
    // Old strchr-based parser stops at the " inside \", truncating the value.
    UpdateInfo info;
    const char* body =
        "{\"hasUpdate\":true"
        ",\"version\":\"1.0.0\""
        ",\"url\":\"https://example.com/path\\\"with-quote\""
        ",\"checksum\":\"abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789\"}";
    CheckResult r = parseOtaResponse(body, info);
    TEST_ASSERT_EQUAL_INT((int)CheckResult::UpdateAvailable, (int)r);
    TEST_ASSERT_EQUAL_STRING("https://example.com/path\"with-quote", info.url.c_str());
}

void test_extract_escaped_backslash_in_url(void) {
    // JSON value with \\ should unescape to a single backslash.
    UpdateInfo info;
    const char* body =
        "{\"hasUpdate\":true"
        ",\"version\":\"1.0.0\""
        ",\"url\":\"https://example.com/path\\\\with-backslash\""
        ",\"checksum\":\"abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789\"}";
    CheckResult r = parseOtaResponse(body, info);
    TEST_ASSERT_EQUAL_INT((int)CheckResult::UpdateAvailable, (int)r);
    TEST_ASSERT_EQUAL_STRING("https://example.com/path\\with-backslash", info.url.c_str());
}

void test_parse_url_exactly_fills_buffer_returns_parse_error(void) {
    // url[] is 1024 bytes → capacity 1023 chars. A URL that exactly fills it
    // to the rim is indistinguishable from a silently truncated one and must
    // be rejected rather than passed downstream with a truncated value.
    char longUrl[1024];
    memset(longUrl, 'a', 1023);
    longUrl[1023] = '\0';

    char body[2048];
    snprintf(body, sizeof(body),
        "{\"hasUpdate\":true,\"version\":\"1.0.0\",\"url\":\"%s\","
        "\"checksum\":\"abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789\"}",
        longUrl);

    UpdateInfo info;
    CheckResult r = parseOtaResponse(body, info);
    TEST_ASSERT_EQUAL_INT((int)CheckResult::ParseError, (int)r);
}

void test_parse_url_one_below_buffer_capacity_succeeds(void) {
    // Boundary check: one char short of capacity (1022 chars) must still parse.
    char longUrl[1024];
    memset(longUrl, 'a', 1022);
    longUrl[1022] = '\0';

    char body[2048];
    snprintf(body, sizeof(body),
        "{\"hasUpdate\":true,\"version\":\"1.0.0\",\"url\":\"%s\","
        "\"checksum\":\"abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789\"}",
        longUrl);

    UpdateInfo info;
    CheckResult r = parseOtaResponse(body, info);
    TEST_ASSERT_EQUAL_INT((int)CheckResult::UpdateAvailable, (int)r);
    TEST_ASSERT_EQUAL_INT(1022, (int)info.url.length());
}

void test_extract_value_exceeding_buffer_returns_parse_error(void) {
    // version[] is 32 bytes; a 32-char version string must not fit → ParseError.
    UpdateInfo info;
    const char* body =
        "{\"hasUpdate\":true"
        ",\"version\":\"1.2.3-this-version-is-way-too-long-for-the-buffer\""
        ",\"url\":\"https://example.com/fw.bin\""
        ",\"checksum\":\"abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789\"}";
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

    RUN_TEST(test_ota_channel_to_string);
    RUN_TEST(test_ota_channel_from_string_valid);
    RUN_TEST(test_ota_channel_from_string_invalid);
    RUN_TEST(test_ota_channel_from_string_case_sensitive);
    RUN_TEST(test_parse_no_update);
    RUN_TEST(test_parse_update_available_populates_fields);
    RUN_TEST(test_parse_update_available_critical_flag);
    RUN_TEST(test_parse_malformed_json_returns_parse_error);
    RUN_TEST(test_parse_null_body_returns_parse_error);
    RUN_TEST(test_parse_missing_url_field_returns_parse_error);
    RUN_TEST(test_parse_long_gcs_signed_url_succeeds);
    RUN_TEST(test_parse_url_exactly_fills_buffer_returns_parse_error);
    RUN_TEST(test_parse_url_one_below_buffer_capacity_succeeds);
    RUN_TEST(test_ota_canonical_string_format);
    RUN_TEST(test_ota_canonical_beta_channel);
    RUN_TEST(test_extract_escaped_quote_in_url);
    RUN_TEST(test_extract_escaped_backslash_in_url);
    RUN_TEST(test_extract_value_exceeding_buffer_returns_parse_error);

    return UNITY_END();
}
