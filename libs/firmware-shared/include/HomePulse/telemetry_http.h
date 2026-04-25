#pragma once
#ifndef UNIT_TEST

#include <Arduino.h>
#include <HTTPClient.h>
#include <time.h>

namespace HomePulse {

struct HttpResult {
  int statusCode;
  String body;
};

/**
 * POST a pre-built signed payload to the backend.
 * Sets Content-Type, X-Device-Mac, X-Timestamp, X-Signature headers.
 */
HttpResult postSignedPayload(WiFiClient& client,
                             const String& url,
                             const String& payload,
                             const String& signature,
                             const String& mac,
                             time_t timestamp,
                             uint32_t timeoutMs);

}  // namespace HomePulse

#endif  // UNIT_TEST
