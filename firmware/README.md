# HomePulse Watcher Firmware

ESP32-based power monitoring firmware for HomePulse Watcher.

## Supported Hardware

- **ESP32-C3 SuperMini** - Compact, low-power, WiFi-enabled
- **ESP32-C6 SuperMini** - Newer variant with WiFi 6 support

## Quick Start

1. **Install PlatformIO**

   ```bash
   pip install platformio
   # Or install VS Code extension: platformio.platformio-ide
   ```

2. **Navigate to your board directory**

   ```bash
   cd firmware/esp32c3  # or esp32c6
   ```

3. **Configure secrets**

   ```bash
   cp include/secrets.h.example include/secrets.h
   ```

   Edit `include/secrets.h` with your credentials:
   - WiFi SSID and password
   - Device MAC and secret (from `device:register` CLI command)
   - Backend URL

4. **Build and flash**

   ```bash
   pio run -t upload
   ```

5. **Monitor serial output**
   ```bash
   pio device monitor
   ```

## Project Structure

```
firmware/
├── common/
│   └── main.cpp          # Shared sketch (both boards) — edit once, applies to both
├── esp32c3/              # ESP32-C3 environment
│   ├── platformio.ini    # Build configuration (points to common/main.cpp via build_src_filter)
│   ├── src/
│   │   └── config.h      # Board-specific: GPIO pins, BOARD_TYPE, battery divider ratio
│   └── include/
│       └── secrets.h.example
├── esp32c6/              # ESP32-C6 environment
│   ├── platformio.ini
│   ├── src/
│   │   └── config.h      # Board-specific settings for C6
│   └── include/
│       └── secrets.h.example
└── docs/
    └── FLASHING_GUIDE.md # Detailed flashing instructions
```

## Configuration

### secrets.h (User-specific)

```cpp
#define WIFI_SSID "your-network"
#define WIFI_PASSWORD "your-password"
#define DEVICE_MAC "AA:BB:CC:DD:EE:FF"
#define DEVICE_SECRET "64-char-hex-secret"
#define BACKEND_URL "https://your-server.com/api/device/status"
```

### Dev vs Prod

Each environment (dev/prod) has its own database, so devices must be registered separately. In `secrets.h`, use preprocessor conditionals to keep both configs and switch easily:

```cpp
// Uncomment one:
// #define ENV_DEV
// #define ENV_PROD

#ifdef ENV_DEV
  #define DEVICE_SECRET "dev-secret"
  #define BACKEND_URL "http://192.168.x.x:3000/api/device/status"
#else
  #define DEVICE_SECRET "prod-secret"
  #define BACKEND_URL "https://your-cloud-run-url.run.app/api/device/status"
#endif
```

See `secrets.h.example` for the full template.

### config.h (Hardware-specific)

| Setting                  | Default        | Description                                |
| ------------------------ | -------------- | ------------------------------------------ |
| `FIRMWARE_VERSION`       | `"3.5.0"`      | Reported to backend on every status ping   |
| `POWER_SENSE_PIN`        | 2              | GPIO for power detection                   |
| `STATUS_LED_PIN`         | 8              | Onboard WS2812B RGB LED                    |
| `LED_BRIGHTNESS`         | 10             | WS2812 LED brightness (0-255)              |
| `CHECK_INTERVAL_MS`      | 200            | Power check interval (ms)                  |
| `NTP_SERVER`             | pool.ntp.org   | Time sync server                           |
| `WIFI_RETRY_DURATION_MS` | 300000 (5 min) | WiFi retry window before rebooting (setup) |

## Device Setup

To register a device, obtain credentials, and configure `secrets.h`, follow the [Admin Guide](../docs/admin-guide.md).

## Troubleshooting

### Upload Failed

- Check USB connection
- Try holding BOOT button while uploading
- Verify correct board selected in `platformio.ini`

### LED Status Indicators

The onboard WS2812B RGB LED shows device status:

| Color                       | Meaning                                 |
| --------------------------- | --------------------------------------- |
| Yellow blink                | WiFi connecting                         |
| Orange breathing (slow)     | Captive portal active (awaiting config) |
| Orange blink (accelerating) | Factory reset hold in progress (0–10 s) |
| Purple (1 s solid)          | Factory reset confirmed                 |
| Green                       | 220V power present (normal)             |
| Red                         | 220V power lost (outage)                |
| Blue flash                  | HTTP request in progress                |
| White fast blink (80 ms)    | OTA update download/flash in progress   |

