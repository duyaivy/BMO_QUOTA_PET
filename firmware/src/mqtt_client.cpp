#include "mqtt_client.h"
#include <ArduinoJson.h>
#include <time.h>
#include <initializer_list>

BMOMqttClient mqttClient;

static void staticMqttCallback(char* topic, uint8_t* payload, unsigned int length) {
    // Forward to singleton instance
    // Note: PubSubClient requires a static or free function callback
    // We can call mqttClient directly
}

BMOMqttClient::BMOMqttClient()
    : _mqtt(_wifiClient),
      _isRetired(false),
      _lastReconnectAttempt(0) {
    memset(&_config, 0, sizeof(_config));
    memset(&_snapshot, 0, sizeof(_snapshot));
    snprintf(_configTopic, sizeof(_configTopic), "bmo/v1/devices/%s/config", BMO_DEVICE_ID);
    snprintf(_snapshotTopic, sizeof(_snapshotTopic), "bmo/v1/devices/%s/snapshot", BMO_DEVICE_ID);
}

void BMOMqttClient::begin() {
    #if BMO_MQTT_TLS
    if (strlen(BMO_MQTT_CA_CERT) > 0) {
        _wifiClient.setCACert(BMO_MQTT_CA_CERT);
    } else {
        _wifiClient.setInsecure();
        Serial.println("[MQTT] TLS enabled without CA certificate (using setInsecure)");
    }
    #endif
    _mqtt.setSocketTimeout(3);
    _mqtt.setServer(BMO_MQTT_BROKER, BMO_MQTT_PORT);
    _mqtt.setBufferSize(BMO_MQTT_BUFFER_SIZE + 256); // Support up to 8 KiB MQTT payloads

    _mqtt.setCallback([this](char* topic, uint8_t* payload, unsigned int length) {
        this->onMessage(topic, payload, length);
    });

    Serial.printf("[MQTT] Initialized client for device: %s\n", BMO_DEVICE_ID);
}

void BMOMqttClient::loop() {
    if (!WiFi.isConnected()) {
        return;
    }

    if (!_mqtt.connected()) {
        unsigned long now = millis();
        if (now - _lastReconnectAttempt > 5000) {
            _lastReconnectAttempt = now;
            reconnect();
        }
    } else {
        _mqtt.loop();
    }
}

bool BMOMqttClient::isConnected() {
    return _mqtt.connected();
}

void BMOMqttClient::reconnect() {
    if (_mqtt.connected()) return;
    #if BMO_MQTT_TLS
    if (strlen(BMO_MQTT_CA_CERT) == 0) {
        _wifiClient.setInsecure();
    }
    #endif

    Serial.printf("[MQTT] Attempting connection to %s:%d as %s...\n",
                  BMO_MQTT_BROKER, BMO_MQTT_PORT, BMO_DEVICE_ID);

    char clientId[48];
    snprintf(clientId, sizeof(clientId), "bmo-esp32-%s", BMO_DEVICE_ID);

    bool connected = false;
    if (strlen(BMO_MQTT_USER) > 0) {
        connected = _mqtt.connect(clientId, BMO_MQTT_USER, BMO_MQTT_PASSWORD);
    } else {
        connected = _mqtt.connect(clientId);
    }

    if (connected) {
        Serial.println("[MQTT] Connected successfully to broker!");
        // Subscribe to device config and snapshot topics (QoS 1)
        _mqtt.subscribe(_configTopic, 1);
        _mqtt.subscribe(_snapshotTopic, 1);
        Serial.printf("[MQTT] Subscribed to %s and %s\n", _configTopic, _snapshotTopic);
    } else {
        Serial.printf("[MQTT] Connection failed, rc=%d. Will retry in 5s.\n", _mqtt.state());
    }
}

void BMOMqttClient::onMessage(char* topic, uint8_t* payload, unsigned int length) {
    Serial.printf("[MQTT] Received message on %s (%u bytes)\n", topic, length);

    if (strcmp(topic, _configTopic) != 0 && strcmp(topic, _snapshotTopic) != 0) return;
    if (length > BMO_MQTT_BUFFER_SIZE) return;

    // Check for Tombstone (zero-byte payload = retirement per Architecture §11)
    if (length == 0) {
        Serial.println("[MQTT] Tombstone received! Device is marked RETIRED.");
        _isRetired = true;
        _config.valid = false;
        _snapshot.valid = false;
        return;
    }

    if (strcmp(topic, _configTopic) == 0) {
        handleConfigPayload(payload, length);
    } else if (strcmp(topic, _snapshotTopic) == 0) {
        handleSnapshotPayload(payload, length);
    }
}

