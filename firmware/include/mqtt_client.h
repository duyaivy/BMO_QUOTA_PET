#pragma once

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include "config.h"
#include "contracts.h"
#include "weather.h"
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <freertos/task.h>
#include <atomic>

class BMOMqttClient {
public:
    BMOMqttClient();
    void begin();
    void loop();
    void startWakeConnection();
    void stopForSleep();
    bool workerIdle() const { return !_workerBusy.load(); }

    bool isConnected();
    const DeviceConfig& getConfig() const { return _config; }
    const DeviceSnapshot& getSnapshot() const { return _snapshot; }
    bool isRetired() const { return _isRetired; }
    bool hasReceivedData() const { return _config.valid; }
    bool hasWeather() const { return _weather.valid; }
    const WeatherSnapshot& getWeather() const { return _weather; }
    bool hasWakeConfig() const { return _receivedConfigThisWake && _config.valid; }
    bool hasWakeSnapshot() const { return _receivedSnapshotThisWake && _snapshot.valid && _config.valid && _snapshot.configRevision == _config.revision; }
    bool hasWakeWeather() const { return _receivedWeatherThisWake; }

    uint8_t getQuotaScreenCount() const;
    const ConfigScreen* getQuotaScreenAt(uint8_t index) const;
    const SnapshotWindow* findSnapshotWindow(const char* providerId, const char* windowId) const;

    uint8_t getUniqueQuotaProviderCount() const;
    const char* getUniqueQuotaProviderAt(uint8_t index) const;
    uint8_t getProviderWindows(const char* providerId, const SnapshotWindow* outWindows[2]) const;
    uint8_t getTotalQuotaPages() const;
    bool getQuotaPage(uint8_t pageIndex, const char** outProviderId, const SnapshotWindow** outWindow, const char** outDefaultBadge) const;

private:
    void workerLoop();
    static void workerEntry(void* context);
    bool connectOnce();
    struct Packet { uint16_t length; uint8_t kind; uint8_t payload[BMO_MQTT_BUFFER_SIZE]; };
    void onMessage(char* topic, uint8_t* payload, unsigned int length);
    void handleConfigPayload(const uint8_t* payload, unsigned int length);
    void handleSnapshotPayload(const uint8_t* payload, unsigned int length);
    uint8_t collectUniqueProviders(const char* outProviders[MAX_CONFIG_SCREENS]) const;

    #if BMO_MQTT_TLS
    WiFiClientSecure _wifiClient;
    #else
    WiFiClient _wifiClient;
    #endif
    PubSubClient _mqtt;

    DeviceConfig _config;
    DeviceSnapshot _snapshot;
    WeatherSnapshot _weather;
    bool _isRetired;
    bool _receivedConfigThisWake;
    bool _receivedSnapshotThisWake;
    bool _receivedWeatherThisWake;
    bool _acceptedConfig;
    bool _acceptedSnapshot;
    std::atomic<bool> _connected;
    std::atomic<bool> _stopRequested;
    std::atomic<bool> _workerBusy;
    TaskHandle_t _workerTask;
    QueueHandle_t _packetQueue;
    Packet _packetSlots[4];
    bool _slotUsed[4];
    portMUX_TYPE _slotMux = portMUX_INITIALIZER_UNLOCKED;

    char _configTopic[64];
    char _snapshotTopic[64];
    char _weatherTopic[64];
};

extern BMOMqttClient mqttClient;
