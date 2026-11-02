#pragma once

#include <Arduino.h>
#include "config.h"

class BMOPowerManager {
public:
    BMOPowerManager();
    void begin();
    void resetActivityTimer();
    void update();

    bool isScreenAsleep() const { return _screenAsleep; }
    void wakeScreen();

private:
    unsigned long _lastActivityTime;
    bool _screenAsleep;
    static const unsigned long SCREEN_TIMEOUT_MS = 300000; // 5 minutes idle screen saver
};

extern BMOPowerManager powerManager;
