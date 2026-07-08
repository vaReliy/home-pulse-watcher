/**
 * HomePulse Watcher - Shared Firmware
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
 * - ESP32-C3 or ESP32-C6 SuperMini (selected via BOARD_TYPE in config.h)
 * - 10k/10k voltage divider + 0.1µF cap on POWER_SENSE_PIN (V2.1)
 *
 * Configuration:
 * - config.h: Hardware settings (GPIO pins, timing, BOARD_TYPE)
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
#include <time.h>
#include <mbedtls/md.h>
#include <esp_task_wdt.h>
#include <esp_idf_version.h>
#include <Adafruit_NeoPixel.h>
#include <ArduinoJson.h>

#include "config.h"
#include <HomePulse/credentials.h>
#include <HomePulse/led.h>
#include <HomePulse/ota.h>
#include <HomePulse/portal.h>
#include <HomePulse/reset.h>
#include <HomePulse/SecurityUtils.h>
#include <HomePulse/PowerUtils.h>
#include <HomePulse/telemetry.h>
#include <HomePulse/telemetry_http.h>
#include <HomePulse/transport_client.h>
#include <HomePulse/debounce.h>
// UPS/battery support is always compiled in — one binary now serves both
// UPS and MAINS-only hardware; hasUpsModule(creds) gates it at runtime
// instead of a compile-time HAS_UPS_MODULE #define (see credentials.h).
#include <HomePulse/BatteryUtils.h>

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

// Battery state — always declared (single binary covers both hw variants);
// stays at its 0 initializer and is simply never read on MAINS-only devices.
static int lastBatteryAdcValue = 0;        // Most recent battery ADC reading
static unsigned long lastSosTime = 0;      // Last SOS ping timestamp (for cooldown)

// Confirmation state (2 consecutive reads to confirm)
static HomePulse::DebounceState debounceState{POWER_STATUS_ON, HomePulse::kDebounceIdle, 0};

// Messaging state (decoupled from internal state)
static unsigned long lastSendTime = 0;     // Last successful HTTP send
static unsigned long lastHeartbeatTime = 0; // Last heartbeat send

// OTA state
static bool bootWasPendingValidation = false;
static bool otaValidated = false;
static uint32_t heartbeatsSinceBoot = 0;  // counts successful backend contacts for grace-period validation
static unsigned long lastOtaCheckTime = 0;

// WS2812B RGB LED
static Adafruit_NeoPixel led(LED_COUNT, STATUS_LED_PIN, NEO_GRB + NEO_KHZ800);

// Transport client (plaintext or TLS selected at compile time via HPW_USE_TLS
// — see HomePulse/transport_client.h). Single shared instance reused by both
// telemetry POST (sendPowerStatus) and OTA-check POST (Ota::checkForUpdate)
// instead of holding two concurrent TLS sessions — matters for heap headroom
// on the C3's 400KB RAM.
static HomePulse::TransportClient client;


/**
 * Initialize serial and LED
 */
