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
 */
CheckResult parseOtaResponse(const char* body, UpdateInfo& outInfo);

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
 * Downloads and flashes binary from outInfo.url via HTTPS (setInsecure).
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
