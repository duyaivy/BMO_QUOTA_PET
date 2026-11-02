#include "power_manager.h"
#include "display.h"
#include "esp_pm.h"
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"

BMOPowerManager powerManager;

BMOPowerManager::BMOPowerManager()
    : _lastActivityTime(0),
      _screenAsleep(false) {}

void BMOPowerManager::begin() {
    _lastActivityTime = millis();

    // 1. ESP32-CAM Safety: Suppress the bright flash LED on GPIO 4 immediately!
    // On many ESP32-CAM boards, GPIO 4 floats high at boot causing a blinding flash
    // and drawing up to 1A from the power supply, triggering a brownout.
    #if defined(PIN_FLASH_LED) && (PIN_FLASH_LED >= 0)
    pinMode(PIN_FLASH_LED, OUTPUT);
    digitalWrite(PIN_FLASH_LED, LOW);
    #endif

    // Turn off onboard red LED on ESP32-CAM (GPIO 33, active LOW)
    #if defined(PIN_ONBOARD_LED) && (PIN_ONBOARD_LED >= 0)
    pinMode(PIN_ONBOARD_LED, OUTPUT);
    digitalWrite(PIN_ONBOARD_LED, HIGH); // HIGH = OFF on ESP32-CAM
    #endif

    // 2. CPU Frequency Scaling
    // Running at 160MHz instead of 240MHz reduces heat and saves ~40% CPU power
    // without sacrificing any animation or network performance.
    setCpuFrequencyMhz(160);
    Serial.printf("[POWER] CPU Frequency set to %d MHz (optimized for ESP32-CAM thermal stability)\n",
                  getCpuFrequencyMhz());
}

void BMOPowerManager::resetActivityTimer() {
    _lastActivityTime = millis();
    if (_screenAsleep) {
        wakeScreen();
    }
}

void BMOPowerManager::wakeScreen() {
    if (_screenAsleep) {
        _screenAsleep = false;
        auto& oled = display.getDriver();
        oled.ssd1306_command(SSD1306_DISPLAYON);
        Serial.println("[POWER] Screen woke from idle sleep.");
    }
}

void BMOPowerManager::update() {
    unsigned long now = millis();

    // Check if idle timeout has elapsed
    if (!_screenAsleep && (now - _lastActivityTime >= SCREEN_TIMEOUT_MS)) {
        _screenAsleep = true;
        auto& oled = display.getDriver();
        oled.ssd1306_command(SSD1306_DISPLAYOFF);
        Serial.println("[POWER] Screen entered sleep mode to preserve OLED life.");
    }
}
