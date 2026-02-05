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

| Setting | Default | Description |
|---------|---------|-------------|
| `POWER_SENSE_PIN` | 2 | GPIO for power detection |
| `STATUS_LED_PIN` | 8 | Onboard LED GPIO |
| `CHECK_INTERVAL_MS` | 1000 | Power check interval |
| `NTP_SERVER` | pool.ntp.org | Time sync server |

## HMAC Authentication

The firmware signs all requests using HMAC-SHA256:

```
Headers:
  X-Device-Mac: AA:BB:CC:DD:EE:FF
  X-Timestamp: 1738765845
  X-Signature: <64-char-hex>

Signature = HMAC-SHA256(secret, "MAC:TIMESTAMP:STATUS")
```

## Getting Device Credentials

1. Register device via CLI:
   ```bash
   node apps/api/dist/cli.js device:register --mac AA:BB:CC:DD:EE:FF
   ```

2. Save the displayed secret (shown only once)

3. Configure `secrets.h` with the MAC and secret

See [Device Provisioning Guide](../docs/device-provisioning-guide.md) for complete setup instructions.

## Troubleshooting

### Upload Failed

- Check USB connection
- Try holding BOOT button while uploading
- Verify correct board selected in `platformio.ini`

### WiFi Connection Failed

- Verify SSID and password
- Check 2.4GHz network (ESP32 doesn't support 5GHz)
- Ensure router allows new connections

### HMAC Errors

- Verify secret matches registration output exactly
- Check MAC address format (uppercase, colons)
- Ensure NTP time sync is working
