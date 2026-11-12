#pragma once

#include <Arduino.h>
#include "contracts.h"
#include "display.h"

class BMOQuotaRenderer {
public:
    BMOQuotaRenderer();

    // Render a single quota screen by page index
    void renderQuotaScreen(uint8_t pageIndex, bool wifiConnected, bool mqttConnected);

    // Render an individual quota card
    void renderQuotaCard(int16_t y, int16_t h, const SnapshotWindow* sw, const char* defaultBadge);

    // Format ISO 8601 UTC reset countdown with duration fallback
    static void formatResetCountdown(const char* resetAtStr, int32_t fallbackWindowSeconds, char* outBuf, size_t bufSize);

    // Format human-friendly reset duration
    static void formatDuration(int32_t seconds, char* outBuf, size_t bufSize);
};

extern BMOQuotaRenderer quotaRenderer;
