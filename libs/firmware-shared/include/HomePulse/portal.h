#ifndef HOMEPULSE_PORTAL_H
#define HOMEPULSE_PORTAL_H

#include <Arduino.h>
#include <WiFi.h>
#include <DNSServer.h>
#include <WebServer.h>
#include <Adafruit_NeoPixel.h>
#include <esp_random.h>

#include "credentials.h"
#include "led.h"
#include "portal_html.h"

// ─── Portal Network Configuration ────────────────────────────────────────────

/** AP static IP address */
#define PORTAL_AP_IP_STR    "192.168.4.1"

/** DNS server port (standard: 53) */
#define PORTAL_DNS_PORT     53

/** HTTP server port */
#define PORTAL_HTTP_PORT    80

/**
 * Captive-portal AP password. Fixed and identical across every device — NOT
 * A SECURITY GAP, a deliberate choice: HomePulse is currently single-operator
 * (one person flashes and provisions every device, for themselves/family/
 * friends), so a per-device secret password only adds typing friction (the
 * earlier MAC-derived password was uppercase hex, awkward on a mobile
 * keyboard) with no real security benefit for this threat model. Worst case
 * if someone joins this AP: they can rewrite this one device's WiFi/backend-
 * URL/secret via POST /save (CSRF-protected against cross-origin, not against
 * a joined client) — annoying, not a home-network compromise. Revisit if
 * HomePulse ever ships to third parties (installer flashes, customer
 * self-provisions).
 *
 * Never hardcoded here — supplied at compile time via the PORTAL_AP_PASSWORD
 * build flag (platformio.ini's `-DPORTAL_AP_PASSWORD=\"${sysenv.PORTAL_AP_PASSWORD}\"`),
 * sourced from the PORTAL_AP_PASSWORD env var. Set HPW_PORTAL_AP_PASSWORD in
 * your local .env (see .env.example) — scripts/firmware-docker-build.sh reads
 * it and passes it through as a Docker build-arg; a bare `pio run` needs it
 * exported in your shell too (`set -a && source .env && set +a`). Avoid `"`
 * and `\` in the value — it's spliced unescaped into a -D compiler flag.
 *
 * PlatformIO silently substitutes an empty string for an unset sysenv var
 * instead of failing the build — an empty WPA2 password isn't a compile
 * error, it's an accidentally-open AP. The static_assert below is the real
 * enforcement: an unset/too-short value fails compilation instead of shipping
 * silently.
 */
#ifndef PORTAL_AP_PASSWORD
#define PORTAL_AP_PASSWORD ""
#endif
static_assert(sizeof(PORTAL_AP_PASSWORD) - 1 >= 8,
              "PORTAL_AP_PASSWORD must be >= 8 chars (WPA2-PSK minimum). "
              "Set HPW_PORTAL_AP_PASSWORD in .env before building — see portal.h.");

// ─── Internal state ───────────────────────────────────────────────────────────

static DNSServer  _dnsServer;
static WebServer  _webServer(PORTAL_HTTP_PORT);
static String     _csrfToken;  // anti-CSRF token, regenerated each AP session

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Return the captive-portal AP password. See PORTAL_AP_PASSWORD above for why
 * this is a fixed, non-secret value rather than a per-device derivation.
 *
 * @return 8-character WPA2-PSK password string
 */
inline String buildApPassword() {
    return String(PORTAL_AP_PASSWORD);
}

/**
 * Build the AP SSID from the device MAC address.
 * Format: "HomePulse-Setup-XXXX" where XXXX = last 4 hex chars of MAC.
 *
 * @param mac Full MAC string, e.g. "AA:BB:CC:DD:EE:FF"
 * @return SSID string
 */
inline String buildApSsid(const String& mac) {
    // Last 4 chars of MAC string without colons = last 2 bytes = "EEFF"
    String clean = mac;
    clean.replace(":", "");
    String suffix = clean.substring(clean.length() - 4);
    suffix.toUpperCase();
    return String("HomePulse-Setup-") + suffix;
}

// ─── Route handlers ───────────────────────────────────────────────────────────

/** Serve the configuration portal page */
static void handleRoot() {
    // Read HTML string from PROGMEM into a String
    _webServer.send_P(200, "text/html", PORTAL_HTML);
}

/**
 * Redirect captive portal detection probes (Android, iOS, Windows) to /.
 * These probes vary by OS: /generate_204, /hotspot-detect.html, /connecttest.txt, etc.
 */
static void handleCaptiveRedirect() {
    _webServer.sendHeader("Location", "http://" PORTAL_AP_IP_STR "/", true);
    _webServer.send(302, "text/plain", "");
}

