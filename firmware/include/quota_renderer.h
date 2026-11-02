#pragma once

#include <Arduino.h>
#include "contracts.h"
#include "display.h"

class BMOQuotaRenderer {
public:
    BMOQuotaRenderer();

    // Render a single quota screen by screen index
    void renderQuotaScreen(uint8_t quotaScreenIndex, bool wifiConnected, bool mqttConnected);

    // Format human-friendly reset duration
    static void formatDuration(int32_t seconds, char* outBuf, size_t bufSize);
};

extern BMOQuotaRenderer quotaRenderer;
