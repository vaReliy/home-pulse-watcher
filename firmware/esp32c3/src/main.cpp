/**
 * HomePulse Watcher - ESP32-C3 Firmware
 *
 * Power monitoring sensor that reports status changes to the backend.
 *
 * Features:
 * - Monitors GPIO for power status (HIGH = power on, LOW = power off)
 * - Sends HMAC-signed HTTP POST requests on status change
 * - NTP time synchronization for accurate timestamps
 * - LED status indication
 *
 * Hardware:
 * - ESP32-C3 SuperMini or compatible
 * - 10k/10k voltage divider + 0.1µF cap on POWER_SENSE_PIN (V2.1)
 *
 * Configuration:
 * - config.h: Hardware settings (GPIO pins, timing)
 * - credentials.h: NVS credential loader (WiFi, device secret, backend URL)
 * - secrets.h (optional): Compile-time fallback for first-boot NVS provisioning
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
#include <esp_idf_version.h>
#include <Adafruit_NeoPixel.h>

#include "config.h"
#include <HomePulse/credentials.h>
#include <HomePulse/led.h>
#include <HomePulse/portal.h>
#include <HomePulse/reset.h>
#include <HomePulse/SecurityUtils.h>
#include <HomePulse/PowerUtils.h>
#if HAS_UPS_MODULE
#include <HomePulse/BatteryUtils.h>
#endif

// Optional: when secrets.h is present at compile time, its values are used to
// auto-provision NVS on first boot (convenient for development).
#if __has_include("secrets.h")
#include "secrets.h"
#define HAS_COMPILE_TIME_SECRETS
#endif

// Credentials loaded from NVS at boot
static DeviceCredentials creds;
static String deviceMac;  // Read from hardware in setup() via WiFi.macAddress()

// Global state
static int lastPowerStatus = POWER_STATUS_UNKNOWN;  // Unknown at boot
static unsigned long lastCheckTime = 0;
static bool timeInitialized = false;
static int wifiFailureCount = 0;
static int lastAdcValue = 0;               // Most recent averaged ADC reading

#if HAS_UPS_MODULE
static int lastBatteryAdcValue = 0;        // Most recent battery ADC reading
static unsigned long lastSosTime = 0;      // Last SOS ping timestamp (for cooldown)
#endif

// Confirmation state (2 consecutive reads to confirm)
static int consecutiveNewState = 0;        // Consecutive reads of a new state
static int pendingStatus = POWER_STATUS_UNKNOWN;  // What that new state is (UNKNOWN = none)

// Messaging state (decoupled from internal state)
static unsigned long lastSendTime = 0;     // Last successful HTTP send
static unsigned long lastHeartbeatTime = 0; // Last heartbeat send

// WS2812B RGB LED
static Adafruit_NeoPixel led(LED_COUNT, STATUS_LED_PIN, NEO_GRB + NEO_KHZ800);

// DEV: HTTP client (local development) — active by default
static WiFiClient client;
// PROD: HTTPS client — uncomment below, comment above
// static WiFiClientSecure secureClient;


/**
 * Initialize serial and LED
 */
