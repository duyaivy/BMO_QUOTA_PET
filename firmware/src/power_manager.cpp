#include "power_manager.h"
#include "display.h"
#include "esp_pm.h"
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"
#include "esp_sleep.h"
#include "driver/gpio.h"

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

bool BMOPowerManager::shouldEnterSleep(uint32_t nowMs) const {
    return !_screenAsleep && uint32_t(nowMs - _lastActivityTime) >= SCREEN_TIMEOUT_MS &&
           digitalRead(PIN_BUTTON_A) == HIGH && digitalRead(PIN_BUTTON_B) == HIGH;
}

bool BMOPowerManager::enterButtonSleep() {
    if (!shouldEnterSleep(millis())) return false;
    _screenAsleep = true;
    display.getDriver().ssd1306_command(SSD1306_DISPLAYOFF);
    // GPIO light sleep wake uses ANY low-level button; no timer wake source.
    esp_sleep_disable_wakeup_source(ESP_SLEEP_WAKEUP_ALL);
    gpio_wakeup_enable(static_cast<gpio_num_t>(PIN_BUTTON_A), GPIO_INTR_LOW_LEVEL);
    gpio_wakeup_enable(static_cast<gpio_num_t>(PIN_BUTTON_B), GPIO_INTR_LOW_LEVEL);
    esp_sleep_enable_gpio_wakeup();
    esp_err_t result = esp_light_sleep_start();
    gpio_wakeup_disable(static_cast<gpio_num_t>(PIN_BUTTON_A));
    gpio_wakeup_disable(static_cast<gpio_num_t>(PIN_BUTTON_B));
    if (result != ESP_OK) Serial.printf("[POWER] Light sleep failed: %d\n", result);
    wakeScreen();
    _lastActivityTime = millis();
    return result == ESP_OK;
}

void BMOPowerManager::update() {
    // Main orchestrates sleep only after network worker/radio have stopped.
}
