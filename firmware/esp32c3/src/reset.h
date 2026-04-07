#ifndef RESET_H
#define RESET_H

/**
 * HomePulse Watcher - Factory Reset via BOOT Button
 *
 * Polls GPIO9 (BOOT button, active LOW) during loop().
 * Holding for 10 seconds triggers a factory reset:
 *   0–10s: orange LED blinks with linearly accelerating rate
 *   At 10s: purple LED for 1 second (confirmation)
 *   Action: wipe NVS credentials + restart into captive portal
 *
 * Usage:
 *   setup() → initResetButton();
 *   loop()  → pollResetButton(led, lastPowerStatus);
 */

#include <Arduino.h>
#include <Adafruit_NeoPixel.h>

#include "credentials.h"
#include "led.h"

// ─── Constants ────────────────────────────────────────────────────────────────

/** GPIO9 = onboard BOOT button (active LOW, internal pull-up) */
#define RESET_BUTTON_PIN         9

/** Hold duration required to trigger factory reset (milliseconds) */
#define RESET_HOLD_DURATION_MS   10000

/** Orange blink interval at the very start of a hold (slow) */
#define RESET_BLINK_START_MS     500

/** Orange blink interval approaching the 10-second mark (fast) */
#define RESET_BLINK_END_MS       50

/** Purple confirmation flash duration before restart (milliseconds) */
#define RESET_CONFIRM_MS         1000

// ─── Module State ─────────────────────────────────────────────────────────────

static unsigned long _resetPressStart = 0;   ///< millis() when button was first pressed
static bool          _resetHeld       = false; ///< whether button is currently being tracked
static unsigned long _resetLastBlink  = 0;   ///< millis() of last LED blink toggle
static bool          _resetBlinkState = false; ///< current blink LED on/off state

// ─── Functions ────────────────────────────────────────────────────────────────

/** Configure BOOT button pin. Call once from setup(). */
inline void initResetButton() {
    pinMode(RESET_BUTTON_PIN, INPUT_PULLUP);
    Serial.printf("Reset button: GPIO%d (hold %ds for factory reset)\n",
                  RESET_BUTTON_PIN, RESET_HOLD_DURATION_MS / 1000);
}

/**
 * Poll BOOT button and handle progressive-blink + factory reset.
 *
 * Call at the top of every loop() iteration.
 *
 * @param led              WS2812B LED instance
 * @param currentPowerStatus  Current confirmed power status (restored on early release)
 */
inline void pollResetButton(Adafruit_NeoPixel& led, int currentPowerStatus) {
    bool pressed = (digitalRead(RESET_BUTTON_PIN) == LOW);

    if (pressed) {
        unsigned long now = millis();

        if (!_resetHeld) {
            // Button just pressed — start tracking
            _resetHeld       = true;
            _resetPressStart = now;
            _resetLastBlink  = now;
            _resetBlinkState = true;
            setLedColor(led, LED_COLOR_ORANGE_R, LED_COLOR_ORANGE_G, LED_COLOR_ORANGE_B);
            Serial.println("Reset button held — keep holding for 10s to factory reset");
            return;
        }

        unsigned long holdTime = now - _resetPressStart;

        // Factory reset threshold reached
        if (holdTime >= RESET_HOLD_DURATION_MS) {
            Serial.println("Factory reset triggered!");

            // Purple confirmation flash (blocking — we are about to restart anyway)
            setLedColor(led, LED_COLOR_PURPLE_R, LED_COLOR_PURPLE_G, LED_COLOR_PURPLE_B);
            delay(RESET_CONFIRM_MS);

            wipeCredentials();
            Serial.println("Credentials wiped. Restarting...");
            ESP.restart();
            return; // unreachable, but satisfies compiler
        }

        // Progressive orange blink — linearly accelerate from slow to fast
        // interval = RESET_BLINK_START_MS - (range * holdTime / RESET_HOLD_DURATION_MS)
        unsigned long range = RESET_BLINK_START_MS - RESET_BLINK_END_MS;
        unsigned long blinkInterval = RESET_BLINK_START_MS - (range * holdTime / RESET_HOLD_DURATION_MS);

        if (now - _resetLastBlink >= blinkInterval) {
            _resetLastBlink  = now;
            _resetBlinkState = !_resetBlinkState;
            if (_resetBlinkState) {
                setLedColor(led, LED_COLOR_ORANGE_R, LED_COLOR_ORANGE_G, LED_COLOR_ORANGE_B);
            } else {
                setLedOff(led);
            }
        }

    } else if (_resetHeld) {
        // Button released before 10s — cancel reset, restore status LED
        _resetHeld       = false;
        _resetBlinkState = false;
        Serial.println("Reset button released — factory reset cancelled");
        updateStatusLed(led, currentPowerStatus);
    }
}

#endif // RESET_H
