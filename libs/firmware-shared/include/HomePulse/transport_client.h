#pragma once

// Compile-time transport selection, single-sourced for every non-download HTTP
// call site (telemetry POST in main.cpp, OTA-check POST in ota.cpp).
//
// HPW_USE_TLS is set via build_flags in platformio.ini:
//   - release envs (esp32c3 / esp32c6):        -DHPW_USE_TLS=1  -> WiFiClientSecure
//   - local dev envs (esp32c3_dev / esp32c6_dev, or undefined): WiFiClient
//
// Incident this fixes: ota.cpp used a hardcoded `WiFiClient client;` at the
// OTA-check call site even though the backend is HTTPS-only, producing a
// silent `HTTPClient -5 connection lost` on every OTA check (no server-side
// log, only visible on physical device serial output). Both call sites now
// share this one alias instead of each declaring their own client type, so a
// future call site cannot regress back to a bare WiFiClient without also
// changing this header.
//
// The OTA *binary download* (Ota::applyUpdate) already always used
// WiFiClientSecure + the pinned GTS Root R1 CA and is untouched here — see
// gts_root_ca.h for the single-sourced CA constant reused below.

#ifndef HPW_USE_TLS
#define HPW_USE_TLS 0
#endif

namespace HomePulse {

// True when this build uses TLS transport. Pure macro-derived constant, no
// Arduino/network headers required — safe to use from native unit tests.
constexpr bool kTransportUsesTls = (HPW_USE_TLS != 0);

}  // namespace HomePulse

#ifndef UNIT_TEST

#include "HomePulse/gts_root_ca.h"

#if HPW_USE_TLS
#include <WiFiClientSecure.h>
#else
#include <WiFiClient.h>
#endif

namespace HomePulse {

#if HPW_USE_TLS
using TransportClient = WiFiClientSecure;
#else
using TransportClient = WiFiClient;
#endif

/**
 * Configure a transport client before first use. Pins the shared GTS Root R1
 * CA when built with TLS; no-op for the plaintext dev client.
 */
inline void configureTransportClient(TransportClient& client) {
#if HPW_USE_TLS
    client.setCACert(GTS_ROOT_CA);
#else
    (void)client;
#endif
}

}  // namespace HomePulse

#endif  // UNIT_TEST
