#include "wifi_manager.h"
#include "display.h"
#include <WiFiManager.h>
#include <esp_sntp.h>
#include "wake_session.h"

#ifndef BMO_WIFI_AP_SSID
#define BMO_WIFI_AP_SSID "BMO Setup"
#endif
#ifndef BMO_WIFI_AP_PASSWORD
#define BMO_WIFI_AP_PASSWORD "12345678"
#endif
#ifndef BMO_WIFI_PORTAL_TIMEOUT_SEC
#define BMO_WIFI_PORTAL_TIMEOUT_SEC 180
#endif

BMOConnectionManager connManager;
static std::atomic<bool> receivedWakeSync{false};

BMOConnectionManager::BMOConnectionManager()
    : _state(WifiState::DISCONNECTED), _timeSynced(false),
      _timeTrustedBeforeRequest(false), _syncRequested(false), _syncRequestedAtMs(0) {}

void BMOConnectionManager::resetWifiSettings() {
    WiFiManager manager;
    manager.resetSettings();
    WiFi.disconnect(true, true);
}

void BMOConnectionManager::openConfigPortal() {
    WiFiManager manager;
    manager.setConfigPortalTimeout(BMO_WIFI_PORTAL_TIMEOUT_SEC);
    manager.setAPCallback([](WiFiManager*) {
        display.showWifiSetupScreen(BMO_WIFI_AP_SSID, BMO_WIFI_AP_PASSWORD,
                                    WiFi.softAPIP().toString().c_str());
    });
    manager.startConfigPortal(BMO_WIFI_AP_SSID, BMO_WIFI_AP_PASSWORD);
    WiFi.disconnect(true, false);
    WiFi.mode(WIFI_OFF);
    _state = WifiState::DISCONNECTED;
}

bool BMOConnectionManager::needsProvisioning() const {
#if defined(BMO_WIFI_SSID)
    if (strcmp(BMO_WIFI_SSID, "YOUR_WIFI_SSID") != 0) return false;
#endif
    // esp_wifi_get_config() in WiFiManager requires the STA driver initialized.
    // This probe does not connect; the ordinary wake session starts afterward.
    WiFi.mode(WIFI_STA);
    WiFiManager manager;
    bool missing = !manager.getWiFiIsSaved();
    WiFi.mode(WIFI_OFF);
    return missing;
}

void BMOConnectionManager::begin() {
    WiFi.mode(WIFI_OFF);
    WiFi.setAutoReconnect(false);
    _timeSynced = getCurrentEpoch() >= 1700000000;
}

void BMOConnectionManager::startWakeConnection() {
    if (_state != WifiState::DISCONNECTED) return;
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(false);
    WiFi.setSleep(WIFI_PS_MIN_MODEM);
    _state = WifiState::CONNECTING;
#if defined(BMO_WIFI_SSID)
    if (strcmp(BMO_WIFI_SSID, "YOUR_WIFI_SSID") != 0) {
        WiFi.begin(BMO_WIFI_SSID, BMO_WIFI_PASSWORD);
        return;
    }
#endif
    // Stored credentials only. A failed wake never opens a captive portal.
    WiFi.begin();
}

void BMOConnectionManager::stopForSleep() {
    if (esp_sntp_enabled()) esp_sntp_stop();
    _syncRequested = false;
    WiFi.setAutoReconnect(false);
    WiFi.disconnect(true, false);
    WiFi.mode(WIFI_OFF);
    _state = WifiState::DISCONNECTED;
}

void BMOConnectionManager::loop() {
    if (_state == WifiState::CONNECTING && WiFi.status() == WL_CONNECTED)
        _state = WifiState::CONNECTED;
    else if (_state == WifiState::CONNECTED && WiFi.status() != WL_CONNECTED)
        _state = WifiState::DISCONNECTED;
    _timeSynced = getCurrentEpoch() >= 1700000000;
}

void BMOConnectionManager::requestTimeSync() {
    // Keep the system epoch in UTC; display conversion happens in the clock renderer.
    _timeTrustedBeforeRequest = _timeSynced;
    _syncRequestedAtMs = millis();
    _syncRequested = true;
    receivedWakeSync.store(false);
    esp_sntp_set_time_sync_notification_cb([](timeval*) { receivedWakeSync.store(true); });
    configTime(0, 0, BMO_NTP_SERVER_1, BMO_NTP_SERVER_2);
}

bool BMOConnectionManager::isWifiConnected() const {
    return _state == WifiState::CONNECTED && WiFi.status() == WL_CONNECTED;
}

bool BMOConnectionManager::isTimeSynced() const {
    return _syncRequested && wakeTimeReady(_timeTrustedBeforeRequest,
        receivedWakeSync.load(), _timeSynced, uint32_t(millis() - _syncRequestedAtMs));
}

time_t BMOConnectionManager::getCurrentEpoch() const {
    time_t now;
    time(&now);
    return now;
}

String BMOConnectionManager::getFormattedTime() const {
    if (!_timeSynced) return String("--:--");
    time_t displayEpoch = getCurrentEpoch() + 7 * 3600;
    tm info{};
    gmtime_r(&displayEpoch, &info);
    char value[6];
    snprintf(value, sizeof(value), "%02d:%02d", info.tm_hour, info.tm_min);
    return String(value);
}