void BMOMqttClient::handleConfigPayload(const uint8_t* payload, unsigned int length) {
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, payload, length);
    if (err) {
        Serial.printf("[MQTT] JSON parse error in config: %s\n", err.c_str());
        return;
    }

    if (doc["schemaVersion"].as<JsonVariantConst>() != 1 || strcmp(doc["deviceId"] | "", BMO_DEVICE_ID) != 0 ||
        !doc["revision"].is<uint32_t>() || doc["revision"].as<uint32_t>() == 0) return;
    uint32_t revision = doc["revision"] | 0;
    if (_config.valid && revision < _config.revision) {
        Serial.printf("[MQTT] Ignoring older config revision: %u (current: %u)\n", revision, _config.revision);
        return;
    }

    if (!doc["screens"].is<JsonArray>()) return;
    JsonArray validatedScreens = doc["screens"].as<JsonArray>();
    if (validatedScreens.size() == 0 || validatedScreens.size() > MAX_CONFIG_SCREENS) return;
    unsigned index = 0;
    for (JsonObject screen : validatedScreens) {
        const char* kind = screen["kind"] | "";
        if (strcmp(kind, index++ == 0 ? "pet" : "quota") != 0) return;
        if (!screen["screenId"].is<const char*>() || strlen(screen["screenId"].as<const char*>()) >= sizeof(_config.screens[0].screenId)) return;
        if (strcmp(kind, "quota") == 0 &&
            (!screen["providerId"].is<const char*>() || !screen["windowId"].is<const char*>() ||
             strlen(screen["providerId"].as<const char*>()) >= sizeof(_config.screens[0].providerId) ||
             strlen(screen["windowId"].as<const char*>()) >= sizeof(_config.screens[0].windowId))) return;
    }
    _config.schemaVersion = doc["schemaVersion"] | 1;
    strncpy(_config.deviceId, doc["deviceId"] | "", sizeof(_config.deviceId) - 1);
    _config.revision = revision;
    strncpy(_config.updatedAt, doc["updatedAt"] | "", sizeof(_config.updatedAt) - 1);

    JsonArray screens = doc["screens"].as<JsonArray>();
    uint8_t count = 0;
    for (JsonObject s : screens) {
        if (count >= MAX_CONFIG_SCREENS) break;
        const char* kindStr = s["kind"] | "";
        if (strcmp(kindStr, "pet") == 0) {
            _config.screens[count].kind = ScreenKind::PET;
            strncpy(_config.screens[count].screenId, s["screenId"] | "pet-home", sizeof(_config.screens[count].screenId) - 1);
        } else if (strcmp(kindStr, "quota") == 0) {
            _config.screens[count].kind = ScreenKind::QUOTA;
            strncpy(_config.screens[count].screenId, s["screenId"] | "", sizeof(_config.screens[count].screenId) - 1);
            strncpy(_config.screens[count].providerId, s["providerId"] | "", sizeof(_config.screens[count].providerId) - 1);
            strncpy(_config.screens[count].windowId, s["windowId"] | "", sizeof(_config.screens[count].windowId) - 1);
        }
        count++;
    }
    _config.screenCount = count;
    _config.valid = true;
    _isRetired = false;

    Serial.printf("[MQTT] Config updated: rev %u with %u screens\n", _config.revision, _config.screenCount);
}

