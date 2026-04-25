#pragma once
// Minimal Preferences stub for native unit tests.
// credentials.h includes Preferences.h but tests only call credentialsAreUsable(),
// which never touches NVS. This stub just needs to compile cleanly under ArduinoFake.

#include <Arduino.h>

class Preferences {
public:
    bool   begin(const char*, bool = false) { return true; }
    void   end() {}
    String getString(const char*, const String& def = "") { return def; }
    bool   putString(const char*, const char*) { return true; }
    bool   putString(const char*, const String&) { return true; }
    bool   clear() { return true; }
};
