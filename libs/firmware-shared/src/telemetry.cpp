#include "HomePulse/telemetry.h"
#include <cctype>
#include <cstring>

// FIRMWARE_VERSION is defined in config.h of each board.
// When running under UNIT_TEST, define it as a stub if not already defined.
#ifndef FIRMWARE_VERSION
#define FIRMWARE_VERSION "test"
#endif

namespace HomePulse {

String buildSignatureInput(const PowerStatusReport& r) {
  char buf[128];
  snprintf(buf, sizeof(buf), "%s:%lu:%d",
           r.mac.c_str(),
           static_cast<unsigned long>(r.timestamp),
           static_cast<int>(r.status));
  return String(buf);
}

String buildPowerStatusPayload(const PowerStatusReport& r) {
  char buf[256];
  if (r.hasUps) {
    snprintf(buf, sizeof(buf),
             "{\"status\":%d,\"voltage\":%d,\"firmwareVersion\":\"%s\",\"batteryVoltage\":%d}",
             static_cast<int>(r.status),
             r.adcValue,
             FIRMWARE_VERSION,
             r.batteryAdcRaw);
  } else {
    snprintf(buf, sizeof(buf),
             "{\"status\":%d,\"voltage\":%d,\"firmwareVersion\":\"%s\"}",
             static_cast<int>(r.status),
             r.adcValue,
             FIRMWARE_VERSION);
  }
  return String(buf);
}

void toUpperMac(const char* in, char* out, size_t outSize) {
  size_t len = strnlen(in, outSize - 1);
  for (size_t i = 0; i < len; i++) {
    out[i] = static_cast<char>(toupper(static_cast<unsigned char>(in[i])));
  }
  out[len] = '\0';
}

void buildOtaSignatureInput(
    const char* mac, unsigned long ts,
    const char* boardType, const char* currentVersion, const char* channel,
    char* out, size_t outSize)
{
  char upperMac[18];
  toUpperMac(mac, upperMac, sizeof(upperMac));
  snprintf(out, outSize, "%s:%lu:%s:%s:%s", upperMac, ts, boardType, currentVersion, channel);
}

}  // namespace HomePulse