/**
 * Scan WiFi networks and return JSON array.
 * Format: [{"ssid":"Name"}, ...] — sorted by signal strength (strongest first),
 * de-duplicated (keeps strongest entry per SSID), hidden networks omitted.
 */
static void handleScan() {
    int n = WiFi.scanNetworks();

    // Max scan results we'll process (typical AP scan returns ≤20)
    const int MAX_SCAN = 32;
    int count = (n < MAX_SCAN) ? n : MAX_SCAN;

    // Build index array sorted by RSSI descending (insertion sort — small n, already partially ordered)
    int indices[MAX_SCAN];
    for (int i = 0; i < count; i++) indices[i] = i;
    for (int i = 1; i < count; i++) {
        int key = indices[i];
        int j = i - 1;
        while (j >= 0 && WiFi.RSSI(indices[j]) < WiFi.RSSI(key)) {
            indices[j + 1] = indices[j];
            j--;
        }
        indices[j + 1] = key;
    }

    // Iterate sorted, skip hidden and duplicate SSIDs
    String seen[MAX_SCAN];
    int seenCount = 0;
    String json = "[";
    bool first = true;

    for (int ii = 0; ii < count; ii++) {
        int i = indices[ii];
        String ssid = WiFi.SSID(i);
        if (ssid.length() == 0) continue;  // hidden network

        bool duplicate = false;
        for (int s = 0; s < seenCount; s++) {
            if (seen[s] == ssid) { duplicate = true; break; }
        }
        if (duplicate) continue;
        seen[seenCount++] = ssid;

        ssid.replace("\\", "\\\\");
        ssid.replace("\"", "\\\"");
        if (!first) json += ",";
        json += "{\"ssid\":\"" + ssid + "\"}";
        first = false;
    }
    json += "]";
    _webServer.sendHeader("Cache-Control", "no-cache");
    _webServer.send(200, "application/json", json);
}

/**
 * Return stored credential metadata for portal pre-fill.
 * Format: {"ssid":"...","url":"...","hasSecret":true|false}
 * The device secret is never included — only its presence is advertised.
 */
static void handleConfig() {
    DeviceCredentials creds;
    loadCredentials(&creds);
    Serial.printf("[Portal] /config: ssid=%u url=%u hasSecret=%d hasUps=%d\n",
        (unsigned)strlen(creds.wifi_ssid),
        (unsigned)strlen(creds.backend_url),
        creds.device_secret[0] != '\0',
        hasUpsModule(creds));
    // Inject CSRF token into the credentials JSON (strip trailing } and append)
    String json = buildConfigJson(creds);
    json = json.substring(0, json.length() - 1) +
           ",\"csrf\":\"" + _csrfToken + "\"}";
    _webServer.sendHeader("Cache-Control", "no-cache");
    _webServer.send(200, "application/json", json);
}

/**
 * Handle POST /save — persist credentials to NVS and reboot.
 * Expected form fields: ssid, password, secret (optional if stored), url (optional if stored)
 *
 * If secret or url are omitted/blank and a value already exists in NVS,
 * the existing value is kept — enabling re-provisioning without re-entering them.
 */
