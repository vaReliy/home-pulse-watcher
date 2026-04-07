#ifndef PORTAL_H
#define PORTAL_H

#include <Arduino.h>
#include <WiFi.h>
#include <DNSServer.h>
#include <WebServer.h>
#include <Adafruit_NeoPixel.h>

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


// ─── Internal state ───────────────────────────────────────────────────────────

static DNSServer  _dnsServer;
static WebServer  _webServer(PORTAL_HTTP_PORT);

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
 * Format: [{"ssid":"Name","rssi":-60,"secure":true}, ...]
 * Sorted by signal strength (strongest first).
 */
static void handleScan() {
    int n = WiFi.scanNetworks();
    String json = "[";
    if (n > 0) {
        for (int i = 0; i < n; i++) {
            if (i > 0) json += ",";
            String ssid = WiFi.SSID(i);
            // Escape quotes and backslashes in SSID to produce valid JSON
            ssid.replace("\\", "\\\\");
            ssid.replace("\"", "\\\"");
            bool secure = (WiFi.encryptionType(i) != WIFI_AUTH_OPEN);
            json += "{\"ssid\":\"" + ssid + "\",\"rssi\":" +
                    String(WiFi.RSSI(i)) + ",\"secure\":" +
                    (secure ? "true" : "false") + "}";
        }
    }
    json += "]";
    _webServer.sendHeader("Cache-Control", "no-cache");
    _webServer.send(200, "application/json", json);
}

/**
 * Handle POST /save — persist credentials to NVS and reboot.
 * Expected form fields: ssid, password, secret, url
 */
static void handleSave() {
    if (!_webServer.hasArg("ssid") || _webServer.arg("ssid").isEmpty()) {
        _webServer.send(400, "text/plain", "Missing ssid");
        return;
    }
    if (!_webServer.hasArg("secret") || _webServer.arg("secret").isEmpty()) {
        _webServer.send(400, "text/plain", "Missing secret");
        return;
    }
    if (!_webServer.hasArg("url") || _webServer.arg("url").isEmpty()) {
        _webServer.send(400, "text/plain", "Missing url");
        return;
    }

    DeviceCredentials creds;
    memset(&creds, 0, sizeof(creds));

    _webServer.arg("ssid").toCharArray(creds.wifi_ssid,      CRED_SSID_MAX);
    _webServer.arg("password").toCharArray(creds.wifi_password, CRED_PASSWORD_MAX);
    _webServer.arg("secret").toCharArray(creds.device_secret, CRED_SECRET_MAX);
    _webServer.arg("url").toCharArray(creds.backend_url,      CRED_URL_MAX);

    if (!saveCredentials(&creds)) {
        _webServer.send(500, "text/plain", "Failed to save credentials");
        return;
    }

    Serial.printf("[Portal] Credentials saved for SSID: %s\n", creds.wifi_ssid);
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
    Serial.printf("[Portal] Starting AP: %s\n", ssid.c_str());
    Serial.printf("[Portal] Config page: http://%s/\n", PORTAL_AP_IP_STR);

    // Switch to AP mode and configure static IP
    WiFi.mode(WIFI_AP);
    IPAddress apIp, gateway, subnet;
    apIp.fromString(PORTAL_AP_IP_STR);
    gateway.fromString(PORTAL_AP_IP_STR);
    subnet.fromString("255.255.255.0");
    WiFi.softAPConfig(apIp, gateway, subnet);
    WiFi.softAP(ssid.c_str());  // Open network — no password for easy first-time setup

    delay(200);  // Allow AP to start before DNS binds

    // DNS wildcard: all hostnames → AP IP (triggers captive portal on phones)
    _dnsServer.start(PORTAL_DNS_PORT, "*", apIp);

    // Register HTTP routes
    _webServer.on("/",          HTTP_GET,  handleRoot);
    _webServer.on("/scan",      HTTP_GET,  handleScan);
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

#endif  // PORTAL_H