### Initial Configuration (Captive Portal)

On first boot (or after a factory reset), the device starts a WiFi access point for provisioning:

- **AP name:** `HomePulse-Setup-XXXX` — where `XXXX` is the last 4 hex characters of the device MAC address
- **Password:** none (open network — connect directly)
- **Config page:** `http://192.168.4.1/` (opens automatically on most phones as a captive portal)

**UI fields:**

| Field         | Description                                                |
| ------------- | ---------------------------------------------------------- |
| WiFi Network  | Select from scanned networks or type manually              |
| WiFi Password | Your router password (leave blank for open networks)       |
| Device Secret | 64-character hex secret from `device:register` CLI command |
| Backend URL   | `https://your-server.com/api/device/status`                |

After saving, credentials are written to NVS (flash) and the device reboots to connect. Credentials persist across power cycles.

### Factory Reset (10-Second BOOT Button Hold)

To re-provision the device (e.g., new WiFi network or backend):

1. Hold the **BOOT button** (GPIO9) for **10 seconds**
2. LED blinks orange with accelerating frequency
3. At 10 s: LED turns **solid purple** for 1 second — reset confirmed
4. Device wipes NVS credentials and reboots into the captive portal

> **WiFi unavailable (not a reset):** If credentials are already configured but the router is unreachable, the device retries for 5 minutes, then reboots to try again. The captive portal does **not** open automatically — credentials are always preserved unless you perform an explicit factory reset.

### HTTP 401 Unauthorized

The serial output shows the error code from the backend (e.g. `HTTP 401: {"code":"...","message":"..."}`). Common causes:

| Error Code            | Cause                                              | Fix                                                             |
| --------------------- | -------------------------------------------------- | --------------------------------------------------------------- |
| `DEVICE_NOT_FOUND`    | Device MAC not registered in this environment's DB | Run `device:register` against the correct backend               |
| `INVALID_SIGNATURE`   | `DEVICE_SECRET` in firmware doesn't match backend  | Re-register or verify the secret                                |
| `EXPIRED_TIMESTAMP`   | Device clock >5 min off from server                | Check NTP sync in serial output                                 |
| `MISSING_CREDENTIALS` | Auth headers not sent                              | Firmware bug — check `X-Device-Mac/Timestamp/Signature` headers |

### WiFi Connection Failed

- Verify SSID and password
- Check 2.4GHz network (ESP32 doesn't support 5GHz)
- Ensure router allows new connections

For HMAC signature and backend errors, see [Admin Guide - Troubleshooting](../docs/admin-guide.md#troubleshooting).

### OTA Auto-Rollback

Every OTA update boots in an **unvalidated** state (`ESP_OTA_IMG_PENDING_VERIFY`). The firmware must prove stability before marking itself as the new permanent image.

**Validation grace period** (configured in `config.h`):

| Constant                        | Default | Meaning                                              |
| ------------------------------- | ------- | ---------------------------------------------------- |
| `OTA_VALIDATION_MIN_HEARTBEATS` | 3       | Minimum successful backend contacts since boot       |
| `OTA_VALIDATION_MIN_UPTIME_MS`  | 300000  | Minimum uptime (5 minutes) before mark-valid allowed |

Both conditions must be satisfied on the same heartbeat before `markCurrentAppValid()` is called.

**Auto-revert flow:**

1. OTA flash completes → `ESP.restart()` → new firmware boots in `PENDING_VERIFY` state
2. Firmware counts successful heartbeats to the backend
3. After ≥ 3 heartbeats **and** ≥ 5 minutes uptime → `esp_ota_mark_app_valid_cancel_rollback()`
4. If the firmware crashes, hangs, or fails heartbeats before step 3, the IDF watchdog reboots the device
5. On next boot, the bootloader detects `PENDING_VERIFY` was never cleared → **automatically reverts to the previous firmware**

**Partial-flash / checksum protection:**

- `Update.abort()` is called explicitly on stream stall, short read, or `Update.write()` short return
- If `Update.end()` succeeds but SHA-256 checksum mismatches the server record, `esp_ota_set_boot_partition()` reverts the next-boot selection to the currently running partition — the bad build will never boot even if the device power-cycles
- All abort events are logged with the `[OTA][ABORT]` tag for easy serial-log grepping
