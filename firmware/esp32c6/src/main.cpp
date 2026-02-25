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
 * - 10k/10k voltage divider + 0.1µF cap on POWER_SENSE_PIN (V2.1)
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
// DEV: HTTP (local development) — active by default
#include <WiFiClient.h>
// PROD: HTTPS (Cloud Run) — uncomment below, comment above
// #include <WiFiClientSecure.h>
#include <time.h>
#include <mbedtls/md.h>
#include <esp_task_wdt.h>
#include <Adafruit_NeoPixel.h>

#include "config.h"
#include "secrets.h"

// Global state
static int lastPowerStatus = -1;  // -1 = unknown, 0 = off, 1 = on
static unsigned long lastCheckTime = 0;
static bool timeInitialized = false;
static int wifiFailureCount = 0;
static int lastAdcValue = 0;               // Most recent averaged ADC reading

// Confirmation state (2 consecutive reads to confirm)
static int consecutiveNewState = 0;        // Consecutive reads of a new state
static int pendingStatus = -1;             // What that new state is (-1 = none)

// Messaging state (decoupled from internal state)
static unsigned long lastSendTime = 0;     // Last successful HTTP send
static unsigned long lastHeartbeatTime = 0; // Last heartbeat send

// WS2812B RGB LED
static Adafruit_NeoPixel led(1, STATUS_LED_PIN, NEO_GRB + NEO_KHZ800);

// DEV: HTTP client (local development) — active by default
static WiFiClient client;
// PROD: HTTPS client — uncomment below, comment above
// static WiFiClientSecure secureClient;

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
    Serial.println("Firmware: v" FIRMWARE_VERSION);
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
 * Read averaged ADC value from power sense pin.
 * Takes ADC_SAMPLES readings with ADC_SAMPLE_DELAY_MS between each.
 *
 * @return Averaged 12-bit ADC value (0-4095)
 */
int readAdcAverage() {
    long sum = 0;
    for (int i = 0; i < ADC_SAMPLES; i++) {
        sum += analogRead(POWER_SENSE_PIN);
        delay(ADC_SAMPLE_DELAY_MS);
    }
    return (int)(sum / ADC_SAMPLES);
}

/**
 * Convert ADC value to power status with hysteresis.
 * - Above ADC_THRESHOLD_HIGH: power ON
 * - Below ADC_THRESHOLD_LOW: power OFF
 * - In between (brownout band): retain current state
 *
 * @param adcValue Averaged ADC reading
 * @param currentStatus Current known power status
 * @return Resolved power status
 */
int adcToStatus(int adcValue, int currentStatus) {
    if (adcValue >= ADC_THRESHOLD_HIGH) {
        return POWER_STATUS_ON;
    }
    if (adcValue <= ADC_THRESHOLD_LOW) {
        return POWER_STATUS_OFF;
    }
    // Hysteresis band: keep current state (brownout ignored)
    return (currentStatus >= 0) ? currentStatus : POWER_STATUS_ON;
}

/**
 * Send power status to backend
 *
 * @param status Power status (0 = off, 1 = on)
 * @param adcValue ADC reading for voltage diagnostics
 * @return true if request succeeded
 */
bool sendPowerStatus(int status, int adcValue) {
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
    // DEV: HTTP (local development) — active by default
    http.begin(client, BACKEND_URL);
    // PROD: HTTPS — uncomment below, comment above
    // http.begin(secureClient, BACKEND_URL);
    http.setTimeout(HTTP_TIMEOUT_MS);

    // Set headers
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Device-Mac", DEVICE_MAC);
    http.addHeader("X-Timestamp", String((unsigned long)timestamp));
    http.addHeader("X-Signature", signature);

    // Build JSON body (voltage and firmwareVersion are informational, not part of HMAC payload)
    char body[128];
    snprintf(body, sizeof(body), "{\"status\":%d,\"voltage\":%d,\"firmwareVersion\":\"%s\"}", status, adcValue, FIRMWARE_VERSION);

    // Send request
    setLedColor(0, 0, 255);  // Blue during request
    int httpCode = http.POST(body);
    updateStatusLed(status);

    if (httpCode > 0) {
        String response = http.getString();
        Serial.printf("HTTP %d: %s\n", httpCode, response.c_str());
        if (httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_CREATED) {
            http.end();
            return true;
        }
    } else {
        Serial.printf("HTTP Error: %s\n", http.errorToString(httpCode).c_str());
    }

    http.end();
    return false;
}

