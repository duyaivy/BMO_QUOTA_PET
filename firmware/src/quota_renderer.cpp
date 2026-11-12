#include "quota_renderer.h"
#include "mqtt_client.h"
#include <time.h>
#include <stdio.h>
#include <string.h>
#include <ctype.h>

BMOQuotaRenderer quotaRenderer;

BMOQuotaRenderer::BMOQuotaRenderer() {}

static bool containsIgnoreCase(const char* str, const char* sub) {
    if (!str || !sub) return false;
    size_t strLen = strlen(str);
    size_t subLen = strlen(sub);
    if (subLen == 0) return true;
    if (strLen < subLen) return false;
    for (size_t i = 0; i <= strLen - subLen; i++) {
        bool match = true;
        for (size_t j = 0; j < subLen; j++) {
            if (tolower((unsigned char)str[i + j]) != tolower((unsigned char)sub[j])) {
                match = false;
                break;
            }
        }
        if (match) return true;
    }
    return false;
}

static time_t parseIsoUtcToEpoch(const char* isoStr) {
    if (!isoStr || isoStr[0] == '\0') return -1;
    int y = 0, m = 0, d = 0, h = 0, min = 0, s = 0;
    int count = sscanf(isoStr, "%d-%d-%dT%d:%d:%d", &y, &m, &d, &h, &min, &s);
    if (count < 5) {
        count = sscanf(isoStr, "%d-%d-%d %d:%d:%d", &y, &m, &d, &h, &min, &s);
    }
    if (count < 5) {
        return -1;
    }
    if (count == 5) {
        s = 0;
    }
    if (y < 2020 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31 ||
        h < 0 || h > 23 || min < 0 || min > 59 || s < 0 || s > 60) {
        return -1;
    }
    if (m <= 2) {
        y -= 1;
        m += 12;
    }
    int64_t era = (y >= 0 ? y : y - 399) / 400;
    unsigned yoe = static_cast<unsigned>(y - era * 400);
    unsigned doy = (153 * (m - 3) + 2) / 5 + d - 1;
    unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    int64_t days = era * 146097 + static_cast<int64_t>(doe) - 719468;
    return static_cast<time_t>(days * 86400 + h * 3600 + min * 60 + s);
}

static void getProviderDisplayName(const char* providerId, char* outBuf, size_t bufSize) {
    if (!outBuf || bufSize == 0) return;
    if (!providerId || providerId[0] == '\0') {
        snprintf(outBuf, bufSize, "Quota");
        return;
    }
    if (strcasecmp(providerId, "codex") == 0) {
        snprintf(outBuf, bufSize, "Codex");
    } else if (strcasecmp(providerId, "claude") == 0) {
        snprintf(outBuf, bufSize, "Claude");
    } else if (strcasecmp(providerId, "antigravity") == 0 || strcasecmp(providerId, "gemini") == 0) {
        snprintf(outBuf, bufSize, "Gemini");
    } else {
        size_t len = strlen(providerId);
        if (len >= bufSize) len = bufSize - 1;
        for (size_t i = 0; i < len; i++) {
            outBuf[i] = (i == 0) ? toupper((unsigned char)providerId[i]) : tolower((unsigned char)providerId[i]);
        }
        outBuf[len] = '\0';
    }
}

void BMOQuotaRenderer::formatDuration(int32_t seconds, char* outBuf, size_t bufSize) {
    if (!outBuf || bufSize == 0) return;
    if (seconds <= 0) {
        snprintf(outBuf, bufSize, "Ready");
        return;
    }
    int hours = seconds / 3600;
    int mins = (seconds % 3600) / 60;
    if (hours > 0) {
        snprintf(outBuf, bufSize, "%dh %dm", hours, mins);
    } else {
        snprintf(outBuf, bufSize, "%dm", mins);
    }
}