void setupHardware() {
    Serial.begin(SERIAL_BAUD_RATE);
    delay(SERIAL_INIT_DELAY_MS);  // Wait for serial

    Serial.println();
    Serial.println("=================================");
    Serial.printf("HomePulse Watcher - %s\n", BOARD_TYPE);
    Serial.println("Firmware: v" FIRMWARE_VERSION);
    Serial.println("=================================");

    // Configure GPIO
    pinMode(POWER_SENSE_PIN, INPUT_PULLDOWN);
    // Configured unconditionally: this runs in setupHardware(), before NVS
    // credentials (incl. the UPS flag) are loaded in setup(). Setting an
    // unused analog pin to INPUT is a no-op on MAINS-only hardware.
    pinMode(BATTERY_SENSE_PIN, INPUT);

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

/**
 * Read averaged battery voltage from GPIO3 (100k/100k divider).
 * Takes BATTERY_ADC_SAMPLES readings and returns millivolts.
 *
 * Uses analogReadMilliVolts() for factory-calibrated ADC linearity correction,
 * then scales by the hardware divider ratio (BATTERY_DIVIDER_RATIO_NUM / BATTERY_DIVIDER_RATIO_DEN).
 *
 * Only meaningful when hasUpsModule(creds) is true — callers gate on that at
 * runtime. Always compiled in (one binary covers both hw variants).
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
    return HomePulse::calculateBatteryMv(mvAvg, BATTERY_DIVIDER_RATIO_NUM, BATTERY_DIVIDER_RATIO_DEN);
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

    time_t timestamp;
    time(&timestamp);
    if (timestamp < MIN_VALID_EPOCH) {
        Serial.println("Invalid timestamp - NTP not synced");
        return false;
    }

    bool upsPresent = hasUpsModule(creds);
    HomePulse::PowerStatusReport report{
        deviceMac,
        static_cast<uint8_t>(status),
        adcValue,
        upsPresent ? lastBatteryAdcValue : -1,
        upsPresent,
        timestamp
    };

    String sigInput  = HomePulse::buildSignatureInput(report);
    String signature = HomePulse::calculateSignature(sigInput, creds.device_secret);
    String body      = HomePulse::buildPowerStatusPayload(report);

    Serial.printf("Sending status: %d\n", status);
    Serial.printf("Timestamp: %lu\n", (unsigned long)timestamp);
    Serial.printf("SigInput: %s\n", sigInput.c_str());

    // Blue during request
    setLedColor(led, 0, 0, 255);
#if HPW_USE_TLS
    uint32_t heapBeforeHandshake = ESP.getFreeHeap();
#endif
    HomePulse::HttpResult result = HomePulse::postSignedPayload(
        client, String(creds.backend_url) + "/api/device/status",
        body, signature, deviceMac, timestamp, HTTP_TIMEOUT_MS);
#if HPW_USE_TLS
    Serial.printf("[TLS] Telemetry free heap before/after handshake: %u / %u\n",
                  heapBeforeHandshake, ESP.getFreeHeap());
#endif
    updateStatusLed(led, status);

    Serial.printf("HTTP %d: %s\n", result.statusCode, result.body.c_str());

    bool ok = result.statusCode == HTTP_CODE_OK || result.statusCode == HTTP_CODE_CREATED;

    // Backend may ask for an immediate OTA check via a sticky flag (bypasses the
    // 6h OTA_CHECK_INTERVAL_MS timer). Old backend won't send this field; missing
    // key deserializes as false via JsonVariant, so this is safe against old-shape responses.
    if (ok) {
        JsonDocument responseDoc;
        DeserializationError parseErr = deserializeJson(responseDoc, result.body);
        if (!parseErr && responseDoc["forceOtaCheck"].as<bool>()) {
            Serial.println("[OTA] Force-check requested by backend, resetting OTA timer");
            lastOtaCheckTime = 0;
        }
    }

    return ok;
}

void setup() {
    setupHardware();
    bootWasPendingValidation = HomePulse::Ota::isPendingValidation();
    initResetButton();

    // Read hardware MAC address (requires WIFI_STA mode to be set first)
    WiFi.mode(WIFI_STA);
    deviceMac = WiFi.macAddress();
    Serial.printf("Hardware MAC: %s\n", deviceMac.c_str());

    // Load credentials from NVS
    if (!loadCredentials(&creds)) {
#ifdef HAS_COMPILE_TIME_SECRETS
        // First boot with secrets.h present — auto-provision NVS from compile-time values.
        // Guard: only write if all required fields are non-empty; an empty secrets.h stub
        // would otherwise poison NVS and cause an infinite retry loop on every subsequent boot.
        if (applyCompileTimeSecrets(creds, WIFI_SSID, WIFI_PASSWORD, DEVICE_SECRET, BACKEND_URL)) {
            Serial.println("Provisioning NVS from compile-time secrets (partial fields allowed)...");
            saveCredentials(&creds);
            Serial.println("Credentials saved to NVS.");
        } else {
            Serial.println("secrets.h fully empty — skipping NVS write.");
        }
#else
        // No credentials configured — start captive portal for provisioning
        Serial.println("No credentials found. Starting captive portal...");
        startCaptivePortal(deviceMac, led);
        // Never returns — reboots after user saves credentials
#endif
    }

    // Pre-flight: if any required field is blank (empty stub, partial NVS, or factory-reset
    // path with a present-but-empty secrets.h), open the captive portal immediately.
    // Avoids "SSID too long or missing!" spam and the unrecoverable 5-minute retry loop.
    if (!credentialsAreUsable(creds)) {
        Serial.println("Credentials incomplete — starting captive portal...");
        startCaptivePortal(deviceMac, led);
        // Never returns
    }

    Serial.printf("WiFi SSID: %s\n", creds.wifi_ssid);
    Serial.printf("Backend URL: %s\n", creds.backend_url);
    Serial.printf("Device secret: [%d chars]\n", (int)strlen(creds.device_secret));

    if (!connectWiFi()) {
        // WiFi unavailable — retry for 5 minutes. Credentials are preserved: this may be a
        // temporary outage (router reboot, ISP hiccup). After 5 minutes, open the captive
        // portal so the user can update credentials without requiring a USB cable.
        Serial.println("WiFi connection failed. Retrying for 5 minutes...");
        bool connected = false;
        unsigned long retryStart = millis();
        while (millis() - retryStart < WIFI_RETRY_DURATION_MS) {
            delay(RETRY_DELAY_MS);
            Serial.printf("WiFi retry (%lus elapsed)...\n", (millis() - retryStart) / MS_PER_SECOND);
            if (connectWiFi()) { connected = true; break; }
        }
        if (!connected) {
            Serial.println("WiFi unavailable after 5 minutes. Starting captive portal for re-provisioning...");
            startCaptivePortal(deviceMac, led);
            // Never returns
        }
    }

    // Pins the shared GTS Root R1 CA when built with TLS (HPW_USE_TLS=1); no-op
    // for the plaintext dev client.
    HomePulse::configureTransportClient(client);

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
    debounceState.committed = lastPowerStatus;  // Sync debounce committed state with actual initial reading
    Serial.printf("Initial ADC: %d, power status: %d\n", lastAdcValue, lastPowerStatus);
    updateStatusLed(led, lastPowerStatus);

    if (hasUpsModule(creds)) {
        // Prime battery cache before the first sendPowerStatus() call — without this,
        // lastBatteryAdcValue would still hold its 0 initializer (no heartbeat has run yet)
        // and the boot-time send would ship a literal 0mV battery reading.
        lastBatteryAdcValue = readBatteryVoltage();
        Serial.printf("Initial battery: %dmV\n", lastBatteryAdcValue);
    }

    // Send initial status with retries (first TCP connection after WiFi often fails — ARP not yet cached)
    bool initialSendOk = false;
    for (int attempt = 1; attempt <= INITIAL_SEND_RETRIES; attempt++) {
        if (sendPowerStatus(lastPowerStatus, lastAdcValue)) {
            lastSendTime = millis();
            initialSendOk = true;
            heartbeatsSinceBoot++;
            if (HomePulse::Ota::shouldMarkAppValid(bootWasPendingValidation && !otaValidated,
                                                   heartbeatsSinceBoot, millis(),
                                                   OTA_VALIDATION_MIN_HEARTBEATS,
                                                   OTA_VALIDATION_MIN_UPTIME_MS)) {
                HomePulse::Ota::markCurrentAppValid();
                otaValidated = true;
                Serial.println("[OTA] App validated, rollback cancelled.");
            }
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
    // Boot-time OTA check
    {
        Serial.println("[OTA] Checking for update...");
        HomePulse::Ota::UpdateInfo otaInfo;
        auto otaResult = HomePulse::Ota::checkForUpdate(
            client, creds, deviceMac.c_str(), BOARD_TYPE, FIRMWARE_VERSION, otaInfo);
        switch (otaResult) {
            case HomePulse::Ota::CheckResult::UpdateAvailable:
                Serial.println("[OTA] Update available: " + otaInfo.version);
                esp_task_wdt_delete(NULL);
                {
                    bool ok = HomePulse::Ota::applyUpdate(otaInfo, led);
                    if (ok) {
                        Serial.println("[OTA] Flash OK, rebooting.");
                        ESP.restart();
                    } else {
                        Serial.println("[OTA] Flash failed, continuing normal boot.");
                        esp_task_wdt_add(NULL);
                    }
                }
                break;
            case HomePulse::Ota::CheckResult::NoUpdate:
                Serial.println("[OTA] Up to date.");
                break;
            case HomePulse::Ota::CheckResult::NetworkError:
                Serial.println("[OTA] Network error.");
                break;
            case HomePulse::Ota::CheckResult::AuthError:
                Serial.println("[OTA] Auth error (HMAC rejected).");
                break;
            case HomePulse::Ota::CheckResult::ParseError:
                Serial.println("[OTA] Parse error — response malformed or URL too long.");
                break;
        }
    }
    lastOtaCheckTime = millis();
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

        HomePulse::DebounceDecision decision =
            HomePulse::debounceTick(debounceState, resolvedStatus, CONFIRMATION_READS);

        if (decision.transition) {
            Serial.printf("State confirmed: %d -> %d (ADC: %d [%s])\n",
                lastPowerStatus, decision.newCommitted, lastAdcValue, adcBand);
            lastPowerStatus = decision.newCommitted;
            updateStatusLed(led, lastPowerStatus);

            if (hasUpsModule(creds)) {
                // Refresh battery cache before send — a heartbeat may not have fired since boot
                // (e.g. device rebooted mid-outage), leaving lastBatteryAdcValue stale/0 otherwise.
                lastBatteryAdcValue = readBatteryVoltage();
            }

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
        } else if (debounceState.pending != HomePulse::kDebounceIdle) {
            Serial.printf("Confirm %d->%d: %d/%d (ADC: %d [%s])\n",
                lastPowerStatus, debounceState.pending, debounceState.consecutive, CONFIRMATION_READS,
                lastAdcValue, adcBand);
        }
    }

    // Heartbeat — periodic sync to backend
    if (currentTime - lastHeartbeatTime >= HEARTBEAT_INTERVAL_MS) {
        lastHeartbeatTime = currentTime;
        if (hasUpsModule(creds)) {
            lastBatteryAdcValue = readBatteryVoltage();
            Serial.printf("Heartbeat: status=%d, ADC=%d, battery=%dmV\n", lastPowerStatus, lastAdcValue, lastBatteryAdcValue);
        } else {
            Serial.printf("Heartbeat: status=%d, ADC=%d\n", lastPowerStatus, lastAdcValue);
        }
        if (sendPowerStatus(lastPowerStatus, lastAdcValue)) {
            lastSendTime = currentTime;
            Serial.println("Heartbeat sent");
            heartbeatsSinceBoot++;
            if (HomePulse::Ota::shouldMarkAppValid(bootWasPendingValidation && !otaValidated,
                                                   heartbeatsSinceBoot, millis(),
                                                   OTA_VALIDATION_MIN_HEARTBEATS,
                                                   OTA_VALIDATION_MIN_UPTIME_MS)) {
                HomePulse::Ota::markCurrentAppValid();
                otaValidated = true;
                Serial.println("[OTA] App validated, rollback cancelled.");
            }
        } else {
            Serial.println("Heartbeat failed, will retry next interval");
        }
    }

    // Periodic OTA check (every 6 h)
    if (millis() - lastOtaCheckTime >= OTA_CHECK_INTERVAL_MS) {
        lastOtaCheckTime = millis();
        HomePulse::Ota::UpdateInfo otaInfo;
        auto otaResult = HomePulse::Ota::checkForUpdate(
            client, creds, deviceMac.c_str(), BOARD_TYPE, FIRMWARE_VERSION, otaInfo);
        if (otaResult == HomePulse::Ota::CheckResult::UpdateAvailable) {
            Serial.println("[OTA] Periodic: update available " + otaInfo.version);
            esp_task_wdt_delete(NULL);
            bool ok = HomePulse::Ota::applyUpdate(otaInfo, led);
            if (ok) {
                ESP.restart();
            } else {
                esp_task_wdt_add(NULL);
            }
        }
    }

    // SOS — battery low alert during power outage
    if (hasUpsModule(creds) && lastPowerStatus == POWER_STATUS_OFF) {
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

#ifdef ENABLE_DEEP_SLEEP
    // Enter deep sleep for battery operation
    Serial.println("Entering deep sleep...");
    esp_sleep_enable_timer_wakeup(DEEP_SLEEP_DURATION_US);
    esp_deep_sleep_start();
#endif
}
