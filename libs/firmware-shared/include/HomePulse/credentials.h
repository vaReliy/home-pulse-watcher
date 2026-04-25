#ifndef HOMEPULSE_CREDENTIALS_H
#define HOMEPULSE_CREDENTIALS_H

#include <Preferences.h>
#include <cstring>

/** Max field lengths including null terminator */
#define CRED_SSID_MAX     33   ///< WiFi SSID: 32 chars + null
#define CRED_PASSWORD_MAX 65   ///< WiFi password: 64 chars + null
#define CRED_SECRET_MAX   65   ///< Device HMAC secret: 64 hex chars + null
#define CRED_URL_MAX      129  ///< Backend URL: 128 chars + null

/** NVS namespace for all HomePulse credentials */
#define NVS_NAMESPACE "homepulse"

// NVS key names (must be ≤15 characters each)
#define NVS_KEY_SSID    "wifi_ssid"
#define NVS_KEY_PASS    "wifi_pass"
#define NVS_KEY_SECRET  "dev_secret"
#define NVS_KEY_URL     "backend_url"

/**
 * Device credentials loaded from NVS.
 * Fields are fixed-size char arrays to avoid heap fragmentation.
 */
struct DeviceCredentials {
    char wifi_ssid[CRED_SSID_MAX];
    char wifi_password[CRED_PASSWORD_MAX];
    char device_secret[CRED_SECRET_MAX];
    char backend_url[CRED_URL_MAX];
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

    String ssid   = prefs.getString(NVS_KEY_SSID,   "");
    String pass   = prefs.getString(NVS_KEY_PASS,   "");
    String secret = prefs.getString(NVS_KEY_SECRET, "");
    String url    = prefs.getString(NVS_KEY_URL,    "");

    prefs.end();

    ssid.toCharArray(creds->wifi_ssid,      CRED_SSID_MAX);
    pass.toCharArray(creds->wifi_password,  CRED_PASSWORD_MAX);
    secret.toCharArray(creds->device_secret, CRED_SECRET_MAX);
    url.toCharArray(creds->backend_url,     CRED_URL_MAX);

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

    prefs.putString(NVS_KEY_SSID,   creds->wifi_ssid);
    prefs.putString(NVS_KEY_PASS,   creds->wifi_password);
    prefs.putString(NVS_KEY_SECRET, creds->device_secret);
    prefs.putString(NVS_KEY_URL,    creds->backend_url);

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

#endif  // HOMEPULSE_CREDENTIALS_H