void BMOQuotaRenderer::formatResetCountdown(const char* resetAtStr, int32_t fallbackWindowSeconds, char* outBuf, size_t bufSize) {
    if (!outBuf || bufSize == 0) return;

    time_t now = time(nullptr);
    time_t resetEpoch = parseIsoUtcToEpoch(resetAtStr);
    bool timeSynced = (now >= 1700000000);

    if (resetEpoch > 0 && timeSynced) {
        int64_t diff = static_cast<int64_t>(resetEpoch) - static_cast<int64_t>(now);
        if (diff > 0) {
            int days = diff / 86400;
            int hours = (diff % 86400) / 3600;
            int minutes = (diff % 3600) / 60;
            if (days > 0) {
                snprintf(outBuf, bufSize, "Resets in %dd %dh", days, hours);
            } else if (hours > 0) {
                snprintf(outBuf, bufSize, "Resets in %dh %dm", hours, minutes);
            } else if (minutes > 0) {
                snprintf(outBuf, bufSize, "Resets in %dm", minutes);
            } else {
                snprintf(outBuf, bufSize, "Resets in <1m");
            }
        } else {
            snprintf(outBuf, bufSize, "Resets now");
        }
        return;
    }

    // Fallback when parsing failed or time not synced
    if (fallbackWindowSeconds > 0) {
        int days = fallbackWindowSeconds / 86400;
        int hours = (fallbackWindowSeconds % 86400) / 3600;
        int minutes = (fallbackWindowSeconds % 3600) / 60;
        if (days > 0) {
            snprintf(outBuf, bufSize, "Window: %dd %dh", days, hours);
        } else if (hours > 0) {
            snprintf(outBuf, bufSize, "Window: %dh %dm", hours, minutes);
        } else if (minutes > 0) {
            snprintf(outBuf, bufSize, "Window: %dm", minutes);
        } else {
            snprintf(outBuf, bufSize, "Resets soon");
        }
    } else {
        snprintf(outBuf, bufSize, "Resets soon");
    }
}

void BMOQuotaRenderer::renderQuotaCard(int16_t y, int16_t h, const SnapshotWindow* sw, const char* defaultBadge) {
    if (!sw) return;

    auto& oled = display.getDriver();
    oled.drawRoundRect(0, y, 128, h, 3, SSD1306_WHITE);

    // Calculate remaining %
    float rem = -1.0f;
    if (sw->remainingPercent >= 0.0f) {
        rem = sw->remainingPercent;
    } else if (sw->usedPercent >= 0.0f) {
        rem = 100.0f - sw->usedPercent;
    }
    if (rem >= 0.0f) {
        if (rem < 0.0f) rem = 0.0f;
        if (rem > 100.0f) rem = 100.0f;
    }

    // Row 1: Left: % remaining
    char pctStr[16];
    if (rem >= 0.0f) {
        snprintf(pctStr, sizeof(pctStr), "%.0f%%", rem);
    } else {
        snprintf(pctStr, sizeof(pctStr), "---%%");
    }

    oled.setTextSize(1);
    oled.setTextColor(SSD1306_WHITE);
    oled.setCursor(4, y + 2);
    oled.print(pctStr);

    // Row 1: Right: Pill badge
    const char* badgeText = defaultBadge ? defaultBadge : "Quota";
    int16_t badgeTextW = (int16_t)(strlen(badgeText) * 6);
    int16_t badgeW = badgeTextW + 6;
    int16_t badgeX = 124 - badgeW;
    if (badgeX < 40) badgeX = 40;

    oled.drawRoundRect(badgeX, y + 1, badgeW, 8, 2, SSD1306_WHITE);
    oled.setCursor(badgeX + 3, y + 2);
    oled.print(badgeText);

    // Row 2: Progress bar
    display.drawProgressBar(4, y + 11, 120, 4, rem >= 0.0f ? rem : 0.0f);

    // Row 3: Countdown text
    char countdownBuf[32];
    formatResetCountdown(sw->resetAt, sw->windowDurationSeconds, countdownBuf, sizeof(countdownBuf));
    oled.setCursor(4, y + 17);
    oled.print(countdownBuf);
}

