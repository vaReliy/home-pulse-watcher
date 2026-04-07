#ifndef HOMEPULSE_SECURITY_UTILS_H
#define HOMEPULSE_SECURITY_UTILS_H

#include <Arduino.h>
#include <mbedtls/md.h>

namespace HomePulse {

static const int kHmacHashLength = 32;  // SHA-256 output bytes
static const int kHmacHexLength  = 64;  // 2 hex chars per byte

/**
 * Compute HMAC-SHA256 signature and return as a 64-char hex string.
 *
 * @param payload  The string to sign (e.g. "MAC:TIMESTAMP:STATUS")
 * @param secret   The device secret key (null-terminated)
 * @return 64-character lowercase hex signature
 */
inline String calculateSignature(const String& payload, const char* secret) {
    uint8_t hash[kHmacHashLength];

    mbedtls_md_context_t ctx;
    mbedtls_md_init(&ctx);
    mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), 1);
    mbedtls_md_hmac_starts(&ctx, (const unsigned char*)secret, strlen(secret));
    mbedtls_md_hmac_update(&ctx, (const unsigned char*)payload.c_str(), payload.length());
    mbedtls_md_hmac_finish(&ctx, hash);
    mbedtls_md_free(&ctx);

    char hex[kHmacHexLength + 1];
    for (int i = 0; i < kHmacHashLength; i++) {
        sprintf(hex + (i * 2), "%02x", hash[i]);
    }
    hex[kHmacHexLength] = '\0';

    return String(hex);
}

}  // namespace HomePulse

#endif  // HOMEPULSE_SECURITY_UTILS_H
