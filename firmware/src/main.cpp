#include <Arduino.h>
#include "config.h"
#include "display.h"
#include "wifi_manager.h"
#include "mqtt_client.h"
#include "buttons.h"
#include "navigation.h"
#include "power_manager.h"

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

    // 3. Initialize OLED Display (I2C SDA=GPIO 15, SCL=GPIO 14 for ESP32-CAM)
    if (!display.begin()) {
        Serial.println("[MAIN] Fatal: OLED display failed to initialize! Halting.");
        while (true) {
            delay(1000);
        }
    }

    // 4. Show initial boot splash
    display.showSplashScreen("v1.0 (ESP32-CAM)");
    delay(1500);

    // 5. Initialize Wi-Fi Connection Manager & SNTP Time
    display.showConnectingScreen("Connecting Wi-Fi...");
    connManager.begin();

    // 6. Initialize MQTT Client for Quota & Screen Topics
    mqttClient.begin();

    // 7. Initialize UI Navigation Controller (Defaults to BMO Happy Face)
    navigation.begin();

    Serial.println("[MAIN] Boot sequence complete. Starting main loop.");
}

void loop() {
    unsigned long now = millis();

    // 1. Service Network & Background Tasks (Non-blocking)
    connManager.loop();
    mqttClient.loop();

    // 2. Poll Physical Buttons and Update Navigation State
    navigation.update();

    // 3. Reset power activity timer if user interacted with any button
    if (buttonManager.wasClicked(ButtonId::BUTTON_A) || buttonManager.wasClicked(ButtonId::BUTTON_B)) {
        powerManager.resetActivityTimer();
    }

    // 4. Render UI Frame at target frame rate (30 FPS)
    if (now - lastFrameTick >= ANIMATION_TICK_MS) {
        lastFrameTick = now;

        if (!powerManager.isScreenAsleep()) {
            navigation.render();
        }
    }

    // 5. Update Power & Screen Saver Manager
    powerManager.update();

    // Yield short CPU time for FreeRTOS background tasks (Wi-Fi stack, TCP/IP)
    vTaskDelay(pdMS_TO_TICKS(2));
}
