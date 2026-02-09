/**
 * HomePulse Watcher - ESP32-C6 Firmware
 *
 * Power monitoring sensor that reports status changes to the backend.
 *
 * Features:
 * - Monitors GPIO for power status (HIGH = power on, LOW = power off)
 * - Sends HMAC-signed HTTP POST requests on status change
 * - NTP time synchronization for accurate timestamps
 * - LED status indication
 * - WiFi 6 support (ESP32-C6 specific)
 *
 * Hardware:
 * - ESP32-C6 SuperMini or compatible
 * - Optocoupler circuit connected to POWER_SENSE_PIN
 *
 * Configuration:
 * - config.h: Hardware settings (GPIO pins, timing)
 * - secrets.h: Credentials (WiFi, device secret, backend URL)
 *
 * HMAC Protocol:
 * - Headers: X-Device-Mac, X-Timestamp, X-Signature
 * - Payload: "MAC:TIMESTAMP:STATUS"
 * - Signature: HMAC-SHA256(secret, payload)
 */

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <time.h>
#include <mbedtls/md.h>
#include <Adafruit_NeoPixel.h>

#include "config.h"
#include "secrets.h"

// Global state
static int lastPowerStatus = -1;  // -1 = unknown, 0 = off, 1 = on
static unsigned long lastCheckTime = 0;
static bool timeInitialized = false;

// WS2812B RGB LED
static Adafruit_NeoPixel led(1, STATUS_LED_PIN, NEO_GRB + NEO_KHZ800);

/** Set WS2812 LED color */
void setLedColor(uint8_t r, uint8_t g, uint8_t b) {
    led.setPixelColor(0, led.Color(r, g, b));
    led.show();
}

/** Turn LED off */
void setLedOff() {
    led.clear();
    led.show();
}

/** Set LED to power status color (green = ON, red = OFF) */
void updateStatusLed(int powerStatus) {
    if (powerStatus == POWER_STATUS_ON) {
        setLedColor(0, 255, 0);   // Green
    } else {
        setLedColor(255, 0, 0);   // Red
    }
}

/**
 * Initialize serial and LED
 */
void setupHardware() {
    Serial.begin(115200);
    delay(1000);  // Wait for serial

    Serial.println();
    Serial.println("=================================");
    Serial.println("HomePulse Watcher - ESP32-C6");
    Serial.println("=================================");

    // Configure GPIO
    pinMode(POWER_SENSE_PIN, INPUT_PULLDOWN);

    // Initialize WS2812B RGB LED
    led.begin();
    led.setBrightness(LED_BRIGHTNESS);
    led.clear();
    led.show();

    Serial.printf("Power sense pin: GPIO%d\n", POWER_SENSE_PIN);
    Serial.printf("Status LED pin: GPIO%d\n", STATUS_LED_PIN);
}

/**
 * Connect to WiFi network
 */
bool connectWiFi() {
    Serial.printf("Connecting to WiFi: %s\n", WIFI_SSID);

    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    unsigned long startTime = millis();
    while (WiFi.status() != WL_CONNECTED) {
        if (millis() - startTime > WIFI_TIMEOUT_MS) {
            Serial.println("WiFi connection timeout!");
            return false;
        }
        static bool wifiLedOn = false;
        wifiLedOn = !wifiLedOn;
        if (wifiLedOn) setLedColor(255, 200, 0);  // Yellow
        else setLedOff();
        delay(500);
        Serial.print(".");
    }

    Serial.println();
    Serial.printf("Connected! IP: %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("MAC: %s\n", WiFi.macAddress().c_str());
    setLedOff();
    return true;
}

/**
 * Initialize NTP time synchronization
 */
bool initializeTime() {
    Serial.println("Initializing NTP time sync...");

    configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER, NTP_SERVER_2);

    // Wait for time to be set
    unsigned long startTime = millis();
    time_t now = 0;
    while (now < 1700000000) {  // Sanity check: after year 2023
        if (millis() - startTime > 30000) {
            Serial.println("NTP sync timeout!");
            return false;
        }
        delay(500);
        time(&now);
        Serial.print(".");
    }

    Serial.println();
    Serial.printf("Time synchronized: %lu\n", (unsigned long)now);
    return true;
}

/**
 * Compute HMAC-SHA256 signature
 *
 * @param payload String to sign (format: "MAC:TIMESTAMP:STATUS")
 * @param output Buffer for hex signature (must be at least 65 bytes)
 */