static void handleSave() {
    // Anti-CSRF: reject requests that lack a valid session token.
    // Closes CSRF-over-Wi-Fi attacks from any client already connected to the AP.
    if (!_webServer.hasArg("_csrf") || _webServer.arg("_csrf") != _csrfToken) {
        _webServer.send(403, "text/plain", "Invalid session token");
        return;
    }

    if (!_webServer.hasArg("ssid") || _webServer.arg("ssid").isEmpty()) {
        _webServer.send(400, "text/plain", "Missing ssid");
        return;
    }

    // Load existing NVS values first so we can carry forward unchanged fields
    DeviceCredentials existing;
    loadCredentials(&existing);

    DeviceCredentials submitted;
    memset(&submitted, 0, sizeof(submitted));

    _webServer.arg("ssid").toCharArray(submitted.wifi_ssid,      CRED_SSID_MAX);
    _webServer.arg("password").toCharArray(submitted.wifi_password, CRED_PASSWORD_MAX);

    bool secretProvided = _webServer.hasArg("secret") && !_webServer.arg("secret").isEmpty();
    bool urlProvided    = _webServer.hasArg("url")    && !_webServer.arg("url").isEmpty();

    if (secretProvided)
        _webServer.arg("secret").toCharArray(submitted.device_secret, CRED_SECRET_MAX);
    if (urlProvided)
        _webServer.arg("url").toCharArray(submitted.backend_url, CRED_URL_MAX);

    String channelArg = _webServer.hasArg("ota_channel") ? _webServer.arg("ota_channel") : String("");
    if (channelArg.length() > 0) {
        if (!isValidOtaChannel(channelArg.c_str())) {
            _webServer.send(400, "text/plain", "Invalid ota_channel. Must be STABLE, BETA, or ALPHA.");
            return;
        }
        channelArg.toCharArray(submitted.ota_channel, CRED_OTA_CHAN_MAX);
    }

    // Checkbox semantics: absent/unchecked means false. No "keep existing" carry-forward
    // needed (unlike secret/url) — every save explicitly states the hardware variant.
    submitted.has_ups_module = _webServer.hasArg("has_ups") && _webServer.arg("has_ups") == "1";

    DeviceCredentials merged = mergeSubmittedCredentials(existing, submitted, secretProvided, urlProvided);

    if (merged.device_secret[0] == '\0') {
        _webServer.send(400, "text/plain", "Missing secret");
        return;
    }
    if (merged.backend_url[0] == '\0') {
        _webServer.send(400, "text/plain", "Missing url");
        return;
    }

    if (!saveCredentials(&merged)) {
        _webServer.send(500, "text/plain", "Failed to save credentials");
        return;
    }

    Serial.printf("[Portal] Credentials saved for SSID: %s\n", merged.wifi_ssid);
    _webServer.send(200, "text/plain",
        "Credentials saved! Device is rebooting and will connect to " +
        _webServer.arg("ssid") + ".");

    // Allow response to flush before rebooting
    delay(500);
    ESP.restart();
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Start the captive portal in AP mode.
 *
 * Switches WiFi to AP mode, starts a DNS server that redirects all
 * hostnames to 192.168.4.1, and serves the configuration UI.
 *
 * Blocks indefinitely — exits only via ESP.restart() inside handleSave().
 *
 * @param deviceMac  Device MAC address string (e.g. "AA:BB:CC:DD:EE:FF")
 * @param led        Reference to the NeoPixel LED object for status indication
 */
inline void startCaptivePortal(const String& deviceMac, Adafruit_NeoPixel& led) {
    String ssid = buildApSsid(deviceMac);
    String pw   = buildApPassword();

    // One-time CSRF token — regenerated each AP session via hardware TRNG
    char csrfBuf[9];
    snprintf(csrfBuf, sizeof(csrfBuf), "%08X", (unsigned)esp_random());
    _csrfToken = String(csrfBuf);

    Serial.printf("[Portal] AP started: %s  password: %s\n", ssid.c_str(), pw.c_str());
    Serial.printf("[Portal] Config page: http://%s/\n", PORTAL_AP_IP_STR);

    // Switch to AP mode and configure static IP
    WiFi.mode(WIFI_AP);
    IPAddress apIp, gateway, subnet;
    apIp.fromString(PORTAL_AP_IP_STR);
    gateway.fromString(PORTAL_AP_IP_STR);
    subnet.fromString("255.255.255.0");
    WiFi.softAPConfig(apIp, gateway, subnet);
    WiFi.softAP(ssid.c_str(), pw.c_str());  // WPA2-PSK, fixed password (see PORTAL_AP_PASSWORD)

    delay(200);  // Allow AP to start before DNS binds

    // DNS wildcard: all hostnames → AP IP (triggers captive portal on phones)
    _dnsServer.start(PORTAL_DNS_PORT, "*", apIp);

    // Register HTTP routes
    _webServer.on("/",          HTTP_GET,  handleRoot);
    _webServer.on("/scan",      HTTP_GET,  handleScan);
    _webServer.on("/config",    HTTP_GET,  handleConfig);
    _webServer.on("/save",      HTTP_POST, handleSave);

    // Captive portal detection endpoints used by various OSes
    _webServer.on("/generate_204",        HTTP_GET, handleCaptiveRedirect);  // Android
    _webServer.on("/hotspot-detect.html", HTTP_GET, handleCaptiveRedirect);  // iOS/macOS
    _webServer.on("/connecttest.txt",     HTTP_GET, handleCaptiveRedirect);  // Windows
    _webServer.on("/redirect",            HTTP_GET, handleCaptiveRedirect);  // Windows
    _webServer.on("/ncsi.txt",            HTTP_GET, handleCaptiveRedirect);  // Windows
    _webServer.on("/fwlink",              HTTP_GET, handleCaptiveRedirect);  // Windows
    _webServer.onNotFound(handleCaptiveRedirect);  // Catch-all

    _webServer.begin();
    Serial.println("[Portal] Web server started.");

    // Serve requests indefinitely — only exit path is handleSave() → ESP.restart()
    while (true) {
        _dnsServer.processNextRequest();
        _webServer.handleClient();

        // Orange breathing: indicates configuration/portal mode
        tickBreathingLed(led);

        yield();  // Feed RTOS scheduler / soft WDT
    }
}

#endif  // HOMEPULSE_PORTAL_H
