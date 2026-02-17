#ifndef CONFIG_H
#define CONFIG_H

/**
 * HomePulse Watcher - ESP32-C3 Configuration
 *
 * Hardware-specific settings for power monitoring.
 * User credentials go in secrets.h (not tracked in git).
 */

// GPIO Configuration
#define POWER_SENSE_PIN 2       // GPIO for power detection (connect to optocoupler output)
#define STATUS_LED_PIN 8        // Onboard WS2812B RGB LED
#define LED_BRIGHTNESS 10       // WS2812 brightness (0-255)

// Timing Configuration
#define CHECK_INTERVAL_MS 1000      // Power status check interval (milliseconds)
#define DEBOUNCE_MS 100             // Debounce time for power detection
#define WIFI_TIMEOUT_MS 30000       // WiFi connection timeout
#define HTTP_TIMEOUT_MS 10000       // HTTP request timeout
#define RETRY_DELAY_MS 5000         // Delay between retries on failure

// NTP Configuration
#define NTP_SERVER "pool.ntp.org"
#define NTP_SERVER_2 "time.nist.gov"
#define GMT_OFFSET_SEC 0            // UTC
#define DAYLIGHT_OFFSET_SEC 0

// Power Status Values (must match backend enum)
#define POWER_STATUS_OFF 0
#define POWER_STATUS_ON 1

// Stability Configuration
#define WATCHDOG_TIMEOUT_S 60           // Hardware watchdog timeout (seconds)
#define REBOOT_INTERVAL_MS 172800000UL  // Periodic reboot interval (48 hours)
#define MAX_WIFI_FAILURES 10            // Consecutive WiFi failures before reboot

// Deep Sleep (optional, for battery operation)
// #define ENABLE_DEEP_SLEEP
#define DEEP_SLEEP_DURATION_US 60000000  // 60 seconds

#endif // CONFIG_H
