# OTA Recovery Runbook

## Overview & Critical Limitation

**Remote recovery is NOT possible.** Devices use pull-based OTA — they initiate HTTPS requests to the backend to check for updates. There is no remote-flash service listening on a network port. If a device's OTA client is broken (e.g., using plaintext HTTP instead of HTTPS), the device cannot self-heal via OTA because the very client needed to pull the fix is the thing that's broken.

**Physical access and USB/serial reflash is mandatory** for stuck devices.

---

## Identifying a Stuck Device

A device is stuck when it cannot receive OTA updates due to a firmware bug in the OTA client, an incompatible backend, or network misconfiguration. Use this checklist to confirm:

### 1. Check Cloud Run Logs

Query backend logs for `/api/ota/check` hits from the device's MAC address.

```bash
# Example: search for device MAC 8C:FD:49:18:40:9C
gcloud logging read "resource.type=cloud_run_revision AND \
  (textPayload=~'8C:FD:49:18:40:9C' OR jsonPayload.mac=8C:FD:49:18:40:9C)" \
  --limit=50 --format=json
```

**Expected behavior**: Device polls `/api/ota/check` periodically (every 6 hours, or immediately after a force-check request).

**Stuck symptom**: No `/api/ota/check` hits from the device, or hits fail with `401`/`403`/`5xx` errors consistently.

### 2. Check Device Serial Log

Connect to the device via USB/serial and observe the output. Use 115200 baud.

```bash
# PlatformIO
pio device monitor

# Or manual serial connection
screen /dev/ttyUSB0 115200
# or
minicom -D /dev/ttyUSB0 -b 115200
```

Look for `[OTA]` tagged log lines:

- `[OTA] CheckResult: ...` — device attempted an OTA check; inspect the result (success, timeout, error code).
- `[OTA][ABORT]` — partial firmware download detected and reverted; check flash state.
- `[OTA][TLS]` — TLS handshake or certificate verification failure.
- No `[OTA]` lines at all for 6+ hours — OTA check not running (or firmware version so old it predates logging).

### 3. Cross-Reference Device State

Run the CLI `device:list` command to check the device's recorded firmware version and release channel (once the parallel task lands with the CLI enhancement).

```bash
npx nx run api:cli -- device:list --telegram-id <TELEGRAM_ID>
```

Look for:

- `firmwareVersion` older than the latest `FirmwareRelease` for the device's `boardType` + `releaseChannel`.
- Multiple devices on the same channel/board and version — if others have updated and this device hasn't, it's stuck.
- `⚠ stuck?` indicator (if the heuristic flag is enabled).

---

## Manual Recovery Procedure

### Prerequisites

- Physical access to the device (USB cable + computer with PlatformIO installed).
- Device registered in the backend (MAC address known).
- HMAC secret for the device (from `device:register` CLI output).
- Latest firmware binary for the device's board type (ESP32-C3 or ESP32-C6).

### Step 1: Prepare Device Credentials

Obtain the device's HMAC secret from initial registration output. The secret cannot be retrieved post-registration — it is encrypted at rest in the database:

```bash
# The HMAC secret is printed only during device:register and must be saved immediately.
# If you did not save it, use device:rotate-secret to generate a new one:
npx nx run api:cli -- device:rotate-secret --mac <MAC_ADDRESS>
```

For reference, you can list a user's devices (requires user ID or Telegram ID):

```bash
npx nx run api:cli -- device:list --user-id <USER_ID>
# or
npx nx run api:cli -- device:list --telegram-id <TELEGRAM_ID>
```

You need:

- Device MAC address
- Device HMAC secret (64-char hex)
- Backend URL (where the device posts status, e.g., `https://your-server.com/api/device/status`)
- WiFi SSID and password (to reconnect after reflash)
- Board type (ESP32-C3 or ESP32-C6)

### Step 2: Get Latest Firmware Binary

Download the latest firmware `.bin` file for the device's board type and release channel.

**Via CLI** (if using Docker admin profile):

```bash
docker compose --profile admin run --rm admin firmware:list
```

Or download from the GCS bucket directly (requires Cloud Storage access).

**Path convention in GCS**: `firmware/<board>/<version>/<filename>.bin`

### Step 3: Connect Device & Configure Build

1. Connect the ESP32 to your computer via USB cable.
2. Verify the port:

   ```bash
   # Linux/macOS
   ls /dev/tty* | grep -E "(USB|ACM)"
   # Windows: Check Device Manager → Ports (COM & LPT)
   ```

3. Navigate to the device's board directory:

   ```bash
   cd firmware/esp32c3  # or esp32c6
   ```

4. Create `include/secrets.h` from the template:

   ```bash
   cp include/secrets.h.example include/secrets.h
   ```

5. Edit `include/secrets.h` and fill in device credentials:

   ```cpp
   #define WIFI_SSID "YourNetworkName"
   #define WIFI_PASSWORD "YourPassword"
   #define DEVICE_MAC "8C:FD:49:18:40:9C"
   #define DEVICE_SECRET "a1b2c3d4...64_hex_chars...e7f8"
   #define BACKEND_URL "https://your-server.com/api/device/status"
   ```

