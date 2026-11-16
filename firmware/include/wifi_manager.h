#pragma once

#include <Arduino.h>
#include <WiFi.h>
#include <time.h>
#include "config.h"
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
    time_t getCurrentEpoch() const;
    String getFormattedTime() const;

    void resetWifiSettings();
    void openConfigPortal();
    bool needsProvisioning() const;

private:
    WifiState _state;
    bool _timeSynced;
    bool _timeTrustedBeforeRequest;
    bool _syncRequested;
    uint32_t _syncRequestedAtMs;
};

extern BMOConnectionManager connManager;
