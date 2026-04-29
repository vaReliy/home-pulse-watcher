#include "HomePulse/ota.h"
#include <Arduino.h>
#include <cstring>
#include <cstdio>
#include <cstdlib>

#ifndef UNIT_TEST
#include "HomePulse/led.h"
#include "HomePulse/telemetry.h"
#include "HomePulse/telemetry_http.h"
#include "HomePulse/SecurityUtils.h"
#include <WiFiClient.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Update.h>
#include <esp_ota_ops.h>
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

    char version[32]   = {};
    char url[1024]     = {};
    char checksum[65]  = {};
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

// ─── Grace-period predicate (always compiled — native-testable) ──────────────

bool shouldMarkAppValid(bool pendingValidation,
                        uint32_t heartbeatsSinceBoot,
                        uint32_t uptimeMs,
                        uint32_t minHeartbeats,
                        uint32_t minUptimeMs) {
    if (!pendingValidation) return false;
    if (heartbeatsSinceBoot < minHeartbeats) return false;
    if (uptimeMs < minUptimeMs) return false;
    return true;
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

    Serial.printf("[OTA] HTTP %d, body len: %d\n", res.statusCode, res.body.length());
    if (res.body.length() > 0) {
        Serial.printf("[OTA] Body: %.200s\n", res.body.c_str());
    }

    if (res.statusCode == 401) return CheckResult::AuthError;
    if (res.statusCode != 200) return CheckResult::NetworkError;

    CheckResult pr = parseOtaResponse(res.body.c_str(), outInfo);
    Serial.printf("[OTA] parseOtaResponse: %d\n", (int)pr);
    return pr;
}

bool applyUpdate(const UpdateInfo& info, Adafruit_NeoPixel& statusLed) {
    // LED contract: caller (main loop) reclaims LED state via setPowerStatusLed() on next iteration.

    WiFiClientSecure client;
    client.setInsecure();
    client.setTimeout(60);

    HTTPClient http;
    http.begin(client, info.url);
    http.setFollowRedirects(HTTPC_FORCE_FOLLOW_REDIRECTS);

    int httpCode = http.GET();
    if (httpCode != HTTP_CODE_OK) {
        Serial.printf("[OTA] HTTP error: %d\n", httpCode);
        http.end();
        return false;
    }

    int contentLength = http.getSize();
    if (contentLength <= 0) {
        Serial.printf("[OTA] Missing Content-Length\n");
        http.end();
        return false;
    }

    Serial.printf("[OTA] Binary size: %d bytes, free heap: %u\n",
                  contentLength, ESP.getFreeHeap());

    if (!Update.begin(contentLength, U_FLASH)) {
        Serial.printf("[OTA] Update.begin failed: %s\n", Update.errorString());
        http.end();
        return false;
    }

    // available() is safe while data remains in the current TLS record —
    // mbedtls_ssl_get_bytes_avail() returns > 0 without touching the next record.
    // close_notify only appears when the record is empty and we peek forward.
    // We exit the loop at remaining == 0, before that next available() call.
    WiFiClient* stream = http.getStreamPtr();
    size_t remaining = (size_t)contentLength;
    uint8_t buf[4096];
    size_t downloaded = 0;

    while (remaining > 0) {
        // Block until data arrives or 30s stall timeout
        uint32_t t0 = millis();
        int avail = 0;
        do {
            avail = stream->available();
            if (avail > 0) break;
            delay(1);
        } while (millis() - t0 < 30000UL);

        if (avail <= 0) {
            Serial.printf("[OTA] Stream stalled: %u bytes remaining\n", remaining);
            break;
        }

        size_t toRead = min(min((size_t)avail, sizeof(buf)), remaining);
        int n = stream->read(buf, toRead);
        if (n <= 0) {
            Serial.printf("[OTA] Read error: %u bytes remaining\n", remaining);
            break;
        }

        size_t written = Update.write(buf, (size_t)n);
        if (written != (size_t)n) {
            Serial.printf("[OTA][ABORT] Flash write failed at offset %u\n", downloaded);
            Update.abort();
            http.end();
            return false;
        }
        downloaded += (size_t)n;
        remaining  -= (size_t)n;

        tickFastWhiteLed(statusLed);

        size_t prevChunk = (downloaded - (size_t)n) / (64 * 1024);
        size_t currChunk = downloaded / (64 * 1024);
        if (currChunk != prevChunk) {
            Serial.printf("[OTA] Progress: %u / %d bytes\n", downloaded, contentLength);
        }
    }

    http.end();

    if (downloaded < (size_t)contentLength) {
        Serial.printf("[OTA][ABORT] Incomplete download: %u / %d bytes\n",
                      downloaded, contentLength);
        Update.abort();
        return false;
    }

    if (!Update.end()) {
        Serial.printf("[OTA] Update.end failed: %s\n", Update.errorString());
        return false;
    }

    const esp_partition_t* updated = esp_ota_get_next_update_partition(nullptr);
    if (!updated) return false;

    uint8_t sha256[32];
    tickFastWhiteLed(statusLed);  // tick before blocking SHA-256 partition read
    if (esp_partition_get_sha256(updated, sha256) != ESP_OK) return false;

    char hexBuf[65];
    for (int i = 0; i < 32; i++) {
        snprintf(hexBuf + 2 * i, 3, "%02x", sha256[i]);
    }
    hexBuf[64] = '\0';

    bool checksumOk = (info.checksum == String(hexBuf));
    if (!checksumOk) {
        Serial.printf("[OTA][ABORT] Checksum mismatch: expected %s got %s\n",
                      info.checksum.c_str(), hexBuf);
        // Update.end() already committed the partition; revert next-boot selection
        // to the currently running partition so the bad build never boots.
        esp_ota_set_boot_partition(esp_ota_get_running_partition());
    }
    return checksumOk;
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
