#pragma once

#include <Arduino.h>
#include <WiFi.h>
#include <time.h>
#include "config.h"
#include "wifi_policy.h"
#include <atomic>

enum class WifiState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    CONFIG_PORTAL
};

class BMOConnectionManager {
public:
    BMOConnectionManager();
    void begin();
    void loop();
    void startWakeConnection();
    void stopForSleep();
    void requestTimeSync(bool useFallback = false);

    bool isWifiConnected() const;
    bool isTimeSynced() const;
    bool hadSyncThisWake() const;
    bool wifiConnectedThisWake() const { return _wifiConnectedThisWake; }
    uint32_t wifiConnectedDurationMs(uint32_t nowMs) const;
    time_t getCurrentEpoch() const;
    String getFormattedTime() const;

    void resetWifiSettings();
    bool openConfigPortal(const char* title = "WI-FI SETUP (AP)");
    bool needsProvisioning() const;

private:
    WifiState _state;
    bool _timeSynced;
    bool _timeTrustedBeforeRequest;
    bool _syncRequested;
    uint32_t _syncRequestedAtMs;
    bool _wifiConnectedThisWake;
    uint32_t _wifiConnectedAtMs;
    bool _useNvsWifi;
};

extern BMOConnectionManager connManager;
