#pragma once
#include "credentials.h"

#ifndef UNIT_TEST
#include <Adafruit_NeoPixel.h>
#include "HomePulse/transport_client.h"
#endif

namespace HomePulse {
namespace Ota {

/**
 * Typed mirror of the backend's `ReleaseChannel` (`libs/core/src/lib/types/release-channel.enum.ts`).
 * Kept as a real enum (not a raw string) so firmware code gets exhaustive
 * switch checking; wire format is still the uppercase string via toString()/fromString().
 */
enum class OtaChannel {
    ALPHA,
    BETA,
    STABLE
};

/** Returns the uppercase wire-format string for a channel ("ALPHA"|"BETA"|"STABLE"). */
const char* toString(OtaChannel channel);

/**
 * Parses an uppercase wire-format channel string into an OtaChannel.
 * @return true and populates outChannel on a recognised value; false (outChannel untouched) otherwise.
 */
bool fromString(const char* str, OtaChannel& outChannel);

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
 * Uses ArduinoJson (full RFC 8259 decoding). Field-size caps (kMaxVersionLen,
 * kMaxUrlLen, kMaxChecksumLen in ota.cpp) reject oversized values outright
 * rather than silently truncating them.
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

/**
 * Compare two "MAJOR.MINOR.PATCH[-PRERELEASE]" version strings.
 * Exposed for unit testing; used internally by checkForUpdate as a
 * defense-in-depth downgrade guard (the HMAC-signed response already
 * authenticates the offer — this catches backend bugs/compromise offering
 * a version the device should refuse to flash).
 *
 * Implements SemVer §11 precedence in full: core numerically, then a release
 * (no suffix) above any prerelease of the same core, then dot-separated
 * prerelease identifiers left to right — numeric compared numerically and
 * ranking below alphanumeric, a shorter identifier list ranking lower.
 * Build metadata ("+...") is ignored. Numeric identifiers are compared as
 * digit strings rather than parsed, so an untrusted counter cannot overflow.
 *
 * @return negative if a < b, 0 if equal, positive if a > b
 */
int compareVersions(const char* a, const char* b);

/**
 * Decide whether an OTA check is due.
 *
 * Exposed as a pure predicate for unit testing — the inline expression it
 * replaced (`millis() - lastCheckMs >= intervalMs`, with a "check now" request
 * signalled by assigning lastCheckMs = 0) silently required the device to have
 * been up for a full interval before a forced check could fire, making the
 * backend's force-check flag a no-op on any recently-booted device.
 *
 * A pending request short-circuits the timer. Otherwise the elapsed comparison
 * is done in unsigned arithmetic so it stays correct across millis() wraparound
 * (~49 days).
 *
 * @param nowMs         current millis() value
 * @param lastCheckMs   millis() at the last completed check
 * @param requested     backend asked for an immediate check (sticky flag)
 * @param intervalMs    normal interval between checks
 */
bool shouldCheckForOta(uint32_t nowMs,
                       uint32_t lastCheckMs,
                       bool requested,
                       uint32_t intervalMs);

#ifndef UNIT_TEST

/**
 * POST /api/ota/check with HMAC-signed request.
 * On UpdateAvailable, populates outInfo.url (valid ~900s — download immediately).
 *
 * @param client Shared transport client (same instance used for telemetry POSTs)
 *               — reused rather than opening a second concurrent TLS session,
 *               which matters for heap headroom on the C3's 400KB RAM.
 * @param mac Device MAC address (colon-separated; uppercased internally)
 */
CheckResult checkForUpdate(TransportClient& client,
                           const DeviceCredentials& cred,
                           const char* mac,
                           const char* boardType,
                           const char* currentVersion,
                           UpdateInfo& outInfo);

/**
 * Downloads and flashes binary from outInfo.url via HTTPS, verified against the
 * pinned GTS root bundle (R1 for storage.googleapis.com, R4 for Cloud Run).
 * Hashes the downloaded byte stream incrementally and compares that SHA-256 to
 * info.checksum — the plain file hash the backend stores, not the appended
 * image hash esp_partition_get_sha256() would return.
 * Returns true only if flash OK AND checksum matches; on mismatch the boot
 * partition is reverted to the running one so the bad build never boots.
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
