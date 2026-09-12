#include <unity.h>
#include "HomePulse/transport_client.h"
#include <cstring>
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

// Extracts the text of one `[env:...]` section (from its heading up to the
// next `[env:` heading, or EOF) so assertions can be scoped to that section
// instead of matching anywhere in the whole platformio.ini file — a stray
// flag in another section (or a future third env) must not false-positive
// a section-specific assertion.
//
// Only matches the heading when it starts a line (preceded by '\n' or start
// of file): platformio.ini's comments reference other envs' section names
// in prose (e.g. "see [env:esp32c3_dev] below"), and a plain std::string::find
// would latch onto that mid-line mention instead of the real `[env:...]`
// heading line.
std::string extractEnvSection(const std::string& ini, const char* envHeading) {
    size_t searchFrom = 0;
    size_t start = std::string::npos;
    while (true) {
        size_t candidate = ini.find(envHeading, searchFrom);
        if (candidate == std::string::npos) {
            break;
        }
        if (candidate == 0 || ini[candidate - 1] == '\n') {
            start = candidate;
            break;
        }
        searchFrom = candidate + 1;
    }
    if (start == std::string::npos) {
        return std::string();
    }
    size_t nextHeading = ini.find("\n[env:", start + std::strlen(envHeading));
    return ini.substr(start, nextHeading == std::string::npos ? std::string::npos : nextHeading - start);
}

}  // namespace

void setUp(void) {}
void tearDown(void) {}

// ─── Pure macro-derived constant (native-testable, no Arduino deps) ──────────
//
// Genuinely exercises both branches: [env:native] compiles this with
// HPW_USE_TLS undefined (=0 via transport_client.h's fallback), and
// [env:native_tls] (libs/firmware-shared/platformio.ini) compiles the same
// file with -DHPW_USE_TLS=1. `pio test -e native` alone only proves the =0
// branch; run `pio test -e native_tls` too (or `pio test` with no -e, which
// runs every env) to cover both.

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

// ─── main.cpp — configureTransportClient() must run before first use ───────

void test_main_cpp_configures_transport_client_before_first_use(void) {
    std::string src = readFirstExisting(kMainCppCandidates);
    TEST_ASSERT_TRUE_MESSAGE(!src.empty(), "could not locate firmware/common/main.cpp");

    size_t configurePos = src.find("HomePulse::configureTransportClient(");
    TEST_ASSERT_TRUE_MESSAGE(
        configurePos != std::string::npos,
        "main.cpp must call HomePulse::configureTransportClient(...) to pin the CA bundle "
        "before the shared TransportClient is used");

    // "sendPowerStatus(" alone would also match its own definition (which
    // precedes setup()/configureTransportClient() in the file); match the
    // literal call-site text instead so this only finds where it's invoked.
    size_t firstSendPos = src.find("sendPowerStatus(lastPowerStatus, lastAdcValue)");
    TEST_ASSERT_TRUE_MESSAGE(
        firstSendPos != std::string::npos,
        "could not locate a sendPowerStatus(lastPowerStatus, lastAdcValue) call site in main.cpp");
    TEST_ASSERT_TRUE_MESSAGE(
        configurePos < firstSendPos,
        "configureTransportClient() must run before the first sendPowerStatus() call, or the "
        "TLS client would send its first request unconfigured (no CA pinned)");

    size_t firstCheckForUpdatePos = src.find("HomePulse::Ota::checkForUpdate(");
    TEST_ASSERT_TRUE_MESSAGE(
        firstCheckForUpdatePos != std::string::npos,
        "could not locate a HomePulse::Ota::checkForUpdate(...) call site in main.cpp");
    TEST_ASSERT_TRUE_MESSAGE(
        configurePos < firstCheckForUpdatePos,
        "configureTransportClient() must run before the first checkForUpdate() call, or the "
        "OTA-check client would send its first request unconfigured (no CA pinned)");
}

// ─── platformio.ini — release envs are wired to HPW_USE_TLS=1 ──────────────

