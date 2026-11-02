#pragma once

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include "config.h"
#include "contracts.h"

class BMOMqttClient {
public:
    BMOMqttClient();
    void begin();
    void loop();

    bool isConnected();
    const DeviceConfig& getConfig() const { return _config; }
    const DeviceSnapshot& getSnapshot() const { return _snapshot; }
    bool isRetired() const { return _isRetired; }
    bool hasReceivedData() const { return _config.valid; }

    uint8_t getQuotaScreenCount() const;
    const ConfigScreen* getQuotaScreenAt(uint8_t index) const;
    const SnapshotWindow* findSnapshotWindow(const char* providerId, const char* windowId) const;

private:
    void reconnect();
    void onMessage(char* topic, uint8_t* payload, unsigned int length);
    void handleConfigPayload(const uint8_t* payload, unsigned int length);
    void handleSnapshotPayload(const uint8_t* payload, unsigned int length);

    WiFiClient _wifiClient;
    PubSubClient _mqtt;

    DeviceConfig _config;
    DeviceSnapshot _snapshot;
    bool _isRetired;
    unsigned long _lastReconnectAttempt;

    char _configTopic[64];
    char _snapshotTopic[64];
};

extern BMOMqttClient mqttClient;
