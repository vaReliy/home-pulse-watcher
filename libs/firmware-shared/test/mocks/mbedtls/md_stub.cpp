#ifdef UNIT_TEST
#include "mbedtls/md.h"
#include <cstring>
#include <cstdlib>

// Null-object implementations — tests that actually test HMAC
// must provide a real mbedtls or use the system libmbedcrypto.
// These stubs allow compilation of files that include SecurityUtils.h.

const struct mbedtls_md_info_t* mbedtls_md_info_from_type(mbedtls_md_type_t) { return nullptr; }
void mbedtls_md_init(mbedtls_md_context_t* ctx) { memset(ctx, 0, sizeof(*ctx)); }
void mbedtls_md_free(mbedtls_md_context_t*) {}
int  mbedtls_md_setup(mbedtls_md_context_t*, const struct mbedtls_md_info_t*, int) { return -1; }
int  mbedtls_md_hmac_starts(mbedtls_md_context_t*, const unsigned char*, size_t) { return -1; }
int  mbedtls_md_hmac_update(mbedtls_md_context_t*, const unsigned char*, size_t) { return -1; }
int  mbedtls_md_hmac_finish(mbedtls_md_context_t*, unsigned char*) { return -1; }
#endif
