#ifndef HOMEPULSE_LED_H
#define HOMEPULSE_LED_H

/**
 * HomePulse Watcher - LED Helpers
 *
 * LED color control and non-blocking animation for WS2812B.
 * All functions take the NeoPixel instance by reference.
 *
 * Animations (call every loop iteration):
 *   tickBreathingLed(led)  — Orange breathing, 2-second cycle (config/portal mode)
 *   tickFlashLed(led)      — Rapid orange flash, 100ms interval (pairing/saving mode)
 *
 * Status colors:
 *   updateStatusLed(led, powerStatus) — Green (ON) or Red (OFF)
 */

#include <Adafruit_NeoPixel.h>

#include "config.h"

// ─── Animation Timing ────────────────────────────────────────────────────────

/** Full breathing cycle duration: ramp up + ramp down (milliseconds) */
#define LED_BREATHING_CYCLE_MS    2000

/** Breathing animation update rate — limits SPI traffic (~60fps) */
#define LED_BREATHING_UPDATE_MS   16

/** Rapid flash interval for pairing/saving mode (milliseconds) */
#define LED_FLASH_INTERVAL_MS     100

/** Fast blink cadence for OTA progress indication (milliseconds) */
#define LED_FAST_FLASH_INTERVAL_MS  80

// ─── Named Colors ─────────────────────────────────────────────────────────────

/** Orange: used for configuration mode animations */
#define LED_COLOR_ORANGE_R  255
#define LED_COLOR_ORANGE_G  80
#define LED_COLOR_ORANGE_B  0

/** Purple: used for factory reset confirmation signal */
#define LED_COLOR_PURPLE_R  128
#define LED_COLOR_PURPLE_G  0
#define LED_COLOR_PURPLE_B  255

/** White: dimmed for OTA progress (max ~60/255 per channel — stays within USB current budget) */
#define LED_COLOR_WHITE_R   60
#define LED_COLOR_WHITE_G   60
#define LED_COLOR_WHITE_B   60

// ─── Core Helpers ─────────────────────────────────────────────────────────────

/** Set WS2812 LED to an RGB color */
inline void setLedColor(Adafruit_NeoPixel& led, uint8_t r, uint8_t g, uint8_t b) {
    led.setPixelColor(0, led.Color(r, g, b));
    led.show();
}

/** Turn LED off */
inline void setLedOff(Adafruit_NeoPixel& led) {
    led.clear();
    led.show();
}

/** Set LED to power status color (green = ON, red = OFF) */
inline void updateStatusLed(Adafruit_NeoPixel& led, int powerStatus) {
    if (powerStatus == POWER_STATUS_ON) {
        setLedColor(led, 0, 255, 0);   // Green
    } else {
        setLedColor(led, 255, 0, 0);   // Red
    }
}

// ─── Animations ───────────────────────────────────────────────────────────────

/**
 * Non-blocking orange breathing animation (triangular ramp).
 *
 * Ramps brightness from 0 to peak over 1 second, then back down over 1 second
 * (full 2-second cycle). Rate-limited to ~60fps to avoid excess SPI traffic.
 * Call once per loop() iteration.
 */
inline void tickBreathingLed(Adafruit_NeoPixel& led) {
    static unsigned long lastUpdateMs = 0;
    unsigned long now = millis();
    if (now - lastUpdateMs < LED_BREATHING_UPDATE_MS) return;
    lastUpdateMs = now;

    // Position within the 2-second cycle (0–1999)
    uint16_t pos = (uint16_t)(now % LED_BREATHING_CYCLE_MS);

    // Triangular ramp: first half up, second half down
    uint8_t brightness;
    if (pos < LED_BREATHING_CYCLE_MS / 2) {
        brightness = (uint8_t)(pos * 255 / (LED_BREATHING_CYCLE_MS / 2));
    } else {
        brightness = (uint8_t)((LED_BREATHING_CYCLE_MS - pos) * 255 / (LED_BREATHING_CYCLE_MS / 2));
    }

    // Scale orange by brightness
    setLedColor(led,
        (uint8_t)((uint16_t)LED_COLOR_ORANGE_R * brightness / 255),
        (uint8_t)((uint16_t)LED_COLOR_ORANGE_G * brightness / 255),
        (uint8_t)((uint16_t)LED_COLOR_ORANGE_B * brightness / 255));
}

/**
 * Non-blocking rapid orange flash (100ms on/off).
 *
 * Toggles LED between orange and off at LED_FLASH_INTERVAL_MS period.
 * Used during credential save/pairing confirmation.
 * Call once per loop() iteration.
 */
inline void tickFlashLed(Adafruit_NeoPixel& led) {
    static unsigned long lastToggleMs = 0;
    static bool ledOn = false;
    unsigned long now = millis();
    if (now - lastToggleMs < LED_FLASH_INTERVAL_MS) return;
    lastToggleMs = now;

    ledOn = !ledOn;
    if (ledOn) {
        setLedColor(led, LED_COLOR_ORANGE_R, LED_COLOR_ORANGE_G, LED_COLOR_ORANGE_B);
    } else {
        setLedOff(led);
    }
}

/**
 * Non-blocking fast white blink for OTA download/flash progress.
 *
 * Toggles white/off every LED_FAST_FLASH_INTERVAL_MS (80ms).
 * Call once per loop() iteration while OTA is active.
 */
inline void tickFastWhiteLed(Adafruit_NeoPixel& led) {
    static unsigned long lastToggleMs = 0;
    static bool ledOn = false;
    unsigned long now = millis();
    if (now - lastToggleMs < LED_FAST_FLASH_INTERVAL_MS) return;
    lastToggleMs = now;

    ledOn = !ledOn;
    if (ledOn) {
        setLedColor(led, LED_COLOR_WHITE_R, LED_COLOR_WHITE_G, LED_COLOR_WHITE_B);
    } else {
        setLedOff(led);
    }
}

#endif // HOMEPULSE_LED_H
