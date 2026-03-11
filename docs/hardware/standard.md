# Hardware V2.1 — Standard (Grid-Only)

## Overview

The standard hardware variant monitors grid power using a USB adapter and resistive voltage divider connected to the ESP32's ADC input. No battery backup — the device goes offline when power is lost, and reports POWER_ON when it reconnects.

Use this variant when battery backup is not needed (e.g., monitoring locations with a separate UPS, or where "device went offline" is sufficient indication of an outage).

## Wiring Diagram

```
================================================================================
                 HOME_PULSE WATCHER V2.1 — STANDARD SCHEMATIC
================================================================================

[ ADAPTER 5V ] (Input Source)
      |
      +--- (A) MAINS SENSING (Detecting AC Power) ------------------------------+
      |    [ R1 10k ]                                                           |
      |       |------> GPIO 2 (Sense Pin)                                       |
      |    [ R2 10k ]                                                           |
      |       |                                                                 |
      |    [ C1 0.1uF ] (Noise Filter)                                          |
      |       |                                                                 |
      |    [ GND ]                                                              |
      |                                                                         |
      +--- (B) DIRECT POWER PATH (Direct 5V supply) ----------------------------+
      |                                                                         |
      |                                                       [ ESP32 ]         |
      |                                                       (C3 / C6)         |
      |                                                     +-----------+       |
      +---------------------------------------------------> |   5V IN   |       |
                                                            |           |       |
                                                            |   GPIO 2  | <-----+
                                                            |           |       |
                                                            |   GND     | --+   |
                                                            +-----------+   |   |
                                                                  |         |   |
                                                                  |         |   |
                                             +--------------------+---------+---+
                                             |
                                      [ COMMON GND ]
================================================================================
```

- **Full grid power (5V adapter):** 5V x R2/(R1+R2) = 5V x 10k/(10k+10k) = 2.5V at GPIO -> ADC ~3100
- **Brownout (~3V adapter):** 3V x R2/(R1+R2) = 3V x 10k/(10k+10k) = 1.5V -> ADC ~1860 (hysteresis band, ignored)
- **Grid down (0V adapter):** 0V -> ADC ~0

The 0.1uF ceramic capacitor across R2 filters high-frequency EMI noise on the ADC input, preventing false readings from floating-input antenna effects.

## Voltage Divider Formula

The output voltage at GPIO is determined by:

```
V_out = V_in x R2 / (R1 + R2)
```

**Target range:** V_out should be **2.2V-3.0V** — above the ADC threshold (2200 ~ 1.75V) with margin, and safely below the 3.3V GPIO absolute maximum.

**Worked examples for different adapters:**

| Adapter           | V_in | R1  | R2  | V_out | ADC (approx) |
| ----------------- | ---- | --- | --- | ----- | ------------ |
| Standard USB (5V) | 5V   | 10k | 10k | 2.5V  | ~3100        |
| Nokia/High-V (7V) | 7V   | 20k | 10k | 2.33V | ~2890        |

> **Safety warning:** V_out must **never** exceed 3.3V — this is the ESP32 GPIO absolute maximum. Always calculate before wiring.

> **Capacitor note:** The 0.1uF (104) ceramic capacitor **must always** be placed in parallel with R2, regardless of resistor values chosen. It provides EMI filtering at the hardware level and prevents ghost readings.

## ADC Thresholds and Hysteresis

The firmware uses a three-zone hysteresis model to prevent false triggers during brownouts:

| ADC Range   | Voltage (approx) | Interpretation        |
| ----------- | ---------------- | --------------------- |
| 2200 - 4095 | 1.75V - 3.3V     | Power ON (confirmed)  |
| 1001 - 2199 | 0.8V - 1.75V     | Hysteresis (ignored)  |
| 0 - 1000    | 0V - 0.8V        | Power OFF (confirmed) |

Additional protections:

- **Confirmation window:** 2 consecutive matching reads (2 x 200ms = ~400ms) — the 0.1uF cap handles noise filtering at the hardware level
- **Cooldown:** Minimum 2s between transitions (firmware) + 5s server-side debounce
- **Voltage logging:** Each status report includes the raw ADC value for diagnostics

## Calibration

If your voltage divider uses different resistor values, adjust `ADC_THRESHOLD_HIGH` and `ADC_THRESHOLD_LOW` in `config.h`:

1. Flash firmware and monitor serial output
2. Observe ADC values during normal operation (should be ~3100 with the 10k/10k divider)
3. Simulate brownout (use a variable power supply or long extension cord under load)
4. Set `ADC_THRESHOLD_HIGH` above brownout ADC values
5. Set `ADC_THRESHOLD_LOW` well below the lowest brownout reading
6. Keep a wide hysteresis band (at least 500 ADC units) to absorb noise

## Hardware Evolution

| Version                        | Divider   | Capacitor               | Notes                                                                                                                            |
| ------------------------------ | --------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **V2.1 (Current/Recommended)** | 10k / 10k | 0.1uF ceramic across R2 | Eliminates ghost events from EMI noise on the ADC input                                                                          |
| **V2.0 (Legacy)**              | 10k / 20k | None                    | Prone to "Ghost Power ON" events — high-impedance floating input acts as an antenna, picking up EMI that causes false ADC spikes |

If you are building a new sensor, use V2.1. If you have an existing V2.0 sensor experiencing ghost events, add a 0.1uF ceramic capacitor between GPIO 2 and GND, and replace R2 with a 10k resistor.

## Troubleshooting: Ghost Power ON Events

The device reports power restored when the grid is actually still down. This typically manifests as rapid ON/OFF pairs in the event history.

**Cause:** The ADC input is floating at high impedance when the USB adapter is off. The long wire between the adapter and the voltage divider acts as an antenna, picking up EMI (from nearby motors, switching power supplies, etc.) that causes the ADC to briefly spike above `ADC_THRESHOLD_HIGH`.

**Solution:** Upgrade to V2.1 hardware — add a 0.1uF ceramic capacitor between GPIO 2 and GND. This filters high-frequency noise and eliminates the ghost readings. See the [Hardware Evolution](#hardware-evolution) table above for details.
