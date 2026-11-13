#include "wifi_manager.h"
#include "display.h"
#include <WiFiManager.h>

#ifndef BMO_WIFI_AP_SSID
#define BMO_WIFI_AP_SSID "duyaivy's pet"
#endif

#ifndef BMO_WIFI_AP_PASSWORD
#define BMO_WIFI_AP_PASSWORD "12345678"
#endif

#ifndef BMO_WIFI_PORTAL_TIMEOUT_SEC
#define BMO_WIFI_PORTAL_TIMEOUT_SEC 180
#endif

BMOConnectionManager connManager;

BMOConnectionManager::BMOConnectionManager()
    : _state(WifiState::DISCONNECTED),
      _lastAttemptTime(0),
      _connectStartTime(0),
      _lastNtpSync(0),
      _timeSynced(false) {}

void BMOConnectionManager::resetWifiSettings() {
    Serial.println("[WIFI] Clearing saved Wi-Fi settings...");
    WiFiManager wm;
    wm.resetSettings();
    WiFi.disconnect(true, true);
    delay(300);
}

void BMOConnectionManager::begin() {
    Serial.println("[WIFI] Initializing Station Mode with WiFiManager...");
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);

    // On ESP32-CAM, disable aggressive power-save on Wi-Fi to prevent radio drops & brownouts
    WiFi.setSleep(WIFI_PS_MIN_MODEM);

    WiFiManager wm;

    // Display AP details on OLED when portal activates
    wm.setAPCallback([](WiFiManager* myWiFiManager) {
        Serial.println("[WIFI] Entered AP Mode! Broadcasting configuration portal.");
        Serial.printf("[WIFI] AP SSID: %s | Password: %s\n", BMO_WIFI_AP_SSID, BMO_WIFI_AP_PASSWORD);
        Serial.printf("[WIFI] Web Portal IP: %s\n", WiFi.softAPIP().toString().c_str());
        display.showWifiSetupScreen(BMO_WIFI_AP_SSID, BMO_WIFI_AP_PASSWORD, WiFi.softAPIP().toString().c_str());
    });

    wm.setConfigPortalTimeout(BMO_WIFI_PORTAL_TIMEOUT_SEC);
    wm.setConnectTimeout(15);
    wm.setBreakAfterConfig(true);

    // If config.local.h has a hardcoded SSID (and not default template), we can seed it
    // if WiFiManager doesn't have credentials yet
    #if defined(BMO_WIFI_SSID)
    if (String(BMO_WIFI_SSID) != "YOUR_WIFI_SSID" && WiFi.SSID().length() == 0) {
        Serial.printf("[WIFI] Seeding default credentials from config: %s\n", BMO_WIFI_SSID);
        WiFi.begin(BMO_WIFI_SSID, BMO_WIFI_PASSWORD);
        unsigned long start = millis();
        while (WiFi.status() != WL_CONNECTED && millis() - start < 10000) {
            delay(500);
            Serial.print(".");
        }
        Serial.println();
    }
    #endif

    bool connected = false;
    if (WiFi.status() == WL_CONNECTED) {
        connected = true;
    } else {
        Serial.printf("[WIFI] Starting autoConnect with AP '%s'...\n", BMO_WIFI_AP_SSID);
        connected = wm.autoConnect(BMO_WIFI_AP_SSID, BMO_WIFI_AP_PASSWORD);
    }

    if (connected) {
        _state = WifiState::CONNECTED;
        Serial.printf("[WIFI] Connected successfully! IP: %s, RSSI: %d dBm\n",
                      WiFi.localIP().toString().c_str(), WiFi.RSSI());
        syncTime();
    } else {
        Serial.println("[WIFI] Failed to connect or config portal timed out. Running in offline/disconnected mode.");
        _state = WifiState::DISCONNECTED;
        _lastAttemptTime = millis();
    }
}

void BMOConnectionManager::startConnecting() {
    _state = WifiState::CONNECTING;
    _connectStartTime = millis();
    _lastAttemptTime = millis();

    Serial.println("[WIFI] Attempting Wi-Fi reconnection...");
    WiFi.reconnect();
}

void BMOConnectionManager::loop() {
    unsigned long now = millis();
    _timeSynced = getCurrentEpoch() >= 1700000000;

    if (_state == WifiState::CONNECTING) {
        if (WiFi.status() == WL_CONNECTED) {
            _state = WifiState::CONNECTED;
            Serial.printf("[WIFI] Reconnected! IP: %s, RSSI: %d dBm\n",
                          WiFi.localIP().toString().c_str(), WiFi.RSSI());
            syncTime();
        } else if (now - _connectStartTime > BMO_WIFI_TIMEOUT_MS) {
            Serial.println("[WIFI] Reconnect attempt timed out.");
            _state = WifiState::DISCONNECTED;
            _lastAttemptTime = now;
        }
    } else if (_state == WifiState::CONNECTED) {
        if (WiFi.status() != WL_CONNECTED) {
            Serial.println("[WIFI] Connection lost! Resetting to disconnected.");
            _state = WifiState::DISCONNECTED;
            _timeSynced = false;
            _lastAttemptTime = now;
        } else {
            // Periodic SNTP time refresh
            if (now - _lastNtpSync > BMO_NTP_SYNC_INTERVAL_MS) {
                syncTime();
            }
        }
    } else if (_state == WifiState::DISCONNECTED) {
        if (now - _lastAttemptTime >= BMO_WIFI_RETRY_DELAY_MS) {
            startConnecting();
        }
    }
}

void BMOConnectionManager::syncTime() {
    Serial.println("[SNTP] Configuring SNTP time synchronization...");
    configTime(BMO_GMT_OFFSET_SEC, BMO_DAYLIGHT_OFFSET_SEC, BMO_NTP_SERVER_1, BMO_NTP_SERVER_2);

    _lastNtpSync = millis();
    // SNTP runs asynchronously; never wait for network time in the UI loop.
    _timeSynced = getCurrentEpoch() >= 1700000000;
}

bool BMOConnectionManager::isWifiConnected() const {
    return (_state == WifiState::CONNECTED && WiFi.status() == WL_CONNECTED);
}

bool BMOConnectionManager::isTimeSynced() const {
    return _timeSynced;
}

time_t BMOConnectionManager::getCurrentEpoch() const {
    time_t now;
    time(&now);
    return now;
}

String BMOConnectionManager::getFormattedTime() const {
    if (!_timeSynced) {
        return String("--:--");
    }
    struct tm timeinfo;
    if (!getLocalTime(&timeinfo, 100)) {
        return String("--:--");
    }
    char buf[16];
    snprintf(buf, sizeof(buf), "%02d:%02d", timeinfo.tm_hour, timeinfo.tm_min);
    return String(buf);
}
