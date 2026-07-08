#ifndef UNIT_TEST

#include "HomePulse/telemetry_http.h"

namespace HomePulse {

HttpResult postSignedPayload(NetworkClient& client,
                             const String& url,
                             const String& payload,
                             const String& signature,
                             const String& mac,
                             time_t timestamp,
                             uint32_t timeoutMs) {
  HTTPClient http;
  http.begin(client, url);
  http.setTimeout(timeoutMs);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Mac", mac);
  http.addHeader("X-Timestamp", String(static_cast<unsigned long>(timestamp)));
  http.addHeader("X-Signature", signature);

  int code = http.POST(payload);
  String body;
  if (code > 0) {
    body = http.getString();
  }
  http.end();
  return {code, body};
}

}  // namespace HomePulse

#endif  // UNIT_TEST