### Step 4: Build and Flash

**Using PlatformIO CLI:**

```bash
cd firmware/esp32c3  # (or esp32c6)

# Build firmware
pio run

# Flash to device
pio run -t upload
```

**If upload fails (timeout, connection refused):**

1. Hold the BOOT button (GPIO9) on the device during the "Connecting..." phase.
2. Release BOOT after the progress bar starts.
3. Some boards auto-reset after upload; others require manual reset (press the RESET button).

**Using VS Code (PlatformIO IDE):**

1. Open `firmware/esp32c3` (or `esp32c6`) as a folder in VS Code.
2. Click the PlatformIO icon (⚡) in the sidebar.
3. Under "Project Tasks" → "General", click:
   - **"Build"** to compile
   - **"Upload"** to flash (hold BOOT if it times out)
   - **"Monitor"** to open the serial console (115200 baud)

### Step 5: Verify Operation

Once the upload completes, open the serial monitor and verify:

1. Bootloader message and startup logs appear.
2. Device connects to WiFi (look for "Connected! IP: ...").
3. NTP time sync succeeds (look for "Time synchronized: ...").
4. Initial power status is read (look for "Initial power status: 0 or 1").
5. **After 6 hours (or after a manual force-check from the backend)**, `[OTA] CheckResult: ...` appears in the log.

If the device still fails to reach `/api/ota/check`:

- Check device WiFi connectivity (`ping <device_ip>` from the network).
- Verify backend is reachable and has a valid HTTPS certificate (test: `curl -v https://your-server.com/api/health/live`).
- Check device serial logs for `[OTA][TLS]` errors (certificate verification failure).

### Step 6: Restore Production Credentials (Optional)

If the device will stay on the bench for development, delete `include/secrets.h` after testing to prevent accidental inclusion in future builds.

```bash
rm firmware/esp32c3/include/secrets.h
# Or move it to a backup
mv firmware/esp32c3/include/secrets.h firmware/esp32c3/include/secrets.h.bak
```

For production re-provisioning (e.g., moving the device to a new location or WiFi), use the captive portal:

1. Factory-reset the device (hold BOOT for 10 s until LED turns solid purple).
2. Device will reboot into AP mode: `HomePulse-Setup-XXXX` (open network).
3. Open `http://192.168.4.1/` from a connected device.
4. Re-enter WiFi credentials and backend URL; submit.

---

## Postmortem Checklist

After recovery, investigate why the device got stuck:

### Code Review

- **Was there an OTA client bug in the firmware version the device was running?** Check commit history for the board's `config.h` `FIRMWARE_VERSION` constant. (Example: `2026-07-07-01-firmware-tls-build-flag` fixed plaintext OTA client on devices shipped before the fix.)
- **Did the backend API change?** Check Cloud Run deployment history, migration logs, or endpoint changes. If yes, bump `FirmwareRelease.isCritical` for all pre-fix devices to force an upgrade.

### Deployment

- Are pre-fix devices still in the fleet receiving heartbeats?
  - Yes: They're online but can't self-heal. Prioritize manual reflash or staged forced-upgrade rollout.
  - No: They're offline. Confirm with end users and mark as inactive if permanently unreachable.

### Fleet Health

- **How many other devices are on the same old firmware version?** Query the backend:

  ```sql
  SELECT releaseChannel, firmwareVersion, COUNT(*) as device_count
  FROM "Device"
  GROUP BY releaseChannel, firmwareVersion
  ORDER BY device_count DESC;
  ```

  Determine if a fleet-wide reflash or canary OTA rollout is needed.

---

## Remote Reflash: Why It's Not Possible

ESP32 devices in HomePulse Watcher use **pull-based OTA**: the firmware initiates HTTPS requests to the backend to fetch updates. There is no separate **remote-flash service** listening for inbound commands.

To remotely reflash a device without a working OTA client, you would need one of:

1. **SSH / remote shell** — not implemented; adds complexity and security surface.
2. **Serial-over-network** — not implemented; only USB/direct serial is supported.
3. **Push-based update delivery** — not implemented; all updates are firmware-initiated pulls.

If the OTA client is broken, the device has no way to contact the backend for instructions. Only physical access (USB/serial) allows reflash.

**Future consideration**: Implement a lightweight MQTT-style update broker if remote recovery becomes critical for field-deployed fleets. This is tracked as a separate roadmap item.

---

## When to Escalate

Contact the team or escalate to the maintainer if:

- Multiple devices are stuck (>3 active devices on the same broken firmware).
- The broken firmware version is not reproducible locally (suspected hardware/network-specific issue).
- Manual reflash succeeds but the device immediately reverts to broken behavior (bootloader corruption).
- Backend OTA-check endpoint is failing with `5xx` errors for all devices (infrastructure issue, not device-specific).
