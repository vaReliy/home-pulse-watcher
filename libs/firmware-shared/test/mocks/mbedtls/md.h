#pragma once
#include <stddef.h>  // size_t
// Minimal mbedtls stub for host (native) unit tests.
// SecurityUtils.h is compiled but calculateSignature() is NOT called in tests
// that don't test security — this stub just allows compilation.
#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
  MBEDTLS_MD_SHA256 = 6,
} mbedtls_md_type_t;

typedef struct {
  const void* info;
  unsigned char hmac_ctx[128];
} mbedtls_md_context_t;

const struct mbedtls_md_info_t* mbedtls_md_info_from_type(mbedtls_md_type_t md_type);
void mbedtls_md_init(mbedtls_md_context_t* ctx);
void mbedtls_md_free(mbedtls_md_context_t* ctx);
int  mbedtls_md_setup(mbedtls_md_context_t* ctx,
                      const struct mbedtls_md_info_t* md_info,
                      int hmac);
int  mbedtls_md_hmac_starts(mbedtls_md_context_t* ctx,
                             const unsigned char* key, size_t keylen);
int  mbedtls_md_hmac_update(mbedtls_md_context_t* ctx,
                             const unsigned char* input, size_t ilen);
int  mbedtls_md_hmac_finish(mbedtls_md_context_t* ctx, unsigned char* output);

#ifdef __cplusplus
}
#endif
