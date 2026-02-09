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
├── esp32c3/              # ESP32-C3 firmware
│   ├── platformio.ini    # Build configuration
│   ├── src/
│   │   ├── main.cpp      # Main entry point
│   │   └── config.h      # Hardware configuration
│   └── include/
│       └── secrets.h.example
├── esp32c6/              # ESP32-C6 firmware
│   └── ...               # Same structure
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

### config.h (Hardware-specific)

| Setting             | Default      | Description                   |
| ------------------- | ------------ | ----------------------------- |
| `POWER_SENSE_PIN`   | 2            | GPIO for power detection      |
| `STATUS_LED_PIN`    | 8            | Onboard WS2812B RGB LED       |
| `LED_BRIGHTNESS`    | 10           | WS2812 LED brightness (0-255) |
| `CHECK_INTERVAL_MS` | 1000         | Power check interval          |
| `NTP_SERVER`        | pool.ntp.org | Time sync server              |

## Device Setup

To register a device, obtain credentials, and configure `secrets.h`, follow the [Admin Guide](../docs/admin-guide.md).

## Troubleshooting

### Upload Failed

- Check USB connection
- Try holding BOOT button while uploading
- Verify correct board selected in `platformio.ini`

### LED Status Indicators

The onboard WS2812B RGB LED shows device status:

| Color        | Meaning                     |
| ------------ | --------------------------- |
| Yellow blink | WiFi connecting             |
| Green        | 220V power present (normal) |
| Red          | 220V power lost (outage)    |
| Blue flash   | HTTP request in progress    |

### WiFi Connection Failed

- Verify SSID and password
- Check 2.4GHz network (ESP32 doesn't support 5GHz)
- Ensure router allows new connections

For HMAC signature and backend errors, see [Admin Guide - Troubleshooting](../docs/admin-guide.md#troubleshooting).
