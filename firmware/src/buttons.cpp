#include "buttons.h"

BMOButtonManager buttonManager;

BMOButtonManager::BMOButtonManager() {
    _btnA.pin = PIN_BUTTON_A;
    _btnA.lastRawState = HIGH;
    _btnA.debouncedState = HIGH;
    _btnA.lastDebounceTime = 0;
    _btnA.pressStartTime = 0;
    _btnA.clickedEvent = false;
    _btnA.heldEvent = false;

    _btnB.pin = PIN_BUTTON_B;
    _btnB.lastRawState = HIGH;
    _btnB.debouncedState = HIGH;
    _btnB.lastDebounceTime = 0;
    _btnB.pressStartTime = 0;
    _btnB.clickedEvent = false;
    _btnB.heldEvent = false;
}

void BMOButtonManager::begin() {
    // Buttons are wired between GPIO and GND (Active LOW)
    pinMode(_btnA.pin, INPUT_PULLUP);
    pinMode(_btnB.pin, INPUT_PULLUP);

    #if defined(ESP32)
    gpio_pulldown_dis((gpio_num_t)_btnA.pin);
    gpio_pullup_en((gpio_num_t)_btnA.pin);
    gpio_pulldown_dis((gpio_num_t)_btnB.pin);
    gpio_pullup_en((gpio_num_t)_btnB.pin);
    #endif

    delay(10);
    int rawA = digitalRead(_btnA.pin);
    int rawB = digitalRead(_btnB.pin);

    Serial.printf("[BUTTONS] Button A on GPIO %d (initial val=%d), Button B on GPIO %d (initial val=%d)\n",
                  _btnA.pin, rawA, _btnB.pin, rawB);
    if (rawB == LOW) {
        Serial.println("[BUTTONS] NOTE: Button B (GPIO 12) reads LOW at boot. If button is not pressed, check wiring.");
    }
}

void BMOButtonManager::update() {
    updateButton(_btnA);
    updateButton(_btnB);
}

void BMOButtonManager::updateButton(ButtonState& btn) {
    bool rawReading = digitalRead(btn.pin);
    unsigned long now = millis();

    if (rawReading != btn.lastRawState) {
        btn.lastDebounceTime = now;
        btn.lastRawState = rawReading;
    }

    if ((now - btn.lastDebounceTime) >= BUTTON_DEBOUNCE_MS) {
        // State has been stable for longer than debounce threshold
        if (rawReading != btn.debouncedState) {
            btn.debouncedState = rawReading;

            if (btn.debouncedState == LOW) {
                // Button just pressed down
                btn.pressStartTime = now;
                btn.heldEvent = false;
                Serial.printf("[BUTTONS] GPIO %d PRESSED\n", btn.pin);
            } else {
                // Button released
                unsigned long duration = now - btn.pressStartTime;
                if (duration < BUTTON_HOLD_MS) {
                    btn.clickedEvent = true;
                    Serial.printf("[BUTTONS] GPIO %d CLICKED (held %lums)\n", btn.pin, duration);
                }
            }
        } else if (btn.debouncedState == LOW) {
            // Button is being held down
            if (!btn.heldEvent && (now - btn.pressStartTime >= BUTTON_HOLD_MS)) {
                btn.heldEvent = true;
            }
        }
    }
}

bool BMOButtonManager::wasClicked(ButtonId btn) {
    ButtonState& b = (btn == ButtonId::BUTTON_A) ? _btnA : _btnB;
    if (b.clickedEvent) {
        b.clickedEvent = false; // Consume event
        return true;
    }
    return false;
}

bool BMOButtonManager::isHeld(ButtonId btn) {
    ButtonState& b = (btn == ButtonId::BUTTON_A) ? _btnA : _btnB;
    return b.heldEvent;
}
