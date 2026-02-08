# Firmware Flashing Guide

Step-by-step instructions for building and flashing HomePulse Watcher firmware to ESP32 devices.

## Prerequisites

### Install PlatformIO

**Option A: VS Code Extension (Recommended)**

1. Install [VS Code](https://code.visualstudio.com/)
2. Install PlatformIO IDE extension from marketplace
3. Restart VS Code

**Option B: Command Line**

```bash
pip install platformio
```

Verify installation:

```bash
pio --version
```

### USB Driver

Most ESP32 boards use CH340 or CP2102 USB-to-serial chips.

- **Windows**: Usually auto-installs. If not, download from [CH340 driver](https://www.wch.cn/downloads/CH341SER_EXE.html)
- **macOS**: Usually works out of the box
- **Linux**: Add user to dialout group:
  ```bash
  sudo usermod -a -G dialout $USER
  # Log out and back in
  ```

## Step 1: Get Device Credentials

Before flashing, you need a registered device and its HMAC secret. Follow [Admin Guide - Steps 1-2](../../docs/admin-guide.md#step-2-register-device) to create a user and register the device.

## Step 2: Configure Firmware

1. Navigate to the appropriate board directory:

   ```bash
   cd firmware/esp32c3  # or esp32c6
   ```

2. Copy the secrets template:

   ```bash
   cp include/secrets.h.example include/secrets.h
   ```

3. Edit `include/secrets.h`:
   ```cpp
   #define WIFI_SSID "YourNetworkName"
   #define WIFI_PASSWORD "YourPassword"
   #define DEVICE_MAC "AA:BB:CC:DD:EE:FF"
   #define DEVICE_SECRET "your-64-char-hex-secret-here"
   #define BACKEND_URL "https://your-server.com/api/device/status"
   ```

## Step 3: Connect ESP32

1. Connect ESP32 to computer via USB cable
2. Identify the port:
   - **Windows**: Check Device Manager → Ports (COM & LPT)
   - **macOS**: `ls /dev/cu.*`
   - **Linux**: `ls /dev/ttyUSB*` or `ls /dev/ttyACM*`

## Step 4: Build and Flash

### Using PlatformIO CLI

```bash
# Build firmware
pio run

# Upload to device
pio run -t upload

# Open serial monitor
pio device monitor
```

### Using VS Code

1. Open the `firmware/esp32c3` folder in VS Code
2. Click PlatformIO icon in sidebar
3. Under "Project Tasks" → "General":
   - Click "Build" to compile
   - Click "Upload" to flash
   - Click "Monitor" to view serial output

### First-Time Upload Issues

If upload fails, try:

1. **Hold BOOT button** while clicking Upload
2. Release BOOT after "Connecting..." appears
3. Some boards auto-reset; others need manual reset after upload

## Step 5: Verify Operation

1. Open serial monitor (115200 baud)
2. You should see:

   ```
   =================================
   HomePulse Watcher - ESP32-C3
   =================================
   Connecting to WiFi: YourNetwork
   ....
   Connected! IP: 192.168.1.100
   Time synchronized: 1738765845
   Initial power status: 1
   Setup complete. Monitoring power status...
   ```

3. Check the backend logs for incoming requests

## Troubleshooting

### Upload Failed - No Serial Port

- Check USB cable (some cables are charge-only)
- Try a different USB port
- Install/reinstall USB driver
- Check if another program is using the port

### Upload Failed - Timeout

- Hold BOOT button during upload
- Try lower upload speed in `platformio.ini`:
  ```ini
  upload_speed = 460800
  ```

### WiFi Connection Failed

- Verify SSID and password (case-sensitive)
- Ensure 2.4GHz network (ESP32 doesn't support 5GHz)
- Check router isn't blocking new devices
- Move closer to router

### NTP Sync Failed

- Check internet connectivity
- Try alternative NTP server in `config.h`
- Firewall may block UDP port 123

For HMAC signature and backend errors, see [Admin Guide - Troubleshooting](../../docs/admin-guide.md#troubleshooting).

### Serial Garbage Characters

- Verify baud rate is 115200
- Try different terminal (PuTTY, screen, minicom)

## Updating Firmware

To update firmware after changes:

```bash
pio run -t upload
```

No need to re-configure `secrets.h` unless credentials changed.

## Factory Reset

To completely reset the ESP32:

```bash
pio run -t erase
pio run -t upload
```

This erases all flash including WiFi credentials stored by the framework.