void computeHmacSignature(const char* payload, char* output) {
    uint8_t hash[32];

    mbedtls_md_context_t ctx;
    mbedtls_md_init(&ctx);
    mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), 1);
    mbedtls_md_hmac_starts(&ctx, (const unsigned char*)DEVICE_SECRET, strlen(DEVICE_SECRET));
    mbedtls_md_hmac_update(&ctx, (const unsigned char*)payload, strlen(payload));
    mbedtls_md_hmac_finish(&ctx, hash);
    mbedtls_md_free(&ctx);

    // Convert to hex string
    for (int i = 0; i < 32; i++) {
        sprintf(output + (i * 2), "%02x", hash[i]);
    }
    output[64] = '\0';
}

/**
 * Send power status to backend
 *
 * @param status Power status (0 = off, 1 = on)
 * @return true if request succeeded
 */
bool sendPowerStatus(int status) {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("WiFi not connected!");
        return false;
    }

    // Get current timestamp
    time_t timestamp;
    time(&timestamp);

    if (timestamp < 1700000000) {
        Serial.println("Invalid timestamp - NTP not synced");
        return false;
    }

    // Build payload for HMAC: "MAC:TIMESTAMP:STATUS"
    char payload[128];
    snprintf(payload, sizeof(payload), "%s:%lu:%d",
             DEVICE_MAC, (unsigned long)timestamp, status);

    // Compute signature
    char signature[65];
    computeHmacSignature(payload, signature);

    Serial.printf("Sending status: %d\n", status);
    Serial.printf("Timestamp: %lu\n", (unsigned long)timestamp);
    Serial.printf("Payload: %s\n", payload);

    // Send HTTP POST request
    HTTPClient http;
    http.begin(BACKEND_URL);
    http.setTimeout(HTTP_TIMEOUT_MS);

    // Set headers
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Device-Mac", DEVICE_MAC);
    http.addHeader("X-Timestamp", String((unsigned long)timestamp));
    http.addHeader("X-Signature", signature);

    // Build JSON body
    char body[64];
    snprintf(body, sizeof(body), "{\"status\":%d}", status);

    // Send request
    setLedColor(0, 0, 255);  // Blue during request
    int httpCode = http.POST(body);
    updateStatusLed(status);

    if (httpCode > 0) {
        Serial.printf("HTTP Response: %d\n", httpCode);
        if (httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_CREATED) {
            String response = http.getString();
            Serial.printf("Response: %s\n", response.c_str());
            http.end();
            return true;
        }
    } else {
        Serial.printf("HTTP Error: %s\n", http.errorToString(httpCode).c_str());
    }

    http.end();
    return false;
}

/**
 * Read current power status with debouncing
 *
 * @return 0 (power off) or 1 (power on)
 */
int readPowerStatus() {
    // Read multiple times for debouncing
    int readings = 0;
    for (int i = 0; i < 5; i++) {
        readings += digitalRead(POWER_SENSE_PIN);
        delay(DEBOUNCE_MS / 5);
    }

    // Majority vote
    return (readings >= 3) ? POWER_STATUS_ON : POWER_STATUS_OFF;
}

void setup() {
    setupHardware();

    if (!connectWiFi()) {
        Serial.println("Failed to connect to WiFi. Restarting...");
        delay(5000);
        ESP.restart();
    }

    if (!initializeTime()) {
        Serial.println("Failed to sync time. Restarting...");
        delay(5000);
        ESP.restart();
    }

    timeInitialized = true;

    // Read initial status and send
    lastPowerStatus = readPowerStatus();
    Serial.printf("Initial power status: %d\n", lastPowerStatus);
    updateStatusLed(lastPowerStatus);

    if (!sendPowerStatus(lastPowerStatus)) {
        Serial.println("Failed to send initial status");
    }

    Serial.println("Setup complete. Monitoring power status...");
}

void loop() {
    // Check WiFi connection
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("WiFi disconnected. Reconnecting...");
        if (!connectWiFi()) {
            delay(RETRY_DELAY_MS);
            return;
        }
    }

    // Check power status at configured interval
    unsigned long currentTime = millis();
    if (currentTime - lastCheckTime >= CHECK_INTERVAL_MS) {
        lastCheckTime = currentTime;

        int currentStatus = readPowerStatus();

        // Report if status changed
        if (currentStatus != lastPowerStatus) {
            Serial.printf("Power status changed: %d -> %d\n", lastPowerStatus, currentStatus);
            updateStatusLed(currentStatus);

            if (sendPowerStatus(currentStatus)) {
                lastPowerStatus = currentStatus;
                Serial.println("Status update sent successfully");
            } else {
                Serial.println("Failed to send status update, will retry");
            }
        }
    }

#ifdef ENABLE_DEEP_SLEEP
    // Enter deep sleep for battery operation
    Serial.println("Entering deep sleep...");
    esp_sleep_enable_timer_wakeup(DEEP_SLEEP_DURATION_US);
    esp_deep_sleep_start();
#endif
}
