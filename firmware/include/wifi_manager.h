#pragma once

#include <Arduino.h>
#include <WiFi.h>
#include <time.h>
#include "config.h"

enum class WifiState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED
};

class BMOConnectionManager {
public:
    BMOConnectionManager();
    void begin();
    void loop();

    bool isWifiConnected() const;
    bool isTimeSynced() const;
    time_t getCurrentEpoch() const;
    String getFormattedTime() const;

private:
    void startConnecting();
    void syncTime();

    WifiState _state;
    unsigned long _lastAttemptTime;
    unsigned long _connectStartTime;
    unsigned long _lastNtpSync;
    bool _timeSynced;
};

extern BMOConnectionManager connManager;
