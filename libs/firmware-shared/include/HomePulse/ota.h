#pragma once
#include "credentials.h"

#ifndef UNIT_TEST
#include <Adafruit_NeoPixel.h>
#endif

namespace HomePulse {
namespace Ota {

enum class CheckResult {
    NoUpdate,
    UpdateAvailable,
    NetworkError,
    AuthError,
    ParseError
};

struct UpdateInfo {
    String version;
    String url;
    String checksum;   ///< lowercase SHA-256 hex, 64 chars
    bool   isCritical;
};

/**
 * Parse JSON response body from /api/ota/check.
 * Exposed for unit testing; called internally by checkForUpdate.
 *
 * The internal JSON parser handles single-level \" and \\ escape sequences.
 * Sufficient for all current OTA response fields (semver, GCS signed URLs,
 * hex checksums). Full RFC 8259 escape decoding (\n, \uXXXX, etc.) is not
 * implemented — add it here if future fields require it.
 */
CheckResult parseOtaResponse(const char* body, UpdateInfo& outInfo);

/**
 * Returns true when all grace-period conditions are satisfied for marking the
 * current OTA boot as valid. Pure function — testable natively without hardware.
 *
 * @param pendingValidation  true if this boot is an unvalidated OTA boot (and not yet marked)
 * @param heartbeatsSinceBoot  number of successful backend contacts since boot
 * @param uptimeMs  current millis() value (time since boot)
 * @param minHeartbeats  minimum successful contacts required before mark-valid
 * @param minUptimeMs  minimum uptime required before mark-valid
 */
bool shouldMarkAppValid(bool pendingValidation,
                        uint32_t heartbeatsSinceBoot,
                        uint32_t uptimeMs,
                        uint32_t minHeartbeats,
                        uint32_t minUptimeMs);

#ifndef UNIT_TEST

/**
 * POST /api/ota/check with HMAC-signed request.
 * On UpdateAvailable, populates outInfo.url (valid ~900s — download immediately).
 *
 * @param mac Device MAC address (colon-separated; uppercased internally)
 */
CheckResult checkForUpdate(const DeviceCredentials& cred,
                           const char* mac,
                           const char* boardType,
                           const char* currentVersion,
                           UpdateInfo& outInfo);

/**
 * Downloads and flashes binary from outInfo.url via HTTPS (GTS Root R1 CA verified).
 * Verifies SHA-256 via esp_partition_get_sha256 post-flash.
 * Returns true only if flash OK AND checksum matches.
 * Does NOT call ESP.restart() — caller decides.
 */
bool applyUpdate(const UpdateInfo& info, Adafruit_NeoPixel& statusLed);

/**
 * Returns true if this boot is an unvalidated OTA boot.
 * Check once in setup(); store result in a static bool.
 */
bool isPendingValidation();

/**
 * Call after first successful heartbeat on a pending-validation boot.
 * Wraps esp_ota_mark_app_valid_cancel_rollback().
 */
void markCurrentAppValid();

#endif  // UNIT_TEST

}  // namespace Ota
}  // namespace HomePulse
