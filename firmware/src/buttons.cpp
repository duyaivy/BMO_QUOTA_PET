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
    Serial.printf("[BUTTONS] Configured Button A on GPIO %d, Button B on GPIO %d (INPUT_PULLUP)\n",
                  _btnA.pin, _btnB.pin);
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
            } else {
                // Button released
                unsigned long duration = now - btn.pressStartTime;
                if (duration < BUTTON_HOLD_MS) {
                    btn.clickedEvent = true;
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
