#include "wifi_manager.h"
#include "buttons.h"
#include "display.h"
#include <Preferences.h>
#include <WiFiManager.h>
#include <esp_sntp.h>
#include <esp_wifi.h>
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

namespace {

const char* compiledWifiSsid() {
#if defined(BMO_WIFI_SSID)
    return BMO_WIFI_SSID;
#else
    return "YOUR_WIFI_SSID";
#endif
}

bool hasSavedNvsCredentials() {
    wifi_config_t conf{};
    if (esp_wifi_get_config(WIFI_IF_STA, &conf) != ESP_OK) return false;
    return conf.sta.ssid[0] != '\0';
}

} // namespace

BMOConnectionManager::BMOConnectionManager()
    : _state(WifiState::DISCONNECTED), _timeSynced(false),
      _timeTrustedBeforeRequest(false), _syncRequested(false),
      _syncRequestedAtMs(0), _wifiConnectedThisWake(false),
      _wifiConnectedAtMs(0), _useNvsWifi(false) {}

void BMOConnectionManager::resetWifiSettings() {
    WiFiManager manager;
    manager.resetSettings();
    WiFi.disconnect(true, true);
    _useNvsWifi = true;
    Preferences prefs;
    if (prefs.begin("bmo-wifi", false)) {
        prefs.putBool("use_nvs", true);
        prefs.end();
    }
}

bool BMOConnectionManager::openConfigPortal(const char* title) {
    if (esp_sntp_enabled()) esp_sntp_stop();
    _syncRequested = false;
    WiFi.disconnect(false, false);
    delay(100);

    WiFiManager manager;
    bool savedConfig = false;
    manager.setConfigPortalBlocking(false);
    manager.setConfigPortalTimeout(BMO_WIFI_PORTAL_TIMEOUT_SEC);
    manager.setAPCallback([title](WiFiManager*) {
        Serial.printf("[WIFI] Portal AP active: SSID='%s' IP=%s\n",
                      BMO_WIFI_AP_SSID, WiFi.softAPIP().toString().c_str());
        display.showWifiSetupScreen(BMO_WIFI_AP_SSID, BMO_WIFI_AP_PASSWORD,
                                    WiFi.softAPIP().toString().c_str(), title);
    });
    manager.setSaveConfigCallback([&savedConfig]() {
        savedConfig = true;
    });

    _state = WifiState::CONFIG_PORTAL;
    buttonManager.consumeWakePress();
    buttonManager.wasClicked(ButtonId::BUTTON_A);
    buttonManager.wasClicked(ButtonId::BUTTON_B);

    manager.startConfigPortal(BMO_WIFI_AP_SSID, BMO_WIFI_AP_PASSWORD);

    bool connected = false;
    while (manager.getConfigPortalActive()) {
        if (manager.process()) {
            connected = true;
            break;
        }
        buttonManager.update();
        if (buttonManager.wasClicked(ButtonId::BUTTON_A) ||
            buttonManager.wasClicked(ButtonId::BUTTON_B)) {
            Serial.println("[WIFI] Portal dismissed by user button.");
            manager.stopConfigPortal();
            break;
        }
        vTaskDelay(pdMS_TO_TICKS(10));
    }

    const bool updated = connected || savedConfig;
    if (updated) {
        _useNvsWifi = true;
        Preferences prefs;
        if (prefs.begin("bmo-wifi", false)) {
            prefs.putBool("use_nvs", true);
            prefs.end();
        }
        Serial.println("[WIFI] Saved new Wi-Fi credentials from setup portal.");
    }

    WiFi.disconnect(true, false);
    WiFi.mode(WIFI_OFF);
    _state = WifiState::DISCONNECTED;
    buttonManager.wasClicked(ButtonId::BUTTON_A);
    buttonManager.wasClicked(ButtonId::BUTTON_B);
    return updated;
}

