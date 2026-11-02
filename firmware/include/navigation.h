#pragma once

#include <Arduino.h>
#include "buttons.h"
#include "faces.h"
#include "quota_renderer.h"

enum class UIMode {
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

    UIMode getCurrentMode() const { return _mode; }
    uint8_t getCurrentQuotaIndex() const { return _quotaIndex; }

private:
    void handleButtonA();
    void handleButtonB();

    UIMode _mode;
    uint8_t _quotaIndex;
    unsigned long _endOfListEnteredAt;
};

extern BMONavigationController navigation;
