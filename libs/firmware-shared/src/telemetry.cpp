#include "HomePulse/telemetry.h"

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

}  // namespace HomePulse
