#pragma once
#include <Arduino.h>
#include <time.h>

namespace HomePulse {

/**
 * All fields needed to build the HTTP payload and HMAC signature.
 * Battery fields are -1 when hasUps is false.
 */
struct PowerStatusReport {
  String mac;
  uint8_t status;         ///< 0=OFF, 1=ON
  int adcValue;           ///< raw ADC reading from power pin
  int32_t batteryAdcRaw;  ///< raw ADC from battery pin, -1 if no UPS
  bool hasUps;
  time_t timestamp;       ///< Unix seconds from NTP
};

/**
 * Build JSON body for HTTP POST.
 * Pure function — no I/O, deterministic, unit-testable.
 */
String buildPowerStatusPayload(const PowerStatusReport& r);

/**
 * Build canonical signature input: "MAC:TIMESTAMP:STATUS"
 * Byte-exact, order-locked — changing this breaks HMAC verification on the server.
 */
String buildSignatureInput(const PowerStatusReport& r);

/** Upper-cases a colon-separated MAC in place. out must be ≥ strlen(in)+1 bytes. */
void toUpperMac(const char* in, char* out, size_t outSize);

/**
 * Build HMAC canonical string for /api/ota/check.
 * Format: "<UPPER_MAC>:<ts>:<boardType>:<currentVersion>:<channel>"
 */
void buildOtaSignatureInput(
    const char* mac,
    unsigned long ts,
    const char* boardType,
    const char* currentVersion,
    const char* channel,
    char* out,
    size_t outSize);

}  // namespace HomePulse
