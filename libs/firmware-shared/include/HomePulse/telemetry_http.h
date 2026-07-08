#pragma once
#ifndef UNIT_TEST

#include <Arduino.h>
#include <HTTPClient.h>
#include <NetworkClient.h>
#include <time.h>

namespace HomePulse {

struct HttpResult {
  int statusCode;
  String body;
};

/**
 * POST a pre-built signed payload to the backend.
 * Sets Content-Type, X-Device-Mac, X-Timestamp, X-Signature headers.
 *
 * @param client Generic NetworkClient& so callers can pass either a plaintext
 *               WiFiClient or a WiFiClientSecure (see HomePulse/transport_client.h)
 *               — both are typedefs of NetworkClient/NetworkClientSecure in this
 *               ESP32 Arduino core, and HTTPClient::begin() dispatches on the
 *               underlying object via that shared base.
 */
HttpResult postSignedPayload(NetworkClient& client,
                             const String& url,
                             const String& payload,
                             const String& signature,
                             const String& mac,
                             time_t timestamp,
                             uint32_t timeoutMs);

}  // namespace HomePulse

#endif  // UNIT_TEST
