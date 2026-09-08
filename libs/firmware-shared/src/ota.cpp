#include "HomePulse/ota.h"
#include <Arduino.h>
#include <ArduinoJson.h>
#include <cstdint>
#include <cstring>
#include <cstdio>
#include <cstdlib>

#ifndef UNIT_TEST
#include "HomePulse/led.h"
#include "HomePulse/telemetry.h"
#include "HomePulse/telemetry_http.h"
#include "HomePulse/SecurityUtils.h"
#include "HomePulse/gts_root_ca.h"
#include "HomePulse/transport_client.h"
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Update.h>
#include <esp_ota_ops.h>
#include <mbedtls/sha256.h>
#include <time.h>
#endif

namespace HomePulse {
namespace Ota {

// ─── OtaChannel ───────────────────────────────────────────────────────────────

const char* toString(OtaChannel channel) {
    switch (channel) {
        case OtaChannel::ALPHA:  return "ALPHA";
        case OtaChannel::BETA:   return "BETA";
        case OtaChannel::STABLE: return "STABLE";
    }
    return "STABLE";
}

bool fromString(const char* str, OtaChannel& outChannel) {
    if (!str) return false;
    if (strcmp(str, "ALPHA") == 0)  { outChannel = OtaChannel::ALPHA;  return true; }
    if (strcmp(str, "BETA") == 0)   { outChannel = OtaChannel::BETA;   return true; }
    if (strcmp(str, "STABLE") == 0) { outChannel = OtaChannel::STABLE; return true; }
    return false;
}

// ─── JSON parsing (always compiled — native-testable) ─────────────────────────
//
// Replaces the earlier strstr-based field scanner (fixed searchKey[80], no
// nesting awareness) with ArduinoJson. The OTA response drives trust
// decisions (sig, ts, checksum) so it needs a real parser, not string
// scanning. JsonDocument (v7) is a single elastic allocation freed at the
// end of each parse — no persistent heap growth, no String concatenation.
//
// Field-size caps mirror the old fixed buffers so a value that would have
// overflowed still gets rejected rather than silently accepted: version
// max 31 chars, url max 1022 chars (GCS V4 signed URLs run long), checksum
// max 64 chars (SHA-256 hex).
static const size_t kMaxVersionLen  = 31;
static const size_t kMaxUrlLen      = 1022;
static const size_t kMaxChecksumLen = 64;

CheckResult parseOtaResponse(const char* body, UpdateInfo& outInfo) {
    if (!body || body[0] == '\0') return CheckResult::ParseError;

    JsonDocument doc;
    if (deserializeJson(doc, body) != DeserializationError::Ok) return CheckResult::ParseError;

    if (!doc["hasUpdate"].is<bool>()) return CheckResult::ParseError;
    if (!doc["hasUpdate"].as<bool>()) return CheckResult::NoUpdate;

    if (!doc["version"].is<const char*>())  return CheckResult::ParseError;
    if (!doc["url"].is<const char*>())      return CheckResult::ParseError;
    if (!doc["checksum"].is<const char*>()) return CheckResult::ParseError;

    const char* version  = doc["version"];
    const char* url       = doc["url"];
    const char* checksum  = doc["checksum"];

    if (strlen(version)  > kMaxVersionLen)  return CheckResult::ParseError;
    if (strlen(checksum) > kMaxChecksumLen) return CheckResult::ParseError;
    if (strlen(url) > kMaxUrlLen) {
#ifndef UNIT_TEST
        Serial.printf("[OTA] URL exceeds max length — possible truncation upstream, aborting\n");
#endif
        return CheckResult::ParseError;
    }

    bool isCritical = false;
    if (!doc["isCritical"].isNull()) {
        if (!doc["isCritical"].is<bool>()) return CheckResult::ParseError;
        isCritical = doc["isCritical"].as<bool>();
    }

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

// ─── OTA check scheduling (always compiled — native-testable) ────────────────

bool shouldCheckForOta(uint32_t nowMs,
                       uint32_t lastCheckMs,
                       bool requested,
                       uint32_t intervalMs) {
    if (requested) return true;
    // Unsigned subtraction stays correct across millis() wraparound.
    return (uint32_t)(nowMs - lastCheckMs) >= intervalMs;
}

// ─── Version comparison (always compiled — native-testable) ──────────────────

// Parses the "MAJOR.MINOR.PATCH[-PRERELEASE][+BUILD]" prefix of a version string.
// Missing/non-numeric segments parse as 0 — malformed input just compares as
// low rather than crashing; the signature check upstream is the real trust
// boundary, this is a best-effort defense-in-depth guard.
//
// Returns a pointer to the first character of the prerelease part (past the
// '-'), or nullptr when the version carries none. Build metadata ("+...") is
// ignored for precedence, per semver.org §10.
static const char* parseSemverCore(const char* v, int& major, int& minor, int& patch) {
    major = minor = patch = 0;
    if (!v) return nullptr;

    char* end = nullptr;
    const char* p = v;
    major = (int)strtol(p, &end, 10);
    if (end && *end == '.') {
        p = end + 1;
        minor = (int)strtol(p, &end, 10);
    }
    if (end && *end == '.') {
        p = end + 1;
        patch = (int)strtol(p, &end, 10);
    }
    return (end && *end == '-') ? end + 1 : nullptr;
}

/** True when [s, s+len) is a non-empty run of ASCII digits. */
static bool isNumericIdentifier(const char* s, size_t len) {
    if (len == 0) return false;
    for (size_t i = 0; i < len; i++) {
        if (s[i] < '0' || s[i] > '9') return false;
    }
    return true;
}

// Compares two numeric identifiers without converting to int — a prerelease
// counter is untrusted input and could overflow a 32-bit parse. Longer digit
// run wins once leading zeros are stripped.
static int compareNumericIdentifier(const char* a, size_t la, const char* b, size_t lb) {
    while (la > 1 && *a == '0') { a++; la--; }
    while (lb > 1 && *b == '0') { b++; lb--; }
    if (la != lb) return la < lb ? -1 : 1;
    int c = strncmp(a, b, la);
    return c < 0 ? -1 : (c > 0 ? 1 : 0);
}

/** Length of the identifier starting at p, terminated by '.', '+' or NUL. */
static size_t identifierLength(const char* p) {
    const char* e = p;
    while (*e != '\0' && *e != '.' && *e != '+') e++;
    return (size_t)(e - p);
}

/** True when p has reached the end of the prerelease part. */
static bool prereleaseExhausted(const char* p) {
    return *p == '\0' || *p == '+';
}

// Full semver §11 prerelease precedence: dot-separated identifiers compared
// left to right; numeric identifiers compare numerically, numeric ranks below
// alphanumeric, alphanumeric compares by ASCII, and a shorter identifier list
// ranks below a longer one when all preceding identifiers are equal.
static int comparePrerelease(const char* a, const char* b) {
    for (;;) {
        bool aEnd = prereleaseExhausted(a);
        bool bEnd = prereleaseExhausted(b);
        if (aEnd && bEnd) return 0;
        if (aEnd) return -1;
        if (bEnd) return 1;

        size_t la = identifierLength(a);
        size_t lb = identifierLength(b);
        bool aNum = isNumericIdentifier(a, la);
        bool bNum = isNumericIdentifier(b, lb);

        int cmp;
        if (aNum && bNum) {
            cmp = compareNumericIdentifier(a, la, b, lb);
        } else if (aNum) {
            cmp = -1;  // numeric identifiers rank below alphanumeric ones
        } else if (bNum) {
            cmp = 1;
        } else {
            size_t shared = la < lb ? la : lb;
            int c = strncmp(a, b, shared);
            if (c != 0) {
                cmp = c < 0 ? -1 : 1;
            } else if (la != lb) {
                cmp = la < lb ? -1 : 1;
            } else {
                cmp = 0;
            }
        }
        if (cmp != 0) return cmp;

        a += la;
        b += lb;
        if (*a == '.') a++;
        if (*b == '.') b++;
    }
}

int compareVersions(const char* a, const char* b) {
    int aMajor, aMinor, aPatch, bMajor, bMinor, bPatch;
    const char* aPre = parseSemverCore(a, aMajor, aMinor, aPatch);
    const char* bPre = parseSemverCore(b, bMajor, bMinor, bPatch);

    if (aMajor != bMajor) return aMajor < bMajor ? -1 : 1;
    if (aMinor != bMinor) return aMinor < bMinor ? -1 : 1;
    if (aPatch != bPatch) return aPatch < bPatch ? -1 : 1;

    // Same core version: a release outranks any prerelease of it.
    if (!aPre && !bPre) return 0;
    if (!aPre) return 1;
    if (!bPre) return -1;
    return comparePrerelease(aPre, bPre);
}

// ─── Device-only implementation ───────────────────────────────────────────────

#ifndef UNIT_TEST

CheckResult checkForUpdate(TransportClient& client,
                           const DeviceCredentials& cred,
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

    // POST using the shared signed-request helper. `client` is the same
    // instance the caller uses for telemetry — reused here rather than
    // opening a second concurrent TLS session (see checkForUpdate() doc).
    String url = String(cred.backend_url) + "/api/ota/check";
#if HPW_USE_TLS
    uint32_t heapBeforeHandshake = ESP.getFreeHeap();
#endif
    HttpResult res = postSignedPayload(client, url, String(bodyBuf),
                                      sig, String(mac), ts, 10000);
#if HPW_USE_TLS
    Serial.printf("[TLS] OTA-check free heap before/after handshake: %u / %u\n",
                  heapBeforeHandshake, ESP.getFreeHeap());
#endif

    Serial.printf("[OTA] HTTP %d, body len: %d\n", res.statusCode, res.body.length());
    if (res.body.length() > 0) {
        Serial.printf("[OTA] Body: %.200s\n", res.body.c_str());
    }

    if (res.statusCode == 401) return CheckResult::AuthError;
    if (res.statusCode != 200) return CheckResult::NetworkError;

    CheckResult pr = parseOtaResponse(res.body.c_str(), outInfo);
    Serial.printf("[OTA] parseOtaResponse: %d\n", (int)pr);

    if (pr == CheckResult::UpdateAvailable) {
        // Verify server response signature before trusting update metadata.
        // sig/ts/expiresAt live alongside the trust-decision fields parsed above,
        // but aren't part of parseOtaResponse's public (natively-tested) contract —
        // re-parse here rather than threading a JsonDocument out through UpdateInfo.
        char sigBuf[65]       = {};
        char expiresAtBuf[32] = {};
        uint32_t respTs       = 0;

        JsonDocument sigDoc;
        if (deserializeJson(sigDoc, res.body) != DeserializationError::Ok) {
            Serial.printf("[OTA] response re-parse failed\n");
            return CheckResult::ParseError;
        }
        if (!sigDoc["sig"].is<const char*>() || !sigDoc["ts"].is<uint32_t>()) {
            Serial.printf("[OTA] response missing sig/ts field\n");
            return CheckResult::ParseError;
        }

        const char* sig = sigDoc["sig"];
        respTs = sigDoc["ts"].as<uint32_t>();

        // Reject short/oversized signatures before the constant-time compare —
        // constantTimeEquals trusts its caller to pass a real 64-hex-char buffer;
        // a sig of any other length must never reach it.
        if (strlen(sig) != kHmacHexLength) {
            Serial.printf("[OTA] invalid signature length: %u\n", (unsigned)strlen(sig));
            return CheckResult::AuthError;
        }
        strncpy(sigBuf, sig, sizeof(sigBuf) - 1);

        // expiresAt is optional — empty string if absent
        if (sigDoc["expiresAt"].is<const char*>()) {
            const char* expiresAt = sigDoc["expiresAt"];
            strncpy(expiresAtBuf, expiresAt, sizeof(expiresAtBuf) - 1);
        }

        // Canonical string: version|url|checksum|isCritical|expiresAt|ts
        char respCanonical[1280];
        int canonLen = snprintf(respCanonical, sizeof(respCanonical), "%s|%s|%s|%s|%s|%lu",
            outInfo.version.c_str(),
            outInfo.url.c_str(),
            outInfo.checksum.c_str(),
            outInfo.isCritical ? "true" : "false",
            expiresAtBuf,
            (unsigned long)respTs);
        if (canonLen < 0 || (size_t)canonLen >= sizeof(respCanonical)) {
            Serial.printf("[OTA] canonical string buffer overflow, aborting\n");
            return CheckResult::ParseError;
        }

        String computed = calculateSignature(String(respCanonical), cred.device_secret);
        if (!constantTimeEquals(computed.c_str(), sigBuf, kHmacHexLength)) {
            Serial.printf("[OTA] response signature invalid\n");
            return CheckResult::AuthError;
        }

        // Downgrade guard — defense-in-depth on top of the HMAC-verified response:
        // the signature already authenticates the offer came from the backend, but
        // this catches a backend bug or compromise offering a version the device
        // should refuse to flash. No rollback semantics are defined yet (including
        // for isCritical), so any offered version <= the running version is refused.
        if (compareVersions(outInfo.version.c_str(), currentVersion) <= 0) {
            Serial.printf("[OTA] Refusing downgrade/same-version offer: offered=%s running=%s\n",
                          outInfo.version.c_str(), currentVersion);
            return CheckResult::NoUpdate;
        }

        // Freshness check — skip if NTP not yet synced (time() returns 0 or -1)
        time_t now = time(nullptr);
        if (now > 0) {
            long drift = (long)now - (long)respTs;
            if (drift > 300 || drift < -60) {
                Serial.printf("[OTA] response timestamp out of window (drift=%ld)\n", drift);
                return CheckResult::AuthError;
            }
        }
    }

    return pr;
}

bool applyUpdate(const UpdateInfo& info, Adafruit_NeoPixel& statusLed) {
    // LED contract: caller (main loop) reclaims LED state via setPowerStatusLed() on next iteration.

    WiFiClientSecure client;
    client.setCACert(GTS_ROOT_CA);
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
    NetworkClient* stream = http.getStreamPtr();
    size_t remaining = (size_t)contentLength;
    uint8_t buf[4096];
    size_t downloaded = 0;

    // Hash the exact byte stream as downloaded, not esp_partition_get_sha256() post-write —
    // that call returns the *appended* SHA-256 embedded in the image (ESP-IDF's
    // hash_appended format hashes the image content excluding its own trailing 32-byte
    // hash field), which can never equal a plain sha256 of the raw uploaded file computed
    // server-side. Hashing the stream directly guarantees both sides hash identical bytes.
    mbedtls_sha256_context shaCtx;
    mbedtls_sha256_init(&shaCtx);
    mbedtls_sha256_starts(&shaCtx, 0);

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
            mbedtls_sha256_free(&shaCtx);
            return false;
        }
        mbedtls_sha256_update(&shaCtx, buf, (size_t)n);
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
        mbedtls_sha256_free(&shaCtx);
        return false;
    }

    if (!Update.end()) {
        Serial.printf("[OTA] Update.end failed: %s\n", Update.errorString());
        mbedtls_sha256_free(&shaCtx);
        return false;
    }

    uint8_t sha256[32];
    mbedtls_sha256_finish(&shaCtx, sha256);
    mbedtls_sha256_free(&shaCtx);

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