void test_esp32c3_release_env_enables_tls(void) {
    std::string ini = readFirstExisting(kEsp32c3IniCandidates);
    TEST_ASSERT_TRUE_MESSAGE(!ini.empty(), "could not locate firmware/esp32c3/platformio.ini");

    std::string releaseSection = extractEnvSection(ini, "[env:esp32c3]");
    TEST_ASSERT_TRUE_MESSAGE(
        !releaseSection.empty(),
        "esp32c3 platformio.ini must declare an [env:esp32c3] release env");
    TEST_ASSERT_TRUE_MESSAGE(
        contains(releaseSection, "-DHPW_USE_TLS=1"),
        "esp32c3 release env must build with -DHPW_USE_TLS=1");
}

void test_esp32c6_release_env_enables_tls(void) {
    std::string ini = readFirstExisting(kEsp32c6IniCandidates);
    TEST_ASSERT_TRUE_MESSAGE(!ini.empty(), "could not locate firmware/esp32c6/platformio.ini");

    std::string releaseSection = extractEnvSection(ini, "[env:esp32c6]");
    TEST_ASSERT_TRUE_MESSAGE(
        !releaseSection.empty(),
        "esp32c6 platformio.ini must declare an [env:esp32c6] release env");
    TEST_ASSERT_TRUE_MESSAGE(
        contains(releaseSection, "-DHPW_USE_TLS=1"),
        "esp32c6 release env must build with -DHPW_USE_TLS=1");
}

// ─── platformio.ini — _dev envs override back to plaintext (HPW_USE_TLS=0) ──

void test_esp32c3_dev_env_disables_tls(void) {
    std::string ini = readFirstExisting(kEsp32c3IniCandidates);
    TEST_ASSERT_TRUE_MESSAGE(!ini.empty(), "could not locate firmware/esp32c3/platformio.ini");

    std::string devSection = extractEnvSection(ini, "[env:esp32c3_dev]");
    TEST_ASSERT_TRUE_MESSAGE(
        !devSection.empty(),
        "esp32c3 platformio.ini must declare an esp32c3_dev local-dev override env");
    TEST_ASSERT_TRUE_MESSAGE(
        contains(devSection, "-DHPW_USE_TLS=0"),
        "esp32c3_dev env must override back to -DHPW_USE_TLS=0 (plaintext WiFiClient) for "
        "local development against a non-HTTPS backend");
}

void test_esp32c6_dev_env_disables_tls(void) {
    std::string ini = readFirstExisting(kEsp32c6IniCandidates);
    TEST_ASSERT_TRUE_MESSAGE(!ini.empty(), "could not locate firmware/esp32c6/platformio.ini");

    std::string devSection = extractEnvSection(ini, "[env:esp32c6_dev]");
    TEST_ASSERT_TRUE_MESSAGE(
        !devSection.empty(),
        "esp32c6 platformio.ini must declare an esp32c6_dev local-dev override env");
    TEST_ASSERT_TRUE_MESSAGE(
        contains(devSection, "-DHPW_USE_TLS=0"),
        "esp32c6_dev env must override back to -DHPW_USE_TLS=0 (plaintext WiFiClient) for "
        "local development against a non-HTTPS backend");
}

// ─── Unity wiring ────────────────────────────────────────────────────────────

int main(void) {
    UNITY_BEGIN();

    RUN_TEST(test_kTransportUsesTls_matches_HPW_USE_TLS_macro);
    RUN_TEST(test_main_cpp_uses_shared_transport_client);
    RUN_TEST(test_main_cpp_configures_transport_client_before_first_use);
    RUN_TEST(test_ota_cpp_check_for_update_uses_shared_transport_client);
    RUN_TEST(test_ota_h_declares_transport_client_param);
    RUN_TEST(test_esp32c3_release_env_enables_tls);
    RUN_TEST(test_esp32c6_release_env_enables_tls);
    RUN_TEST(test_esp32c3_dev_env_disables_tls);
    RUN_TEST(test_esp32c6_dev_env_disables_tls);

    return UNITY_END();
}
