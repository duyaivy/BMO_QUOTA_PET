#pragma once

#include <Arduino.h>

// Draws a decorative 13x7 rounded battery icon with 3 charge bars.
template <typename OLED>
inline void drawBatteryIcon(OLED& oled, int ox, int oy) {
    constexpr uint16_t batteryRows[] = {
        0b0111111111100,
        0b1000000000010,
        0b1011011011011,
        0b1011011011011,
        0b1011011011011,
        0b1000000000010,
        0b0111111111100,
    };
    for (int y = 0; y < 7; ++y) {
        for (int x = 0; x < 13; ++x) {
            if (batteryRows[y] & (1u << (12 - x))) {
                oled.drawPixel(ox + x, oy + y, SSD1306_WHITE);
            }
        }
    }
}

// Draws the top-right status icon in a 13x8 slot:
// 11x8 Wi-Fi signal icon when connected, or 13x7 decorative battery icon when offline.
template <typename OLED>
inline void drawWifiStatusIcon(OLED& oled, int ox, int oy, bool wifiConnected) {
    if (!wifiConnected) {
        drawBatteryIcon(oled, ox, oy);
        return;
    }

    constexpr uint16_t wifiRows[] = {
        0b00111111100,
        0b01000000010,
        0b10011111001,
        0b00100000100,
        0b00001110000,
        0b00010001000,
        0b00000000000,
        0b00000100000,
    };
    for (int y = 0; y < 8; ++y) {
        for (int x = 0; x < 11; ++x) {
            if (wifiRows[y] & (1u << (10 - x))) {
                oled.drawPixel(ox + 1 + x, oy + y, SSD1306_WHITE);
            }
        }
    }
}