void setup() {
    setupHardware();

    if (!connectWiFi()) {
        Serial.println("Failed to connect to WiFi. Restarting...");
        delay(5000);
        ESP.restart();
    }

    // DEV: HTTP — no TLS setup needed
    // PROD: HTTPS — uncomment below
    // secureClient.setInsecure();

    if (!initializeTime()) {
        Serial.println("Failed to sync time. Restarting...");
        delay(5000);
        ESP.restart();
    }

    timeInitialized = true;

    // Configure ADC (12-bit resolution, 11dB attenuation for 0-3.3V range)
    analogReadResolution(12);
    analogSetAttenuation(ADC_11db);

    // Read initial status and send
    lastAdcValue = readAdcAverage();
    lastPowerStatus = adcToStatus(lastAdcValue, -1);
    Serial.printf("Initial ADC: %d, power status: %d\n", lastAdcValue, lastPowerStatus);
    updateStatusLed(lastPowerStatus);

    if (sendPowerStatus(lastPowerStatus, lastAdcValue)) {
        lastSendTime = millis();
    } else {
        Serial.println("Failed to send initial status");
    }
    lastHeartbeatTime = millis();

    // Initialize hardware watchdog timer
    esp_task_wdt_config_t wdtConfig = {
        .timeout_ms = WATCHDOG_TIMEOUT_S * 1000,
        .idle_core_mask = 0,
        .trigger_panic = true,
    };
    esp_task_wdt_reconfigure(&wdtConfig);
    esp_task_wdt_add(NULL);
    Serial.printf("Watchdog reconfigured: %ds timeout\n", WATCHDOG_TIMEOUT_S);

    Serial.println("Setup complete. Monitoring power status...");
}

void loop() {
    // Feed hardware watchdog — if loop() hangs, device auto-reboots
    esp_task_wdt_reset();

    // Periodic reboot for long-term stability
    if (millis() >= REBOOT_INTERVAL_MS) {
        Serial.println("Periodic reboot (48h uptime reached). Restarting...");
        ESP.restart();
    }

    // Check WiFi connection
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("WiFi disconnected. Reconnecting...");
        if (!connectWiFi()) {
            wifiFailureCount++;
            Serial.printf("WiFi failure count: %d/%d\n", wifiFailureCount, MAX_WIFI_FAILURES);
            if (wifiFailureCount >= MAX_WIFI_FAILURES) {
                Serial.println("Too many WiFi failures. Restarting...");
                ESP.restart();
            }
            delay(RETRY_DELAY_MS);
            return;
        }
        wifiFailureCount = 0;
    }

    // Check power status at configured interval
    unsigned long currentTime = millis();
    if (currentTime - lastCheckTime >= CHECK_INTERVAL_MS) {
        lastCheckTime = currentTime;

        lastAdcValue = readAdcAverage();
        int resolvedStatus = adcToStatus(lastAdcValue, lastPowerStatus);

        // Determine ADC threshold band for diagnostics
        const char* adcBand = (lastAdcValue >= ADC_THRESHOLD_HIGH) ? ">HIGH" :
                              (lastAdcValue <= ADC_THRESHOLD_LOW)  ? "<LOW"  : "HYSTERESIS";

        if (resolvedStatus != lastPowerStatus) {
            // Status differs — start/continue confirmation
            if (resolvedStatus == pendingStatus) {
                consecutiveNewState++;
            } else {
                pendingStatus = resolvedStatus;
                consecutiveNewState = 1;
            }

            Serial.printf("Confirm %d->%d: %d/%d (ADC: %d [%s])\n",
                lastPowerStatus, resolvedStatus, consecutiveNewState, CONFIRMATION_READS,
                lastAdcValue, adcBand);

            if (consecutiveNewState >= CONFIRMATION_READS) {
                // State confirmed — always update internal state and LED
                Serial.printf("State confirmed: %d -> %d (ADC: %d [%s])\n",
                    lastPowerStatus, pendingStatus, lastAdcValue, adcBand);
                lastPowerStatus = pendingStatus;
                updateStatusLed(lastPowerStatus);

                // Reset confirmation
                pendingStatus = -1;
                consecutiveNewState = 0;

                // Send HTTP only if cooldown elapsed
                if (currentTime - lastSendTime >= MIN_STATE_CHANGE_MS) {
                    if (sendPowerStatus(lastPowerStatus, lastAdcValue)) {
                        lastSendTime = currentTime;
                        Serial.println("Status update sent successfully");
                    } else {
                        Serial.println("Failed to send status update, heartbeat will resync");
                    }
                } else {
                    Serial.printf("Cooldown active (%lums since last send), state updated locally\n",
                        currentTime - lastSendTime);
                }
            }
        } else {
            // Status matches confirmed state — reset any pending confirmation
            if (pendingStatus != -1) {
                Serial.printf("Pending state %d cleared (ADC: %d [%s])\n",
                    pendingStatus, lastAdcValue, adcBand);
                pendingStatus = -1;
                consecutiveNewState = 0;
            }
        }
    }

    // Heartbeat — periodic sync to backend
    if (currentTime - lastHeartbeatTime >= HEARTBEAT_INTERVAL_MS) {
        lastHeartbeatTime = currentTime;
        Serial.printf("Heartbeat: status=%d, ADC=%d\n", lastPowerStatus, lastAdcValue);
        if (sendPowerStatus(lastPowerStatus, lastAdcValue)) {
            lastSendTime = currentTime;
            Serial.println("Heartbeat sent");
        } else {
            Serial.println("Heartbeat failed, will retry next interval");
        }
    }

#ifdef ENABLE_DEEP_SLEEP
    // Enter deep sleep for battery operation
    Serial.println("Entering deep sleep...");
    esp_sleep_enable_timer_wakeup(DEEP_SLEEP_DURATION_US);
    esp_deep_sleep_start();
#endif
}