void BMOMqttClient::handleSnapshotPayload(const uint8_t* payload, unsigned int length) {
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, payload, length);
    if (err) {
        Serial.printf("[MQTT] JSON parse error in snapshot: %s\n", err.c_str());
        return;
    }

    if (doc["schemaVersion"].as<JsonVariantConst>() != 1 || strcmp(doc["deviceId"] | "", BMO_DEVICE_ID) != 0 ||
        !doc["revision"].is<uint32_t>() || doc["revision"].as<uint32_t>() == 0) return;
    uint32_t revision = doc["revision"] | 0;
    if (_snapshot.valid && revision < _snapshot.revision) {
        Serial.printf("[MQTT] Ignoring older snapshot revision: %u (current: %u)\n", revision, _snapshot.revision);
        return;
    }

    if (!doc["configRevision"].is<uint32_t>() || doc["configRevision"].as<uint32_t>() == 0 ||
        !doc["windows"].is<JsonArray>() || doc["windows"].size() > MAX_SNAPSHOT_WINDOWS ||
        !doc["validUntil"].is<const char*>()) return;
    for (JsonObject w : doc["windows"].as<JsonArray>()) {
        if (!w["providerId"].is<const char*>() || !w["windowId"].is<const char*>() ||
            !w["validUntil"].is<const char*>() || !w["dataStatus"].is<const char*>() ||
            !w["sourceFreshness"].is<const char*>()) return;
        if (strlen(w["providerId"].as<const char*>()) >= sizeof(_snapshot.windows[0].providerId) ||
            strlen(w["windowId"].as<const char*>()) >= sizeof(_snapshot.windows[0].windowId)) return;
        for (const char* key : {"usedPercent", "remainingPercent"}) {
            if (!w.containsKey(key)) return;
            if (!w[key].isNull() && (!w[key].is<float>() || w[key].as<float>() < 0 || w[key].as<float>() > 100)) return;
        }
    }
    _snapshot.schemaVersion = doc["schemaVersion"] | 1;
    strncpy(_snapshot.deviceId, doc["deviceId"] | "", sizeof(_snapshot.deviceId) - 1);
    _snapshot.revision = revision;
    _snapshot.configRevision = doc["configRevision"] | 0;
    strncpy(_snapshot.generatedAt, doc["generatedAt"] | "", sizeof(_snapshot.generatedAt) - 1);
    strncpy(_snapshot.validUntil, doc["validUntil"] | "", sizeof(_snapshot.validUntil) - 1);

    JsonArray windows = doc["windows"].as<JsonArray>();
    uint8_t count = 0;
    for (JsonObject w : windows) {
        if (count >= MAX_SNAPSHOT_WINDOWS) break;
        SnapshotWindow& sw = _snapshot.windows[count];

        strncpy(sw.providerId, w["providerId"] | "", sizeof(sw.providerId) - 1);
        strncpy(sw.windowId, w["windowId"] | "", sizeof(sw.windowId) - 1);
        strncpy(sw.label, w["label"] | "", sizeof(sw.label) - 1);
        sw.windowDurationSeconds = w["windowDurationSeconds"] | -1;

        if (w["usedPercent"].isNull()) {
            sw.usedPercent = -1.0f;
        } else {
            sw.usedPercent = w["usedPercent"].as<float>();
        }

        if (w["remainingPercent"].isNull()) {
            sw.remainingPercent = -1.0f;
        } else {
            sw.remainingPercent = w["remainingPercent"].as<float>();
        }

        strncpy(sw.resetAt, w["resetAt"] | "", sizeof(sw.resetAt) - 1);

        const char* statusStr = w["dataStatus"] | "ok";
        if (strcmp(statusStr, "ok") == 0) sw.dataStatus = DataStatus::STATUS_OK;
        else if (strcmp(statusStr, "unavailable") == 0) sw.dataStatus = DataStatus::STATUS_UNAVAILABLE;
        else if (strcmp(statusStr, "unsupported") == 0) sw.dataStatus = DataStatus::STATUS_UNSUPPORTED;
        else sw.dataStatus = DataStatus::STATUS_ERROR;

        strncpy(sw.collectedAt, w["collectedAt"] | "", sizeof(sw.collectedAt) - 1);
        strncpy(sw.upstreamObservedAt, w["upstreamObservedAt"] | "", sizeof(sw.upstreamObservedAt) - 1);
        strncpy(sw.freshnessBasis, w["freshnessBasis"] | "unknown", sizeof(sw.freshnessBasis) - 1);

        const char* freshStr = w["sourceFreshness"] | "unknown";
        if (strcmp(freshStr, "fresh") == 0) sw.sourceFreshness = SourceFreshness::FRESH;
        else if (strcmp(freshStr, "stale") == 0) sw.sourceFreshness = SourceFreshness::STALE;
        else sw.sourceFreshness = SourceFreshness::UNKNOWN;

        strncpy(sw.validUntil, w["validUntil"] | "", sizeof(sw.validUntil) - 1);
        count++;
    }
    _snapshot.windowCount = count;
    _snapshot.valid = true;

    Serial.printf("[MQTT] Snapshot updated: rev %u with %u windows\n", _snapshot.revision, _snapshot.windowCount);
}

uint8_t BMOMqttClient::getQuotaScreenCount() const {
    if (!_config.valid) return 0;
    uint8_t count = 0;
    for (uint8_t i = 0; i < _config.screenCount; i++) {
        if (_config.screens[i].kind == ScreenKind::QUOTA) {
            count++;
        }
    }
    return count;
}

const ConfigScreen* BMOMqttClient::getQuotaScreenAt(uint8_t index) const {
    if (!_config.valid) return nullptr;
    uint8_t quotaIdx = 0;
    for (uint8_t i = 0; i < _config.screenCount; i++) {
        if (_config.screens[i].kind == ScreenKind::QUOTA) {
            if (quotaIdx == index) {
                return &_config.screens[i];
            }
            quotaIdx++;
        }
    }
    return nullptr;
}

const SnapshotWindow* BMOMqttClient::findSnapshotWindow(const char* providerId, const char* windowId) const {
    if (!_snapshot.valid || !_config.valid || _snapshot.configRevision != _config.revision) return nullptr;
    for (uint8_t i = 0; i < _snapshot.windowCount; i++) {
        if (strcmp(_snapshot.windows[i].providerId, providerId) == 0 &&
            strcmp(_snapshot.windows[i].windowId, windowId) == 0) {
            return &_snapshot.windows[i];
        }
    }
    return nullptr;
}