void BMOQuotaRenderer::renderQuotaScreen(uint8_t pageIndex, bool wifiConnected, bool mqttConnected) {
    display.clear();

    if (mqttClient.isRetired()) {
        display.showMessageScreen("DEVICE RETIRED", "Re-enable in dashboard", "to resume updates");
        return;
    }

    uint8_t totalPages = mqttClient.getTotalQuotaPages();
    if (totalPages == 0) {
        display.showEmptyQuotaScreen();
        return;
    }

    if (pageIndex >= totalPages) {
        pageIndex = 0;
    }

    const char* providerId = nullptr;
    const SnapshotWindow* sw = nullptr;
    const char* defaultBadge = "Quota";
    if (!mqttClient.getQuotaPage(pageIndex, &providerId, &sw, &defaultBadge) || !providerId) {
        display.showEmptyQuotaScreen();
        return;
    }

    char providerDisplayName[32];
    getProviderDisplayName(providerId, providerDisplayName, sizeof(providerDisplayName));

    auto& oled = display.getDriver();

    // Draw Header (y = 0..10)
    display.drawProviderIcon(providerId, 1, 0);

    oled.setTextSize(1);
    oled.setTextColor(SSD1306_WHITE);
    oled.setCursor(15, 2);
    oled.print(providerDisplayName);

    // Status indicators (WiFi & MQTT)
    if (wifiConnected) {
        oled.drawPixel(114, 4, SSD1306_WHITE);
        oled.drawFastHLine(113, 2, 3, SSD1306_WHITE);
        oled.drawFastHLine(112, 0, 5, SSD1306_WHITE);
    } else {
        oled.setCursor(112, 0);
        oled.print("xW");
    }

    if (mqttConnected) {
        oled.fillCircle(124, 2, 2, SSD1306_WHITE);
    } else {
        oled.drawCircle(124, 2, 2, SSD1306_WHITE);
    }

    oled.drawFastHLine(0, 10, 128, SSD1306_WHITE);

    // If no window data for this provider, show awaiting card
    if (!sw) {
        oled.drawRoundRect(0, 14, 128, 48, 3, SSD1306_WHITE);
        display.drawCenteredText("Awaiting quota", 26, 1);
        display.drawCenteredText("data...", 38, 1);
        display.update();
        return;
    }

    // Full-height single card layout (y = 14, h = 48)
    oled.drawRoundRect(0, 14, 128, 48, 3, SSD1306_WHITE);

    // Calculate remaining %
    float rem = -1.0f;
    if (sw->remainingPercent >= 0.0f) {
        rem = sw->remainingPercent;
    } else if (sw->usedPercent >= 0.0f) {
        rem = 100.0f - sw->usedPercent;
    }
    if (rem >= 0.0f) {
        if (rem < 0.0f) rem = 0.0f;
        if (rem > 100.0f) rem = 100.0f;
    }

    char pctStr[16];
    if (rem >= 0.0f) {
        snprintf(pctStr, sizeof(pctStr), "%.0f%%", rem);
    } else {
        snprintf(pctStr, sizeof(pctStr), "---%%");
    }

    // Row 1: Left: Large % text (TextSize 2)
    oled.setTextSize(2);
    oled.setCursor(6, 18);
    oled.print(pctStr);

    // Row 1: Right: Pill badge with label
    const char* badgeText = defaultBadge ? defaultBadge : "Quota";
    oled.setTextSize(1);
    int16_t badgeW = (int16_t)(strlen(badgeText) * 6 + 6);
    int16_t badgeX = 122 - badgeW;
    if (badgeX < 64) badgeX = 64;

    oled.drawRoundRect(badgeX, 20, badgeW, 10, 2, SSD1306_WHITE);
    oled.setCursor(badgeX + 3, 21);
    oled.print(badgeText);

    // Row 2: Progress bar at (6, 38, 116, 6)
    display.drawProgressBar(6, 38, 116, 6, rem >= 0.0f ? rem : 0.0f);

    // Row 3: Countdown text at (6, 48)
    char countdownBuf[32];
    formatResetCountdown(sw->resetAt, sw->windowDurationSeconds, countdownBuf, sizeof(countdownBuf));
    oled.setTextSize(1);
    oled.setCursor(6, 48);
    oled.print(countdownBuf);

    display.update();
}
