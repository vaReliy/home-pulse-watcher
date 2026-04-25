#pragma once
// Preferences stub for native unit tests.
// Backed by an in-memory map so saveCredentials→loadCredentials round-trips work.
// Call Preferences::resetAll() between tests to clear state.

#include <Arduino.h>
#include <map>
#include <string>

class Preferences {
public:
    bool begin(const char* ns, bool = false) {
        _ns = ns ? std::string(ns) : "";
        return true;
    }
    void end() {}

    String getString(const char* key, const String& def = "") {
        auto nsIt = store().find(_ns);
        if (nsIt != store().end()) {
            auto it = nsIt->second.find(key ? std::string(key) : "");
            if (it != nsIt->second.end()) {
                return String(it->second.c_str());
            }
        }
        return def;
    }

    bool putString(const char* key, const char* value) {
        store()[_ns][key ? std::string(key) : ""] = value ? std::string(value) : "";
        return true;
    }
    bool putString(const char* key, const String& value) {
        return putString(key, value.c_str());
    }

    bool clear() {
        store()[_ns].clear();
        return true;
    }

    /** Reset all namespaces — call in tearDown() between tests. */
    static void resetAll() { store().clear(); }

private:
    std::string _ns;

    static std::map<std::string, std::map<std::string, std::string>>& store() {
        static std::map<std::string, std::map<std::string, std::string>> s;
        return s;
    }
};
