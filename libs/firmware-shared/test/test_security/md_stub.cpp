// Bring in the null-object mbedtls stub so the test_security binary links.
// The stub header lives at test/mocks/mbedtls/md.h (on the include path via -I test/mocks).
// PlatformIO only auto-compiles .cpp files inside src/ or the active per-suite test/ dir,
// so we use a one-liner shim here rather than duplicating the stub.
#include "../mocks/mbedtls/md_stub.cpp"
