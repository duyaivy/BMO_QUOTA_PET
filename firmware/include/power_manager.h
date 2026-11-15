#pragma once

#include <Arduino.h>
#include "config.h"

class BMOPowerManager {
public:
    BMOPowerManager();
    void begin();
    void resetActivityTimer();
    void update();
    bool shouldEnterSleep(uint32_t nowMs) const;
    bool enterButtonSleep();

    bool isScreenAsleep() const { return _screenAsleep; }
    void wakeScreen();

private:
    uint32_t _lastActivityTime;
    bool _screenAsleep;
    static const uint32_t SCREEN_TIMEOUT_MS = 300000;
};

extern BMOPowerManager powerManager;
