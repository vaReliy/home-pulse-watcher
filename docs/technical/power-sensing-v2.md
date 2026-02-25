# Power Sensing v2: ADC + Hysteresis + Debounce

Technical summary of the multi-layer power status detection pipeline.

## 1. ADC Threshold Logic

**Hardware**: 5V USB adapter -> 10k/10k voltage divider + 0.1µF cap -> ESP32-C3 GPIO (12-bit ADC, 0-4095).
For non-standard input voltages, adjust R1/R2 per the voltage divider formula in the [Admin Guide](../admin-guide.md#voltage-divider-formula).

| Condition               | Voltage at GPIO | ADC Value | Result                      |
| ----------------------- | --------------- | --------- | --------------------------- |
| Full power (5V adapter) | ~2.5V           | ~3100     | ON                          |
| Brownout (~3V adapter)  | ~1.5V           | ~1860     | Hysteresis (retain current) |
| Dead adapter (0V)       | 0V              | ~0        | OFF                         |

**Thresholds**:

- `ADC_THRESHOLD_HIGH` >= 2200 -> power **ON**
- `ADC_THRESHOLD_LOW` <= 1000 -> power **OFF**
- 1001-2199 -> hysteresis band, retain current state

The hysteresis band covers the brownout zone to prevent flapping during unstable supply voltage.

**Sampling**: 16 readings averaged with 5ms inter-sample delay (~80ms total per read).

**Source**: `firmware/esp32c3/src/config.h:26-33`, `main.cpp:207-216` (`adcToStatus()`)

## 2. Firmware Confirmation Logic

After ADC resolves a state, the firmware requires sustained agreement before acting:

- **Check interval**: 200ms (`CHECK_INTERVAL_MS`)
- **Confirmation**: 2 consecutive matching reads (`CONFIRMATION_READS`) → ~400ms minimum detection time
- **Cooldown**: 2s (`MIN_STATE_CHANGE_MS`) between HTTP sends (state always updates locally)
- No software spike tolerance — the 0.1µF ceramic cap on the voltage divider filters high-frequency noise at the hardware level

**State machine**:

1. `resolvedStatus != lastPowerStatus` → start/continue pending confirmation
2. If pending status matches resolved, increment `confirmationCount`
3. If resolved flips to something else, reset to new pending with count=1
4. If resolved matches confirmed state, clear any pending confirmation
5. At `confirmationCount >= CONFIRMATION_READS`, accept transition — update `lastPowerStatus` and LED immediately, then check cooldown for HTTP send

**`lastPowerStatus`** is updated immediately on confirmation — never gated by HTTP success or cooldown. This ensures the device's internal state always tracks the hardware.

**Source**: `firmware/esp32c3/src/config.h:17-24`, `main.cpp`

## 3. Server-Side Debounce

Even after firmware filtering, the server applies a final notification debounce:

- **Window**: 5 seconds (`MIN_DEBOUNCE_SECONDS`)
- **PowerEvent is always created** and device status is always updated (data integrity preserved)
- **Telegram notification is suppressed** only when: status actually changed AND `secondsSinceLastEvent < 5`
- At exactly 5s, notification fires (strict `<` comparison)

**Not debounced**:

- First-ever event for a device (no `lastEvent`)
- Heartbeats (same status repeated) — `isStatusChange` is false, no debounce check
- Events >= 5s after the previous event

**Response** includes `debounced: boolean` so firmware can log suppression.

**Source**: `libs/application/src/lib/services/power-event/process-power-status.service.ts:124-133`

## 4. API Contract

**Endpoint**: `POST /device/status`

**Authentication**: HMAC-SHA256 headers (`X-Device-Mac`, `X-Timestamp`, `X-Signature`).

**Request body**:

```json
{
  "status": 0 | 1,
  "voltage": 0-4095   // optional
}
```

`voltage` is optional (`Int?` in Prisma schema) and is **not** included in the HMAC payload.

**Response**:

```json
{
  "success": true,
  "eventId": "uuid",
  "timestamp": "ISO-8601",
  "isStatusChange": true,
  "debounced": false
}
```

**Source**: `apps/api/src/controllers/device-status/`