void setupHardware() {
    Serial.begin(SERIAL_BAUD_RATE);
    delay(SERIAL_INIT_DELAY_MS);  // Wait for serial

    Serial.println();
    Serial.println("=================================");
    Serial.println("HomePulse Watcher - ESP32-C3");
    Serial.println("Firmware: v" FIRMWARE_VERSION);
    Serial.println("=================================");

    // Configure GPIO
    pinMode(POWER_SENSE_PIN, INPUT_PULLDOWN);
#if HAS_UPS_MODULE
    pinMode(BATTERY_SENSE_PIN, INPUT);
#endif

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
    Serial.printf("Connecting to WiFi: %s\n", creds.wifi_ssid);

    WiFi.begin(creds.wifi_ssid, creds.wifi_password);

    unsigned long startTime = millis();
    while (WiFi.status() != WL_CONNECTED) {
        if (millis() - startTime > WIFI_TIMEOUT_MS) {
            Serial.println("WiFi connection timeout!");
            return false;
        }
        static bool wifiLedOn = false;
        wifiLedOn = !wifiLedOn;
        if (wifiLedOn) setLedColor(led, 255, 200, 0);  // Yellow
        else setLedOff(led);
        delay(WIFI_BLINK_INTERVAL_MS);
        Serial.print(".");
    }

    Serial.println();
    Serial.printf("Connected! IP: %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("MAC: %s\n", WiFi.macAddress().c_str());
    setLedOff(led);
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
    while (now < MIN_VALID_EPOCH) {  // Sanity check: after year 2023
        if (millis() - startTime > NTP_SYNC_TIMEOUT_MS) {
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

#if HAS_UPS_MODULE
/**
 * Read averaged battery voltage from GPIO3 (100k/100k divider).
 * Takes BATTERY_ADC_SAMPLES readings and returns millivolts.
 *
 * Uses analogReadMilliVolts() for factory-calibrated ADC linearity correction,
 * then multiplies by divider ratio 2 (100k/100k symmetric divider).
 *
 * @return Battery voltage in millivolts
 */
int readBatteryVoltage() {
    long sum = 0;
    for (int i = 0; i < BATTERY_ADC_SAMPLES; i++) {
        sum += analogReadMilliVolts(BATTERY_SENSE_PIN);
        delay(BATTERY_ADC_SAMPLE_DELAY_MS);
    }
    int mvAvg = (int)(sum / BATTERY_ADC_SAMPLES);
    return HomePulse::calculateBatteryMv(mvAvg);
}
#endif

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

    if (timestamp < MIN_VALID_EPOCH) {
        Serial.println("Invalid timestamp - NTP not synced");
        return false;
    }

    // Build payload for HMAC: "MAC:TIMESTAMP:STATUS"
    char payload[HMAC_PAYLOAD_BUFFER];
    snprintf(payload, sizeof(payload), "%s:%lu:%d",
             deviceMac.c_str(), (unsigned long)timestamp, status);

    // Compute signature
    String signature = HomePulse::calculateSignature(String(payload), creds.device_secret);

    Serial.printf("Sending status: %d\n", status);
    Serial.printf("Timestamp: %lu\n", (unsigned long)timestamp);
    Serial.printf("Payload: %s\n", payload);

    // Send HTTP POST request
    HTTPClient http;
    // DEV: HTTP (local development) — active by default
    http.begin(client, creds.backend_url);
    // PROD: HTTPS — uncomment below, comment above
    // http.begin(secureClient, BACKEND_URL);
    http.setTimeout(HTTP_TIMEOUT_MS);

    // Set headers
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Device-Mac", deviceMac.c_str());
    http.addHeader("X-Timestamp", String((unsigned long)timestamp));
    http.addHeader("X-Signature", signature);

    // Build JSON body (voltage and firmwareVersion are informational, not part of HMAC payload)
    char body[JSON_BODY_BUFFER];
#if HAS_UPS_MODULE
    snprintf(body, sizeof(body),
        "{\"status\":%d,\"voltage\":%d,\"firmwareVersion\":\"%s\",\"batteryVoltage\":%d}",
        status, adcValue, FIRMWARE_VERSION, lastBatteryAdcValue);
#else
    snprintf(body, sizeof(body),
        "{\"status\":%d,\"voltage\":%d,\"firmwareVersion\":\"%s\"}",
        status, adcValue, FIRMWARE_VERSION);
#endif

    // Send request
    setLedColor(led, 0, 0, 255);  // Blue during request
    int httpCode = http.POST(body);
    updateStatusLed(led, status);

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
    initResetButton();

    // Read hardware MAC address (requires WIFI_STA mode to be set first)
    WiFi.mode(WIFI_STA);
    deviceMac = WiFi.macAddress();
    Serial.printf("Hardware MAC: %s\n", deviceMac.c_str());

    // Load credentials from NVS
    if (!loadCredentials(&creds)) {
#ifdef HAS_COMPILE_TIME_SECRETS
        // First boot with secrets.h present — auto-provision NVS from compile-time values
        Serial.println("NVS empty, provisioning from compile-time secrets...");
        strncpy(creds.wifi_ssid,      WIFI_SSID,      CRED_SSID_MAX - 1);
        strncpy(creds.wifi_password,  WIFI_PASSWORD,  CRED_PASSWORD_MAX - 1);
        strncpy(creds.device_secret,  DEVICE_SECRET,  CRED_SECRET_MAX - 1);
        strncpy(creds.backend_url,    BACKEND_URL,    CRED_URL_MAX - 1);
        saveCredentials(&creds);
        Serial.println("Credentials saved to NVS.");
#else
        // No credentials configured — start captive portal for provisioning
        Serial.println("No credentials found. Starting captive portal...");
        startCaptivePortal(deviceMac, led);
        // Never returns — reboots after user saves credentials
#endif
    }

    Serial.printf("WiFi SSID: %s\n", creds.wifi_ssid);
    Serial.printf("Backend URL: %s\n", creds.backend_url);
    Serial.printf("Device secret: [%d chars]\n", (int)strlen(creds.device_secret));

    if (!connectWiFi()) {
        // WiFi unavailable — retry for 5 minutes before giving up.
        // Credentials are preserved: this may be a temporary outage (router reboot, ISP hiccup).
        // The captive portal ONLY opens when NVS is truly empty; never on a transient WiFi failure.
        Serial.println("WiFi connection failed. Retrying for 5 minutes...");
        bool connected = false;
        unsigned long retryStart = millis();
        while (millis() - retryStart < WIFI_RETRY_DURATION_MS) {
            delay(RETRY_DELAY_MS);
            Serial.printf("WiFi retry (%lus elapsed)...\n", (millis() - retryStart) / MS_PER_SECOND);
            if (connectWiFi()) { connected = true; break; }
        }
        if (!connected) {
            Serial.println("WiFi unavailable after 5 minutes. Restarting to retry...");
            delay(RESTART_DELAY_MS);
            ESP.restart();
        }
    }

    // DEV: HTTP — no TLS setup needed
    // PROD: HTTPS — uncomment below
    // secureClient.setInsecure();

    if (!initializeTime()) {
        Serial.println("Failed to sync time. Restarting...");
        delay(RESTART_DELAY_MS);
        ESP.restart();
    }

    timeInitialized = true;

    // Configure ADC (12-bit resolution, 11dB attenuation for 0-3.3V range)
    analogReadResolution(ADC_RESOLUTION_BITS);
    analogSetAttenuation(ADC_11db);

    // Read initial status and send
    lastAdcValue = readAdcAverage();
    lastPowerStatus = HomePulse::computePowerStatus(lastAdcValue, HomePulse::kPowerStatusUnknown);
    Serial.printf("Initial ADC: %d, power status: %d\n", lastAdcValue, lastPowerStatus);
    updateStatusLed(led, lastPowerStatus);

    // Send initial status with retries (first TCP connection after WiFi often fails — ARP not yet cached)
    bool initialSendOk = false;
    for (int attempt = 1; attempt <= INITIAL_SEND_RETRIES; attempt++) {
        if (sendPowerStatus(lastPowerStatus, lastAdcValue)) {
            lastSendTime = millis();
            initialSendOk = true;
            break;
        }
        if (attempt < INITIAL_SEND_RETRIES) {
            Serial.printf("Initial send attempt %d/%d failed, retrying in %ds...\n",
                attempt, INITIAL_SEND_RETRIES, INITIAL_SEND_RETRY_DELAY_MS / MS_PER_SECOND);
            delay(INITIAL_SEND_RETRY_DELAY_MS);
        }
    }
    if (!initialSendOk) {
        Serial.println("Failed to send initial status after retries, heartbeat will resync");
    }
    lastHeartbeatTime = millis();

    // Initialize hardware watchdog timer
    esp_task_wdt_config_t wdtConfig = {
        .timeout_ms = WATCHDOG_TIMEOUT_S * MS_PER_SECOND,
        .idle_core_mask = 0,
        .trigger_panic = true,
    };
#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 2, 0)
    esp_task_wdt_reconfigure(&wdtConfig);
#else
    esp_task_wdt_init(&wdtConfig);
#endif
    esp_task_wdt_add(NULL);
    Serial.printf("Watchdog configured: %ds timeout\n", WATCHDOG_TIMEOUT_S);

    Serial.println("Setup complete. Monitoring power status...");
}

void loop() {
    // Feed hardware watchdog — if loop() hangs, device auto-reboots
    esp_task_wdt_reset();

    // Check BOOT button for factory reset (hold 10s)
    pollResetButton(led, lastPowerStatus);

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
        int resolvedStatus = HomePulse::computePowerStatus(lastAdcValue, lastPowerStatus);

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
                updateStatusLed(led, lastPowerStatus);

                // Reset confirmation
                pendingStatus = POWER_STATUS_UNKNOWN;
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
            if (pendingStatus != POWER_STATUS_UNKNOWN) {
                Serial.printf("Pending state %d cleared (ADC: %d [%s])\n",
                    pendingStatus, lastAdcValue, adcBand);
                pendingStatus = POWER_STATUS_UNKNOWN;
                consecutiveNewState = 0;
            }
        }
    }

    // Heartbeat — periodic sync to backend
    if (currentTime - lastHeartbeatTime >= HEARTBEAT_INTERVAL_MS) {
        lastHeartbeatTime = currentTime;
#if HAS_UPS_MODULE
        lastBatteryAdcValue = readBatteryVoltage();
        Serial.printf("Heartbeat: status=%d, ADC=%d, battery=%dmV\n", lastPowerStatus, lastAdcValue, lastBatteryAdcValue);
#else
        Serial.printf("Heartbeat: status=%d, ADC=%d\n", lastPowerStatus, lastAdcValue);
#endif
        if (sendPowerStatus(lastPowerStatus, lastAdcValue)) {
            lastSendTime = currentTime;
            Serial.println("Heartbeat sent");
        } else {
            Serial.println("Heartbeat failed, will retry next interval");
        }
    }

#if HAS_UPS_MODULE
    // SOS — battery low alert during power outage
    if (lastPowerStatus == POWER_STATUS_OFF) {
        lastBatteryAdcValue = readBatteryVoltage();
        if (lastBatteryAdcValue > 0 && lastBatteryAdcValue < BATTERY_VOLTAGE_LOW_MV) {
            if (currentTime - lastSosTime >= SOS_COOLDOWN_MS) {
                lastSosTime = currentTime;
                Serial.printf("SOS: battery low %dmV (threshold %dmV)\n", lastBatteryAdcValue, BATTERY_VOLTAGE_LOW_MV);
                if (sendPowerStatus(lastPowerStatus, lastAdcValue)) {
                    lastSendTime = currentTime;
                    Serial.println("SOS ping sent");
                } else {
                    Serial.println("SOS ping failed");
                }
            }
        }
    }
#endif

#ifdef ENABLE_DEEP_SLEEP
    // Enter deep sleep for battery operation
    Serial.println("Entering deep sleep...");
    esp_sleep_enable_timer_wakeup(DEEP_SLEEP_DURATION_US);
    esp_deep_sleep_start();
#endif
}
