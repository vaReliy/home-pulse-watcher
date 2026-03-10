#ifndef CONFIG_H
#define CONFIG_H

/**
 * HomePulse Watcher - ESP32-C3 Configuration
 *
 * Hardware-specific settings for power monitoring.
 * User credentials go in secrets.h (not tracked in git).
 */

// Firmware Version (reported to backend on every status ping)
#define FIRMWARE_VERSION "3.1.0"

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
#define HEARTBEAT_INTERVAL_MS 300000    // 5 min — periodic status sync to backend

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

// Buffer Sizes
#define HMAC_PAYLOAD_BUFFER 128     // "MAC:TIMESTAMP:STATUS" buffer
#define JSON_BODY_BUFFER 128        // HTTP POST body buffer

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

// Deep Sleep (optional, for battery operation)
// #define ENABLE_DEEP_SLEEP
#define DEEP_SLEEP_DURATION_US 60000000  // 60 seconds

#endif // CONFIG_H