bool BMOConnectionManager::needsProvisioning() const {
    // esp_wifi_get_config() requires the STA driver initialized.
    // This probe does not connect; the ordinary wake session starts afterward.
    WiFi.mode(WIFI_STA);
    bool hasNvs = hasSavedNvsCredentials();
    WiFi.mode(WIFI_OFF);
    return selectWifiCredentialSource(_useNvsWifi, hasNvs, compiledWifiSsid()) == WifiCredentialSource::NONE;
}

void BMOConnectionManager::begin() {
    WiFi.mode(WIFI_OFF);
    WiFi.setAutoReconnect(false);
    _timeSynced = getCurrentEpoch() >= 1700000000;

    Preferences prefs;
    if (prefs.begin("bmo-wifi", false)) {
        const char* compiled = compiledWifiSsid();
        String prev = prefs.getString("cfg_ssid", "");
        if (prev != String(compiled)) {
            prefs.putString("cfg_ssid", compiled);
            prefs.putBool("use_nvs", false);
        }
        _useNvsWifi = prefs.getBool("use_nvs", false);
        prefs.end();
    }
}

void BMOConnectionManager::startWakeConnection() {
    if (_state != WifiState::DISCONNECTED) return;
    _wifiConnectedThisWake = false;
    _wifiConnectedAtMs = 0;
    receivedWakeSync.store(false);

    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(false);
    WiFi.setSleep(WIFI_PS_MIN_MODEM);

    const bool hasNvs = hasSavedNvsCredentials();
    const WifiCredentialSource source = selectWifiCredentialSource(_useNvsWifi, hasNvs, compiledWifiSsid());
    _state = WifiState::CONNECTING;

    if (source == WifiCredentialSource::COMPILED_DEFAULT) {
        WiFi.persistent(false);
#if defined(BMO_WIFI_SSID)
        WiFi.begin(BMO_WIFI_SSID, BMO_WIFI_PASSWORD);
#endif
        return;
    }

    // Stored NVS credentials (configured via portal).
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
    if (_state == WifiState::CONNECTING && WiFi.status() == WL_CONNECTED) {
        _state = WifiState::CONNECTED;
        if (!_wifiConnectedThisWake) {
            _wifiConnectedThisWake = true;
            _wifiConnectedAtMs = millis();
        }
    } else if (_state == WifiState::CONNECTED && WiFi.status() != WL_CONNECTED) {
        _state = WifiState::DISCONNECTED;
    }
    _timeSynced = getCurrentEpoch() >= 1700000000;
}

void BMOConnectionManager::requestTimeSync(bool useFallback) {
    // Keep the system epoch in UTC; display conversion happens in the renderers.
    _timeTrustedBeforeRequest = _timeSynced;
    _syncRequestedAtMs = millis();
    _syncRequested = true;
    receivedWakeSync.store(false);
    esp_sntp_set_time_sync_notification_cb([](timeval*) { receivedWakeSync.store(true); });
    configTime(0, 0,
        useFallback ? BMO_NTP_SERVER_2 : BMO_NTP_SERVER_1,
        useFallback ? BMO_NTP_SERVER_1 : BMO_NTP_SERVER_2,
        "time.cloudflare.com");
}

bool BMOConnectionManager::isWifiConnected() const {
    return _state == WifiState::CONNECTED && WiFi.status() == WL_CONNECTED;
}

bool BMOConnectionManager::isTimeSynced() const {
    return _syncRequested && wakeTimeReady(_timeTrustedBeforeRequest,
        receivedWakeSync.load(), _timeSynced, uint32_t(millis() - _syncRequestedAtMs));
}

bool BMOConnectionManager::hadSyncThisWake() const {
    return receivedWakeSync.load();
}

uint32_t BMOConnectionManager::wifiConnectedDurationMs(uint32_t nowMs) const {
    if (!_wifiConnectedThisWake) return 0;
    return uint32_t(nowMs - _wifiConnectedAtMs);
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
