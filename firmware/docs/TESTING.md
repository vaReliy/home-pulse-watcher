# Firmware Tests (Unity / Native)

## Run

```bash
cd libs/firmware-shared
pio test -e native
```

## Add a test

1. Create `test/test_<feature>/test_<feature>.cpp`
2. Use `UNITY_BEGIN()` / `RUN_TEST()` / `UNITY_END()` pattern
3. Keep tests pure — no hardware calls
4. Guard hardware I/O with `#ifndef UNIT_TEST`
5. Run `pio test -e native` to verify before pushing

## Architecture

Pure logic headers (no hardware includes) live in `include/HomePulse/`:

- `telemetry.h` — JSON and HMAC input building
- `debounce.h` — Power state debounce machine
- `BatteryUtils.h` — ADC → millivolt → percent conversion
- `PowerUtils.h` — Hysteresis-based power status computation
- `SecurityUtils.h` — HMAC-SHA256 (requires mbedtls)

Hardware I/O wrappers are guarded with `#ifndef UNIT_TEST`:

- `telemetry_http.h` — HTTP POST using HTTPClient
- `credentials.h` — NVS read/write
- `led.h` — NeoPixel control
- `reset.h` — BOOT button and factory reset
- `portal.h` — Captive portal AP
