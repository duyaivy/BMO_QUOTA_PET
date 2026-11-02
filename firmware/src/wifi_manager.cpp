#include "wifi_manager.h"

BMOConnectionManager connManager;

BMOConnectionManager::BMOConnectionManager()
    : _state(WifiState::DISCONNECTED),
      _lastAttemptTime(0),
      _connectStartTime(0),
      _lastNtpSync(0),
      _timeSynced(false) {}

void BMOConnectionManager::begin() {
    Serial.println("[WIFI] Initializing Station Mode...");
    WiFi.mode(WIFI_STA);
    WiFi.persistent(false);
    WiFi.setAutoReconnect(true);

    // On ESP32-CAM, disable aggressive power-save on Wi-Fi to prevent radio drops & brownouts
    WiFi.setSleep(WIFI_PS_MIN_MODEM);

    startConnecting();
}

void BMOConnectionManager::startConnecting() {
    _state = WifiState::CONNECTING;
    _connectStartTime = millis();
    _lastAttemptTime = millis();

    Serial.printf("[WIFI] Connecting to SSID: %s (password redacted)\n", BMO_WIFI_SSID);
    WiFi.begin(BMO_WIFI_SSID, BMO_WIFI_PASSWORD);
}

void BMOConnectionManager::loop() {
    unsigned long now = millis();

    if (_state == WifiState::CONNECTING) {
        if (WiFi.status() == WL_CONNECTED) {
            _state = WifiState::CONNECTED;
            Serial.printf("[WIFI] Connected! IP: %s, RSSI: %d dBm\n",
                          WiFi.localIP().toString().c_str(), WiFi.RSSI());
            syncTime();
        } else if (now - _connectStartTime > BMO_WIFI_TIMEOUT_MS) {
            Serial.println("[WIFI] Connection attempt timed out. Will retry...");
            _state = WifiState::DISCONNECTED;
            WiFi.disconnect();
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

    struct tm timeinfo;
    if (getLocalTime(&timeinfo, 2000)) {
        _timeSynced = true;
        _lastNtpSync = millis();
        Serial.printf("[SNTP] Clock synchronized: %04d-%02d-%02d %02d:%02d:%02d UTC\n",
                      timeinfo.tm_year + 1900, timeinfo.tm_mon + 1, timeinfo.tm_mday,
                      timeinfo.tm_hour, timeinfo.tm_min, timeinfo.tm_sec);
    } else {
        Serial.println("[SNTP] Warning: Unable to sync time with NTP server yet.");
    }
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
