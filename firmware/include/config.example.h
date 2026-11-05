#pragma once

// =============================================================================
// BMO Personal Desk Pet - Firmware Configuration Template
// =============================================================================
// Copy this file to "config.local.h" and enter your local network credentials.
// NEVER commit your real credentials or sensitive secrets to version control.
// =============================================================================

// --- Wi-Fi Network Settings ---
#define BMO_WIFI_SSID           "YOUR_WIFI_SSID"
#define BMO_WIFI_PASSWORD       "YOUR_WIFI_PASSWORD"
#define BMO_WIFI_TIMEOUT_MS     15000
#define BMO_WIFI_RETRY_DELAY_MS 5000

// --- SNTP Time Synchronization Settings ---
#define BMO_NTP_SERVER_1        "pool.ntp.org"
#define BMO_NTP_SERVER_2        "time.google.com"
#define BMO_GMT_OFFSET_SEC      0          // UTC offset in seconds (e.g. +7*3600 for ICT/Vietnam)
#define BMO_DAYLIGHT_OFFSET_SEC 0          // Daylight savings offset in seconds
#define BMO_NTP_SYNC_INTERVAL_MS 3600000   // Re-sync clock every 1 hour

// --- MQTT Broker Settings (Phase 3 Architecture §11) ---
#define BMO_MQTT_BROKER         "192.168.1.100" // IP or hostname of EMQX / local broker
#define BMO_MQTT_PORT           8883            // Set TLS=0 and port=1883 only for trusted local testing
#define BMO_MQTT_USER           "bmo_device"
#define BMO_MQTT_PASSWORD       "device_secret"
#define BMO_DEVICE_ID           "bmo-dev-01"    // Matches device ID registered in Dashboard
#define BMO_MQTT_BUFFER_SIZE    8192            // 8 KiB maximum payload limit as per contract

#define BMO_MQTT_TLS            1
#define BMO_MQTT_CA_CERT        "" // PEM root CA required for TLS; never use setInsecure

// --- Hardware Pin Configuration for ESP32-CAM ---
#if defined(BOARD_ESP32_CAM) || !defined(BOARD_ESP32_DEV)
    // AI-Thinker ESP32-CAM Pinout
    // Note: Camera and SD card are uninitialized to free these header pins.
    #define PIN_I2C_SDA         13              // Preserve existing OLED SDA wiring
    #define PIN_I2C_SCL         14              // SSD1306 OLED SCL
    #define PIN_BUTTON_A        15              // New button; disconnect old HX711 SCK first
    #define PIN_BUTTON_B        12              // Button B: Quota mode & cycle providers (Active LOW)
    #define PIN_FLASH_LED       4               // Onboard high-power flash LED (keep forced LOW)
    #define PIN_ONBOARD_LED     33              // Inverted red indicator LED on ESP32-CAM PCB
#else
    // Generic ESP32 Development Board (e.g. ESP32-WROOM-32)
    #define PIN_I2C_SDA         21              // Standard hardware I2C SDA
    #define PIN_I2C_SCL         22              // Standard hardware I2C SCL
    #define PIN_BUTTON_A        18              // Button A (Active LOW)
    #define PIN_BUTTON_B        19              // Button B (Active LOW)
    #define PIN_FLASH_LED       -1              // No high-power flash LED
    #define PIN_ONBOARD_LED     2               // Standard blue LED
#endif

// --- Display Configuration ---
#define OLED_SCREEN_WIDTH       128
#define OLED_SCREEN_HEIGHT      64
#define OLED_I2C_ADDRESS        0x3C            // 0x3C or 0x3D
#define OLED_RESET_PIN          -1              // Reset pin (-1 if shared with ESP32 reset)

// --- Button Timing & Debounce ---
#define BUTTON_DEBOUNCE_MS      35              // Debounce threshold
#define BUTTON_HOLD_MS          1200            // Long-press threshold (if needed)

// --- UI & Rendering Timers ---
#define UI_FPS                  30              // Target UI frame rate
#define ANIMATION_TICK_MS       (1000 / UI_FPS)
#define END_OF_LIST_AUTO_WRAP_MS 3000           // Return to face after notification
