#include <Arduino.h>
#include "config.h"
#include "display.h"
#include "wifi_manager.h"
#include "mqtt_client.h"
#include "buttons.h"
#include "navigation.h"
#include "power_manager.h"
#include "wake_session.h"

namespace {
class DeviceWakeTransport final : public BMOWakeTransport {
public:
    void startWakeConnection() override { connManager.startWakeConnection(); }
    bool isWifiConnected() const override { return connManager.isWifiConnected(); }
    void requestTimeSync() override { connManager.requestTimeSync(); }
    bool hasTrustedTime() const override { return connManager.isTimeSynced(); }
    void startMqttConnection() override { mqttClient.startWakeConnection(); }
    bool hasConfig() const override { return mqttClient.hasWakeConfig(); }
    bool hasMatchingSnapshot() const override { return mqttClient.hasWakeSnapshot(); }
    bool hasWeatherResponse() const override { return mqttClient.hasWakeWeather(); }
    void stopForSleep() override {
        mqttClient.stopForSleep();
        connManager.stopForSleep();
    }
};
DeviceWakeTransport wakeTransport;
BMOWakeSession wakeSession(wakeTransport);
}

static unsigned long lastFrameTick = 0;

void setup() {
    Serial.begin(115200);
    delay(500); // Short settle delay for serial monitor
    Serial.println("\n==============================================");
    Serial.println("  BMO PERSONAL DESK PET - ESP32-CAM FIRMWARE  ");
    Serial.println("==============================================");

    // 1. Initialize Power & Hardware Pin Protections (Flash LED suppression, CPU clock)
    powerManager.begin();

    // 2. Initialize Hardware Buttons
    buttonManager.begin();

    // 3. Initialize OLED Display (I2C SDA=GPIO 13, SCL=GPIO 14 for ESP32-CAM)
    if (!display.begin()) {
        Serial.println("[MAIN] Fatal: OLED display failed to initialize! Halting.");
        while (true) {
            delay(1000);
        }
    }

    // Clock is the first normal boot face, even while network setup runs.
    navigation.begin();
    navigation.render();

    // Bench build exercises the real UI without network credentials or services.
#if defined(BMO_BENCH_OFFLINE) && BMO_BENCH_OFFLINE
    Serial.println("[BENCH] Offline OLED/buttons test; Wi-Fi and MQTT disabled.");
#else
    bool resetTriggered = false;
    // Boot-only long hold deliberately opens provisioning; wake failures never do.
    if (digitalRead(PIN_BUTTON_A) == LOW) {
        display.showMessageScreen("WI-FI SETUP", "Hold 3s to reset...", "Release to cancel");
        unsigned long pressStart = millis();
        while (digitalRead(PIN_BUTTON_A) == LOW) {
            if (millis() - pressStart >= 3000) {
                resetTriggered = true;
                display.showMessageScreen("WI-FI RESET", "Settings Cleared!", "Opening Setup AP...");
                delay(1200);
                break;
            }
            delay(50);
        }
    }

    connManager.begin();
    if (resetTriggered) connManager.resetWifiSettings();
    if (resetTriggered || connManager.needsProvisioning()) {
        connManager.openConfigPortal();
        navigation.showClock();
    }
    mqttClient.begin();
    wakeSession.begin(millis());
#endif

    Serial.println("[MAIN] Boot sequence complete. Starting main loop.");
}

void loop() {
    unsigned long now = millis();

    // 1. Service Network & Background Tasks (Non-blocking)
#if !defined(BMO_BENCH_OFFLINE) || !BMO_BENCH_OFFLINE
    connManager.loop();
    mqttClient.loop();
    wakeSession.update(now);
#endif

    // 2. Poll Physical Buttons and Update Navigation State
    if (buttonManager.anyPressed()) powerManager.resetActivityTimer();
    navigation.update();

    // 4. Render UI Frame at target frame rate (30 FPS)
    if (now - lastFrameTick >= ANIMATION_TICK_MS) {
        lastFrameTick = now;

        if (!powerManager.isScreenAsleep()) {
            navigation.render();
        }
    }

    // One button-only light sleep after five minutes without interaction.
    // The worker must finish closing its transport before CPU sleep.
    if (powerManager.shouldEnterSleep(now) && mqttClient.workerIdle()) {
        mqttClient.stopForSleep();
        connManager.stopForSleep();
        if (powerManager.enterButtonSleep()) {
            buttonManager.consumeWakePress();
            navigation.showClock();
#if !defined(BMO_BENCH_OFFLINE) || !BMO_BENCH_OFFLINE
            wakeSession.begin(millis());
#endif
        }
    }

    // Yield short CPU time for FreeRTOS background tasks (Wi-Fi stack, TCP/IP)
    vTaskDelay(pdMS_TO_TICKS(2));
}
