#include "quota_renderer.h"
#include "mqtt_client.h"
#include <time.h>

static bool expired(const char* value) {
    struct tm parsed = {};
    time_t now = time(nullptr);
    if (now < 1700000000 || !strptime(value, "%Y-%m-%dT%H:%M:%S", &parsed)) return true;
    return now >= mktime(&parsed);
}


BMOQuotaRenderer quotaRenderer;

BMOQuotaRenderer::BMOQuotaRenderer() {}

void BMOQuotaRenderer::formatDuration(int32_t seconds, char* outBuf, size_t bufSize) {
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

void BMOQuotaRenderer::renderQuotaScreen(uint8_t quotaScreenIndex, bool wifiConnected, bool mqttConnected) {
    display.clear();

    if (mqttClient.isRetired()) {
        display.showMessageScreen("DEVICE RETIRED", "Re-enable in dashboard", "to resume updates");
        return;
    }

    uint8_t totalQuotaScreens = mqttClient.getQuotaScreenCount();
    if (totalQuotaScreens == 0) {
        display.showEmptyQuotaScreen();
        return;
    }

    if (quotaScreenIndex >= totalQuotaScreens) {
        quotaScreenIndex = 0;
    }

    const ConfigScreen* configScreen = mqttClient.getQuotaScreenAt(quotaScreenIndex);
    if (!configScreen) {
        display.showEmptyQuotaScreen();
        return;
    }

    // Build header title: e.g. "CLAUDE [1/3]"
    char headerTitle[32];
    char providerUpper[16];
    strncpy(providerUpper, configScreen->providerId, sizeof(providerUpper) - 1);
    providerUpper[sizeof(providerUpper) - 1] = '\0';
    for (int i = 0; providerUpper[i]; i++) {
        providerUpper[i] = toupper((unsigned char)providerUpper[i]);
    }
    snprintf(headerTitle, sizeof(headerTitle), "%s [%d/%d]",
             providerUpper, quotaScreenIndex + 1, totalQuotaScreens);

    display.drawHeader(headerTitle, wifiConnected, mqttConnected);

    // Look up snapshot data for this provider & window
    const SnapshotWindow* sw = mqttClient.findSnapshotWindow(configScreen->providerId, configScreen->windowId);

    auto& oled = display.getDriver();

    if (!sw) {
        // Window referenced in config but not yet received in snapshot
        oled.setTextSize(1);
        oled.setCursor(4, 16);
        oled.print(configScreen->windowId);

        oled.setTextSize(2);
        oled.setCursor(20, 30);
        oled.print("Awaiting");

        oled.setTextSize(1);
        oled.setCursor(4, 52);
        oled.print("Status: UNAVAILABLE");
        display.update();
        return;
    }

    // 1. Window Label
    oled.setTextSize(1);
    oled.setTextColor(SSD1306_WHITE);
    oled.setCursor(2, 14);
    oled.print(sw->label);

    // 2. Percentage display & Progress bar
    if (sw->usedPercent >= 0.0f) {
        char pctStr[16];
        snprintf(pctStr, sizeof(pctStr), "%.0f%%", sw->usedPercent);

        oled.setTextSize(2);
        oled.setCursor(4, 25);
        oled.print(pctStr);

        // Draw progress bar next to or under percentage
        display.drawProgressBar(60, 28, 64, 10, sw->usedPercent);
    } else {
        oled.setTextSize(2);
        oled.setCursor(4, 25);
        oled.print("---%");
        display.drawProgressBar(60, 28, 64, 10, 0.0f);
    }

    // 3. Status Badge & Details
    oled.setTextSize(1);
    oled.setCursor(2, 45);

    if (sw->dataStatus == DataStatus::STATUS_OK) {
        if (expired(sw->validUntil) || expired(mqttClient.getSnapshot().validUntil) || sw->sourceFreshness == SourceFreshness::STALE) {
            oled.print("[STALE] ");
        } else {
            oled.print(sw->sourceFreshness == SourceFreshness::FRESH ? "[OK] " : "[UNKNOWN] ");
        }
    } else if (sw->dataStatus == DataStatus::STATUS_UNAVAILABLE) {
        oled.print("[UNAVAILABLE] ");
    } else if (sw->dataStatus == DataStatus::STATUS_UNSUPPORTED) {
        oled.print("[UNSUPPORTED] ");
    } else {
        oled.print("[ERROR] ");
    }

    // Reset or window duration info
    if (sw->windowDurationSeconds > 0) {
        char durBuf[16];
        formatDuration(sw->windowDurationSeconds, durBuf, sizeof(durBuf));
        oled.print("Win: ");
        oled.print(durBuf);
    }

    // Bottom hint for buttons
    oled.setCursor(2, 55);
    oled.print("[A]Face  [B]Next Quota");

    display.update();
}
