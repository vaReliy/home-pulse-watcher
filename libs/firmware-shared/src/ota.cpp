#include "HomePulse/ota.h"
#include <Arduino.h>
#include <cstring>
#include <cstdio>
#include <cstdlib>

#ifndef UNIT_TEST
#include "HomePulse/telemetry.h"
#include "HomePulse/telemetry_http.h"
#include "HomePulse/SecurityUtils.h"
#include <WiFiClient.h>
#include <WiFiClientSecure.h>
#include <HTTPUpdate.h>
#include <esp_ota_ops.h>
#include <esp_task_wdt.h>
#include <time.h>
#endif

namespace HomePulse {
namespace Ota {

// ─── Portable JSON helpers ────────────────────────────────────────────────────

static bool extractJsonString(const char* json, const char* key,
                              char* out, size_t outSize) {
    char searchKey[80];
    snprintf(searchKey, sizeof(searchKey), "\"%s\":\"", key);
    const char* found = strstr(json, searchKey);
    if (!found) return false;
    found += strlen(searchKey);
    const char* end = strchr(found, '"');
    if (!end) return false;
    size_t len = (size_t)(end - found);
    if (len >= outSize) return false;
    strncpy(out, found, len);
    out[len] = '\0';
    return true;
}

static bool extractJsonBool(const char* json, const char* key, bool& out) {
    char truePattern[80], falsePattern[80];
    snprintf(truePattern,  sizeof(truePattern),  "\"%s\":true",  key);
    snprintf(falsePattern, sizeof(falsePattern), "\"%s\":false", key);
    if (strstr(json, truePattern))  { out = true;  return true; }
    if (strstr(json, falsePattern)) { out = false; return true; }
    return false;
}

// ─── parseOtaResponse (always compiled — native-testable) ────────────────────

CheckResult parseOtaResponse(const char* body, UpdateInfo& outInfo) {
    if (!body || body[0] == '\0') return CheckResult::ParseError;

    bool hasUpdate = false;
    if (!extractJsonBool(body, "hasUpdate", hasUpdate)) return CheckResult::ParseError;
    if (!hasUpdate) return CheckResult::NoUpdate;

    char version[32]  = {};
    char url[384]     = {};
    char checksum[65] = {};
    bool isCritical   = false;

    if (!extractJsonString(body, "version",  version,  sizeof(version)))  return CheckResult::ParseError;
    if (!extractJsonString(body, "url",      url,      sizeof(url)))      return CheckResult::ParseError;
    if (!extractJsonString(body, "checksum", checksum, sizeof(checksum))) return CheckResult::ParseError;
    extractJsonBool(body, "isCritical", isCritical);  // optional; defaults to false

    outInfo.version    = String(version);
    outInfo.url        = String(url);
    outInfo.checksum   = String(checksum);
    outInfo.isCritical = isCritical;
    return CheckResult::UpdateAvailable;
}

// ─── Device-only implementation ───────────────────────────────────────────────

#ifndef UNIT_TEST

CheckResult checkForUpdate(const DeviceCredentials& cred,
                           const char* mac,
                           const char* boardType,
                           const char* currentVersion,
                           UpdateInfo& outInfo) {
    // JSON body
    char bodyBuf[256];
    snprintf(bodyBuf, sizeof(bodyBuf),
        "{\"boardType\":\"%s\",\"currentVersion\":\"%s\",\"channel\":\"%s\"}",
        boardType, currentVersion, cred.ota_channel);

    // HMAC canonical + signature
    time_t ts = time(nullptr);
    char canonical[256];
    buildOtaSignatureInput(mac, (unsigned long)ts, boardType, currentVersion,
                           cred.ota_channel, canonical, sizeof(canonical));
    String sig = calculateSignature(String(canonical), cred.device_secret);

    // POST using the shared signed-request helper
    WiFiClient client;
    String url = String(cred.backend_url) + "/api/ota/check";
    HttpResult res = postSignedPayload(client, url, String(bodyBuf),
                                      sig, String(mac), ts, 10000);

    if (res.statusCode == 401) return CheckResult::AuthError;
    if (res.statusCode != 200) return CheckResult::NetworkError;

    return parseOtaResponse(res.body.c_str(), outInfo);
}

bool applyUpdate(const UpdateInfo& info, Adafruit_NeoPixel& statusLed) {
    WiFiClientSecure client;
    client.setInsecure();

    httpUpdate.rebootOnUpdate(false);
    // Inline fast-white blink (80ms cadence) — mirrors tickFastWhiteLed in led.h.
    // led.h is not included here because it transitively requires config.h,
    // which is board-specific and unavailable in the shared library build context.
    httpUpdate.onProgress([&](int recv, int total) {
        (void)recv; (void)total;
        static unsigned long lastToggleMs = 0;
        static bool ledOn = false;
        unsigned long now = millis();
        if (now - lastToggleMs >= 80UL) {
            lastToggleMs = now;
            ledOn = !ledOn;
            if (ledOn) {
                statusLed.setPixelColor(0, statusLed.Color(60, 60, 60));
            } else {
                statusLed.clear();
            }
            statusLed.show();
        }
        esp_task_wdt_reset();
    });

    HTTPUpdateResult result = httpUpdate.update(client, info.url);
    if (result != HTTP_UPDATE_OK) return false;

    const esp_partition_t* updated = esp_ota_get_next_update_partition(nullptr);
    if (!updated) return false;

    uint8_t sha256[32];
    if (esp_partition_get_sha256(updated, sha256) != ESP_OK) return false;

    char hexBuf[65];
    for (int i = 0; i < 32; i++) {
        snprintf(hexBuf + 2 * i, 3, "%02x", sha256[i]);
    }
    hexBuf[64] = '\0';

    return info.checksum == String(hexBuf);
}

bool isPendingValidation() {
    esp_ota_img_states_t state;
    const esp_partition_t* running = esp_ota_get_running_partition();
    if (!running) return false;
    if (esp_ota_get_state_partition(running, &state) != ESP_OK) return false;
    return state == ESP_OTA_IMG_PENDING_VERIFY;
}

void markCurrentAppValid() {
    esp_ota_mark_app_valid_cancel_rollback();
}

#endif  // UNIT_TEST

}  // namespace Ota
}  // namespace HomePulse
