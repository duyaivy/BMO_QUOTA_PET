#pragma once

#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include "config.h"

class BMODisplay {
public:
    BMODisplay();
    bool begin();
    void clear();
    void update();

    // Low-level graphics access
    Adafruit_SSD1306& getDriver() { return _oled; }

    // Primitive UI Widgets
    void drawProgressBar(int16_t x, int16_t y, int16_t w, int16_t h, float percent);
    void drawCenteredText(const char* text, int16_t y, uint8_t size = 1, bool highlight = false);
    void drawHeader(const char* title, bool wifiConnected, bool mqttConnected);
    void drawBitmap128x64(const uint8_t* bitmap);

    // Standard notification & status screens
    void showSplashScreen(const char* version = "v1.0-ESP32CAM");
    void showConnectingScreen(const char* stepName);
    void showEndOfListScreen();
    void showEmptyQuotaScreen();
    void showMessageScreen(const char* title, const char* line1, const char* line2 = nullptr);

    bool isReady() const { return _initialized; }

private:
    Adafruit_SSD1306 _oled;
    bool _initialized;
};

extern BMODisplay display;
