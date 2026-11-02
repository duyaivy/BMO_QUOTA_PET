#pragma once

#include <Arduino.h>
#include "config.h"

enum class ButtonId {
    BUTTON_A,
    BUTTON_B
};

class BMOButtonManager {
public:
    BMOButtonManager();
    void begin();
    void update();

    // Check and consume click events
    bool wasClicked(ButtonId btn);
    bool isHeld(ButtonId btn);

private:
    struct ButtonState {
        uint8_t pin;
        bool lastRawState;
        bool debouncedState;
        unsigned long lastDebounceTime;
        unsigned long pressStartTime;
        bool clickedEvent;
        bool heldEvent;
    };

    ButtonState _btnA;
    ButtonState _btnB;

    void updateButton(ButtonState& btn);
};

extern BMOButtonManager buttonManager;
