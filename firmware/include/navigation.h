#pragma once

#include <Arduino.h>
#include "buttons.h"
#include "faces.h"
#include "quota_renderer.h"
#include "clock_renderer.h"
#include "calendar_renderer.h"

enum class UIMode {
    CLOCK,
    PAYMENT_QR,
    CALENDAR,
    PET_FACE,
    QUOTA_VIEW,
    END_OF_LIST
};

class BMONavigationController {
public:
    BMONavigationController();
    void begin();
    void update();
    void render();
    void showClock();

    UIMode getCurrentMode() const { return _mode; }
    uint8_t getCurrentQuotaIndex() const { return _quotaIndex; }

private:
    void handleButtonA();
    void handleButtonB();

    UIMode _mode;
    uint8_t _quotaIndex;
    unsigned long _endOfListEnteredAt;
    bool _forceClock;
    bool _forceQr;
    bool _forceCalendar;
};

extern BMONavigationController navigation;
