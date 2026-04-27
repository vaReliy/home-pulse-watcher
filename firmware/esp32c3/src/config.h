#ifndef CONFIG_H
#define CONFIG_H

/**
 * HomePulse Watcher - ESP32-C3 Configuration
 *
 * Hardware-specific settings for power monitoring.
 * User credentials go in secrets.h (not tracked in git).
 */

// Firmware Version (reported to backend on every status ping)
#define FIRMWARE_VERSION "3.5.0"

// GPIO Configuration
#define POWER_SENSE_PIN 2       // GPIO for power detection (connect to optocoupler output)
#define STATUS_LED_PIN 8        // Onboard WS2812B RGB LED
#define LED_BRIGHTNESS 10       // WS2812 brightness (0-255)

// Timing Configuration
#define CHECK_INTERVAL_MS 200       // Power status check interval (milliseconds)
#define WIFI_TIMEOUT_MS 30000       // WiFi connection timeout
#define HTTP_TIMEOUT_MS 10000       // HTTP request timeout
#define RETRY_DELAY_MS 5000         // Delay between retries on failure

// State Confirmation & Messaging
#define CONFIRMATION_READS 2            // Consecutive matching reads to confirm state change (2 × 200ms = 400ms)
#define MIN_STATE_CHANGE_MS 2000        // 2s cooldown between HTTP sends (state always updates locally)
#define HEARTBEAT_INTERVAL_MS 1800000   // 30 min — periodic status sync to backend

// ADC Configuration (voltage divider: 5V adapter -> 10k/10k + 0.1µF cap -> GPIO)
// Full power: 5V × 10/20 = 2.5V -> ADC ~3100
// Brownout ~3V: 3V × 10/20 = 1.5V -> ADC ~1860 (hysteresis band, ignored)
// Dead adapter: 0V -> ADC ~0
#define ADC_SAMPLES 16                  // Averaged ADC reading
#define ADC_SAMPLE_DELAY_MS 5           // Delay between ADC samples (total: ~80ms)
#define ADC_THRESHOLD_HIGH 2200         // Above = power ON (adapter healthy)
#define ADC_THRESHOLD_LOW 1000          // Below = power OFF (adapter dead)

// NTP Configuration
#define NTP_SERVER "pool.ntp.org"
#define NTP_SERVER_2 "time.nist.gov"
#define GMT_OFFSET_SEC 0            // UTC
#define DAYLIGHT_OFFSET_SEC 0

// Power Status Values (must match backend enum)
#define POWER_STATUS_OFF 0
#define POWER_STATUS_ON 1
#define POWER_STATUS_UNKNOWN -1     // Initial/unresolved power state

// LED Configuration
#define LED_COUNT 1                 // Single WS2812B pixel

// Serial Configuration
#define SERIAL_BAUD_RATE 115200
#define SERIAL_INIT_DELAY_MS 1000   // Wait for serial monitor after boot

// WiFi LED
#define WIFI_BLINK_INTERVAL_MS 500  // Yellow blink during WiFi connection

// NTP Validation
#define MIN_VALID_EPOCH 1700000000UL // Unix timestamp sanity floor (~Nov 2023)
#define NTP_SYNC_TIMEOUT_MS 30000   // Max wait for NTP time sync

// HMAC-SHA256 Constants
#define HMAC_HASH_LENGTH 32         // SHA-256 output size (bytes)
#define HMAC_HEX_LENGTH 64          // Hex-encoded signature length (2 chars/byte)
#define HMAC_SIGNATURE_BUFFER 65    // HMAC_HEX_LENGTH + null terminator

// UPS Battery Monitoring (disabled by default — enable for V2.3 UPS Edition)
#define HAS_UPS_MODULE false

// Battery ADC (100k/100k divider on GPIO3)
// Nominal ratio 2:1; calibrate empirically if readings drift.
#define BATTERY_DIVIDER_RATIO_NUM 2000
#define BATTERY_DIVIDER_RATIO_DEN 1000
#define BATTERY_SENSE_PIN 3
#define BATTERY_ADC_SAMPLES 8
#define BATTERY_ADC_SAMPLE_DELAY_MS 5

// Battery voltage thresholds (millivolts, after divider correction)
#define BATTERY_VOLTAGE_FULL_MV 4200
// IMPORTANT: Keep in sync with BATTERY_LOW_THRESHOLD_MV in libs/application/src/lib/events/battery-low.event.ts
#define BATTERY_VOLTAGE_LOW_MV 3400       // SOS threshold
#define BATTERY_VOLTAGE_EMPTY_MV 3000

// SOS cooldown (avoid spam during prolonged outage)
#define SOS_COOLDOWN_MS 900000            // 15 min

// Buffer Sizes
#define HMAC_PAYLOAD_BUFFER 128     // "MAC:TIMESTAMP:STATUS" buffer
#define JSON_BODY_BUFFER 192        // HTTP POST body buffer (enlarged for batteryVoltage field)

// ADC Configuration
#define ADC_RESOLUTION_BITS 12      // 12-bit ADC (0-4095 range)

// Restart Delay
#define RESTART_DELAY_MS 5000       // Delay before ESP.restart() for log flush

// Watchdog
#define MS_PER_SECOND 1000          // Conversion factor for watchdog config

// Stability Configuration
#define WATCHDOG_TIMEOUT_S 60           // Hardware watchdog timeout (seconds)
#define REBOOT_INTERVAL_MS 172800000UL  // Periodic reboot interval (48 hours)
#define MAX_WIFI_FAILURES 10            // Consecutive WiFi failures before reboot

// WiFi Retry (setup phase — credentials already provisioned but network unavailable)
#define WIFI_RETRY_DURATION_MS 300000UL // Retry for 5 minutes before rebooting (credentials preserved)

// Initial Status Send Retry (first TCP connection after WiFi often fails — ARP not yet cached)
#define INITIAL_SEND_RETRIES 5          // Number of retry attempts for initial status send
#define INITIAL_SEND_RETRY_DELAY_MS 10000 // Delay between retries (milliseconds)

// Deep Sleep (optional, for battery operation)
// #define ENABLE_DEEP_SLEEP
#define DEEP_SLEEP_DURATION_US 60000000  // 60 seconds

// OTA Update Configuration
#define BOARD_TYPE "esp32c3"
#define OTA_CHECK_INTERVAL_MS (6UL * 60UL * 60UL * 1000UL)

#endif // CONFIG_H
