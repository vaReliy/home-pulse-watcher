#ifndef HOMEPULSE_CREDENTIALS_H
#define HOMEPULSE_CREDENTIALS_H

#include <Preferences.h>
#include <cstring>

/** Max field lengths including null terminator */
#define CRED_SSID_MAX     33   ///< WiFi SSID: 32 chars + null
#define CRED_PASSWORD_MAX 65   ///< WiFi password: 64 chars + null
#define CRED_SECRET_MAX   65   ///< Device HMAC secret: 64 hex chars + null
#define CRED_URL_MAX      129  ///< Backend URL: 128 chars + null
#define CRED_OTA_CHAN_MAX 8    ///< OTA channel: "STABLE"|"BETA"|"ALPHA" + null

/** NVS namespace for all HomePulse credentials */
#define NVS_NAMESPACE "homepulse"

// NVS key names (must be ≤15 characters each)
#define NVS_KEY_SSID    "wifi_ssid"
#define NVS_KEY_PASS    "wifi_pass"
#define NVS_KEY_SECRET  "dev_secret"
#define NVS_KEY_URL     "backend_url"
#define NVS_KEY_OTA_CHAN "ota_channel"

/**
 * Device credentials loaded from NVS.
 * Fields are fixed-size char arrays to avoid heap fragmentation.
 */
struct DeviceCredentials {
    char wifi_ssid[CRED_SSID_MAX];
    char wifi_password[CRED_PASSWORD_MAX];
    char device_secret[CRED_SECRET_MAX];
    char backend_url[CRED_URL_MAX];
    char ota_channel[CRED_OTA_CHAN_MAX];  ///< "STABLE", "BETA", or "ALPHA"
};

/**
 * Load credentials from NVS into the provided struct.
 *
 * @param creds Output struct to populate
 * @return true if wifi_ssid is non-empty (minimum viable config)
 */
inline bool loadCredentials(DeviceCredentials* creds) {
    Preferences prefs;
    prefs.begin(NVS_NAMESPACE, true);  // read-only

    memset(creds, 0, sizeof(DeviceCredentials));

    String ssid    = prefs.getString(NVS_KEY_SSID,    "");
    String pass    = prefs.getString(NVS_KEY_PASS,    "");
    String secret  = prefs.getString(NVS_KEY_SECRET,  "");
    String url     = prefs.getString(NVS_KEY_URL,     "");
    String channel = prefs.getString(NVS_KEY_OTA_CHAN, "");

    prefs.end();

    ssid.toCharArray(creds->wifi_ssid,      CRED_SSID_MAX);
    pass.toCharArray(creds->wifi_password,  CRED_PASSWORD_MAX);
    secret.toCharArray(creds->device_secret, CRED_SECRET_MAX);
    url.toCharArray(creds->backend_url,     CRED_URL_MAX);
    channel.toCharArray(creds->ota_channel, CRED_OTA_CHAN_MAX);

    // Channel is optional config — default to STABLE when not yet persisted.
    if (creds->ota_channel[0] == '\0') {
        strncpy(creds->ota_channel, "STABLE", CRED_OTA_CHAN_MAX - 1);
        creds->ota_channel[CRED_OTA_CHAN_MAX - 1] = '\0';
    }

    return ssid.length() > 0;
}

/**
 * Save credentials from struct to NVS.
 *
 * @param creds Credentials to persist
 * @return true on success
 */
inline bool saveCredentials(const DeviceCredentials* creds) {
    Preferences prefs;
    prefs.begin(NVS_NAMESPACE, false);  // read-write

    prefs.putString(NVS_KEY_SSID,    creds->wifi_ssid);
    prefs.putString(NVS_KEY_PASS,    creds->wifi_password);
    prefs.putString(NVS_KEY_SECRET,  creds->device_secret);
    prefs.putString(NVS_KEY_URL,     creds->backend_url);
    prefs.putString(NVS_KEY_OTA_CHAN, creds->ota_channel);

    prefs.end();
    return true;
}

/**
 * Erase all stored credentials from NVS.
 * Use for factory reset or reprovisioning.
 */
inline void wipeCredentials() {
    Preferences prefs;
    prefs.begin(NVS_NAMESPACE, false);
    prefs.clear();
    prefs.end();
}

/**
 * Returns true when the minimum required fields are present.
 * Use as a pre-flight check before connectWiFi() — catches empty compile-time stubs
 * and partial NVS states (e.g. after a factory reset that re-enters a broken provisioning path).
 * password is intentionally excluded: open WiFi networks have no password.
 */
inline bool credentialsAreUsable(const DeviceCredentials& creds) {
    return creds.wifi_ssid[0] != '\0'
        && creds.device_secret[0] != '\0'
        && creds.backend_url[0] != '\0';
}

/**
 * Merge form submission into existing credentials.
 *
 * When a field is not provided (secretProvided/urlProvided == false) and the
 * existing NVS record has a value, the existing value is carried forward.
 * This enables the "keep current secret/URL unchanged" portal UX.
 *
 * @param existing     Credentials loaded from NVS before the form was submitted
 * @param submitted    Credentials populated from form POST fields
 * @param secretProvided  true if the form sent a non-empty secret
 * @param urlProvided     true if the form sent a non-empty URL
 * @return Merged credentials ready to persist via saveCredentials()
 */
