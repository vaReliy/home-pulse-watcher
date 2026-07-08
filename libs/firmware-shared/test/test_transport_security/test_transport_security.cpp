#include <unity.h>
#include "HomePulse/transport_client.h"
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

// Regression guard for the HPW_USE_TLS incident (2026-07-07 audit, HIGH #1):
// ota.cpp:166 declared a hardcoded `WiFiClient client;` for the OTA-check
// request even though the backend is HTTPS-only, producing a silent
// `HTTPClient -5 connection lost` on every OTA check (confirmed on physical
// device serial log). This test asserts, by reading the actual source files,
// that BOTH the telemetry call site (main.cpp) and the OTA-check call site
// (ota.cpp) go through the single shared HomePulse::TransportClient alias
// instead of hardcoding a client type — so a future edit cannot silently
// regress one call site back to plaintext while leaving the other on TLS.
//
// This is a source-level check (not a runtime network test) because the
// device-only networking code (WiFi.h, HTTPClient.h, esp_ota_ops.h, ...) is
// guarded out under -DUNIT_TEST and cannot be exercised on the native/host
// platform. It fails to compile/link against pre-fix sources (no such files
// contain "HomePulse::TransportClient", and the old bare declarations are
// still present) and passes against the fix.

namespace {

// Candidate paths cover both "run from repo root" and "run from
// libs/firmware-shared" (PlatformIO's usual project-dir cwd for `pio test`).
const std::vector<std::string> kMainCppCandidates = {
    "../../firmware/common/main.cpp",
    "firmware/common/main.cpp",
};

const std::vector<std::string> kOtaCppCandidates = {
    "src/ota.cpp",
    "libs/firmware-shared/src/ota.cpp",
};

const std::vector<std::string> kOtaHCandidates = {
    "include/HomePulse/ota.h",
    "libs/firmware-shared/include/HomePulse/ota.h",
};

const std::vector<std::string> kEsp32c3IniCandidates = {
    "../../firmware/esp32c3/platformio.ini",
    "firmware/esp32c3/platformio.ini",
};

const std::vector<std::string> kEsp32c6IniCandidates = {
    "../../firmware/esp32c6/platformio.ini",
    "firmware/esp32c6/platformio.ini",
};

std::string readFirstExisting(const std::vector<std::string>& candidates) {
    for (const auto& path : candidates) {
        std::ifstream file(path);
        if (file.good()) {
            std::ostringstream ss;
            ss << file.rdbuf();
            return ss.str();
        }
    }
    return std::string();  // empty => none found; caller's TEST_ASSERT catches it
}

bool contains(const std::string& haystack, const char* needle) {
    return haystack.find(needle) != std::string::npos;
}

}  // namespace

void setUp(void) {}
void tearDown(void) {}

// ─── Pure macro-derived constant (native-testable, no Arduino deps) ──────────

void test_kTransportUsesTls_matches_HPW_USE_TLS_macro(void) {
#if HPW_USE_TLS
    TEST_ASSERT_TRUE(HomePulse::kTransportUsesTls);
#else
    TEST_ASSERT_FALSE(HomePulse::kTransportUsesTls);
#endif
}

// ─── main.cpp (telemetry call site) ──────────────────────────────────────────

void test_main_cpp_uses_shared_transport_client(void) {
    std::string src = readFirstExisting(kMainCppCandidates);
    TEST_ASSERT_TRUE_MESSAGE(!src.empty(), "could not locate firmware/common/main.cpp");

    TEST_ASSERT_TRUE_MESSAGE(
        contains(src, "HomePulse::TransportClient"),
        "main.cpp must declare its client as HomePulse::TransportClient (single-sourced type)");

    // Old bug pattern: a hardcoded plaintext declaration bypassing the flag.
    TEST_ASSERT_FALSE_MESSAGE(
        contains(src, "WiFiClient client;") || contains(src, "WiFiClientSecure secureClient;"),
        "main.cpp must not hardcode a WiFiClient/WiFiClientSecure client type");

    // No leftover hand-toggled "uncomment for PROD" dead code.
    TEST_ASSERT_FALSE_MESSAGE(
        contains(src, "uncomment"),
        "main.cpp must not contain commented-out 'uncomment for PROD' transport toggle blocks");
}

// ─── ota.cpp (OTA-check call site — the exact incident site) ────────────────

void test_ota_cpp_check_for_update_uses_shared_transport_client(void) {
    std::string src = readFirstExisting(kOtaCppCandidates);
    TEST_ASSERT_TRUE_MESSAGE(!src.empty(), "could not locate libs/firmware-shared/src/ota.cpp");

    TEST_ASSERT_TRUE_MESSAGE(
        contains(src, "checkForUpdate(TransportClient& client,"),
        "ota.cpp's checkForUpdate must accept the shared TransportClient& (reused instance), "
        "not declare its own local WiFiClient");

    // This is the literal incident: `WiFiClient client;` inside checkForUpdate.
    TEST_ASSERT_FALSE_MESSAGE(
        contains(src, "WiFiClient client;"),
        "ota.cpp must not declare a local plaintext WiFiClient for the OTA-check request "
        "(this exact bug shipped a bare WiFiClient to an HTTPS-only backend)");

    TEST_ASSERT_FALSE_MESSAGE(
        contains(src, "uncomment"),
        "ota.cpp must not contain commented-out 'uncomment for PROD' transport toggle blocks");
}

void test_ota_h_declares_transport_client_param(void) {
    std::string src = readFirstExisting(kOtaHCandidates);
    TEST_ASSERT_TRUE_MESSAGE(!src.empty(), "could not locate libs/firmware-shared/include/HomePulse/ota.h");

    TEST_ASSERT_TRUE_MESSAGE(
        contains(src, "checkForUpdate(TransportClient& client,"),
        "ota.h must declare checkForUpdate's first parameter as TransportClient& client");
}

// ─── platformio.ini — release envs are wired to HPW_USE_TLS=1 ──────────────

void test_esp32c3_release_env_enables_tls(void) {
    std::string ini = readFirstExisting(kEsp32c3IniCandidates);
    TEST_ASSERT_TRUE_MESSAGE(!ini.empty(), "could not locate firmware/esp32c3/platformio.ini");
    TEST_ASSERT_TRUE_MESSAGE(
        contains(ini, "-DHPW_USE_TLS=1"),
        "esp32c3 release env must build with -DHPW_USE_TLS=1");
}

void test_esp32c6_release_env_enables_tls(void) {
    std::string ini = readFirstExisting(kEsp32c6IniCandidates);
    TEST_ASSERT_TRUE_MESSAGE(!ini.empty(), "could not locate firmware/esp32c6/platformio.ini");
    TEST_ASSERT_TRUE_MESSAGE(
        contains(ini, "-DHPW_USE_TLS=1"),
        "esp32c6 release env must build with -DHPW_USE_TLS=1");
}

// ─── Unity wiring ────────────────────────────────────────────────────────────

int main(void) {
    UNITY_BEGIN();

    RUN_TEST(test_kTransportUsesTls_matches_HPW_USE_TLS_macro);
    RUN_TEST(test_main_cpp_uses_shared_transport_client);
    RUN_TEST(test_ota_cpp_check_for_update_uses_shared_transport_client);
    RUN_TEST(test_ota_h_declares_transport_client_param);
    RUN_TEST(test_esp32c3_release_env_enables_tls);
    RUN_TEST(test_esp32c6_release_env_enables_tls);

    return UNITY_END();
}