inline DeviceCredentials mergeSubmittedCredentials(
    const DeviceCredentials& existing,
    const DeviceCredentials& submitted,
    bool secretProvided,
    bool urlProvided)
{
    DeviceCredentials result = submitted;
    if (!secretProvided && existing.device_secret[0] != '\0') {
        strncpy(result.device_secret, existing.device_secret, CRED_SECRET_MAX - 1);
        result.device_secret[CRED_SECRET_MAX - 1] = '\0';
    }
    if (!urlProvided && existing.backend_url[0] != '\0') {
        strncpy(result.backend_url, existing.backend_url, CRED_URL_MAX - 1);
        result.backend_url[CRED_URL_MAX - 1] = '\0';
    }
    // Channel is optional — keep existing when form omits it
    if (submitted.ota_channel[0] == '\0' && existing.ota_channel[0] != '\0') {
        strncpy(result.ota_channel, existing.ota_channel, CRED_OTA_CHAN_MAX - 1);
        result.ota_channel[CRED_OTA_CHAN_MAX - 1] = '\0';
    }
    return result;
}

/**
 * Return true when the channel string is a recognised OTA channel.
 * Used both for portal validation and compile-time sanity.
 */
inline bool isValidOtaChannel(const char* ch) {
    return strcmp(ch, "STABLE") == 0
        || strcmp(ch, "BETA")   == 0
        || strcmp(ch, "ALPHA")  == 0;
}

/** JSON-escape backslash and double-quote characters in a string. */
inline String jsonEscapeStr(const char* s) {
    String out;
    while (*s) {
        if (*s == '\\') out += "\\\\";
        else if (*s == '"') out += "\\\"";
        else out += *s;
        s++;
    }
    return out;
}

/**
 * Apply non-empty compile-time secret fields to a credentials struct.
 *
 * Only fields that are non-empty in the supplied strings are written;
 * empty strings leave the corresponding struct field unchanged.
 * This enables "partial" NVS provisioning from secrets.h: a user can
 * pre-define DEVICE_SECRET + BACKEND_URL while leaving WIFI_SSID blank
 * (to be filled via the captive portal) without poisoning NVS.
 *
 * @param creds     Struct to populate (typically zeroed before this call)
 * @param ssid      Compile-time WIFI_SSID  (may be "" or NULL)
 * @param password  Compile-time WIFI_PASSWORD (may be "" or NULL)
 * @param secret    Compile-time DEVICE_SECRET (may be "" or NULL)
 * @param url       Compile-time BACKEND_URL (may be "" or NULL)
 * @return true if at least one field was written, false if all were empty
 */
inline bool applyCompileTimeSecrets(DeviceCredentials& creds,
                                    const char* ssid,
                                    const char* password,
                                    const char* secret,
                                    const char* url)
{
    bool wrote = false;
    if (ssid     && strlen(ssid)     > 0) {
        strncpy(creds.wifi_ssid,     ssid,     CRED_SSID_MAX - 1);
        creds.wifi_ssid[CRED_SSID_MAX - 1] = '\0';
        wrote = true;
    }
    if (password && strlen(password) > 0) {
        strncpy(creds.wifi_password, password, CRED_PASSWORD_MAX - 1);
        creds.wifi_password[CRED_PASSWORD_MAX - 1] = '\0';
        wrote = true;
    }
    if (secret   && strlen(secret)   > 0) {
        strncpy(creds.device_secret, secret,   CRED_SECRET_MAX - 1);
        creds.device_secret[CRED_SECRET_MAX - 1] = '\0';
        wrote = true;
    }
    if (url      && strlen(url)      > 0) {
        strncpy(creds.backend_url,   url,      CRED_URL_MAX - 1);
        creds.backend_url[CRED_URL_MAX - 1] = '\0';
        wrote = true;
    }
#ifdef OTA_CHANNEL
    if (strlen(OTA_CHANNEL) > 0) {
        strncpy(creds.ota_channel, OTA_CHANNEL, CRED_OTA_CHAN_MAX - 1);
        creds.ota_channel[CRED_OTA_CHAN_MAX - 1] = '\0';
        wrote = true;
    }
#endif
    return wrote;
}

/**
 * Build the JSON payload returned by GET /config.
 *
 * Exposes current SSID and backend URL for portal pre-fill, and a boolean
 * indicating whether a device secret is stored — the secret itself is never
 * included so it cannot be captured over the open AP.
 *
 * @param creds  Credentials loaded from NVS
 * @return JSON string: {"ssid":"...","url":"...","hasSecret":true|false}
 */
inline String buildConfigJson(const DeviceCredentials& creds) {
    bool hasSecret = creds.device_secret[0] != '\0';
    return String("{\"ssid\":\"") + jsonEscapeStr(creds.wifi_ssid) +
           "\",\"url\":\"" + jsonEscapeStr(creds.backend_url) +
           "\",\"hasSecret\":" + (hasSecret ? "true" : "false") +
           ",\"otaChannel\":\"" + String(creds.ota_channel) + "\"}";
}

#endif  // HOMEPULSE_CREDENTIALS_H
