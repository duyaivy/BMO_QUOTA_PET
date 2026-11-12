#include "mqtt_client.h"
#include <ArduinoJson.h>
#include <time.h>
#include <initializer_list>
#include <ctype.h>
#include <strings.h>

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

static bool isSameProvider(const char* a, const char* b) {
    if (!a || !b) return false;
    if (strcasecmp(a, b) == 0) return true;
    if ((strcasecmp(a, "antigravity") == 0 && strcasecmp(b, "gemini") == 0) ||
        (strcasecmp(a, "gemini") == 0 && strcasecmp(b, "antigravity") == 0)) {
        return true;
    }
    return false;
}

static bool containsIgnoreCase(const char* str, const char* sub) {
    if (!str || !sub) return false;
    size_t strLen = strlen(str);
    size_t subLen = strlen(sub);
    if (subLen == 0) return true;
    if (strLen < subLen) return false;
    for (size_t i = 0; i <= strLen - subLen; i++) {
        bool match = true;
        for (size_t j = 0; j < subLen; j++) {
            if (tolower((unsigned char)str[i + j]) != tolower((unsigned char)sub[j])) {
                match = false;
                break;
            }
        }
        if (match) return true;
    }
    return false;
}

const SnapshotWindow* BMOMqttClient::findSnapshotWindow(const char* providerId, const char* windowId) const {
    if (!_snapshot.valid) return nullptr;
    for (uint8_t i = 0; i < _snapshot.windowCount; i++) {
        if (isSameProvider(_snapshot.windows[i].providerId, providerId)) {
            if (windowId && windowId[0] != '\0') {
                if (strcasecmp(_snapshot.windows[i].windowId, windowId) == 0) {
                    return &_snapshot.windows[i];
                }
            } else {
                return &_snapshot.windows[i];
            }
        }
    }
    // Suffix / substring match fallback (e.g. "primary" matches "codex.primary" or vice versa)
    if (windowId && windowId[0] != '\0') {
        for (uint8_t i = 0; i < _snapshot.windowCount; i++) {
            if (isSameProvider(_snapshot.windows[i].providerId, providerId)) {
                if (containsIgnoreCase(_snapshot.windows[i].windowId, windowId) ||
                    containsIgnoreCase(windowId, _snapshot.windows[i].windowId)) {
                    return &_snapshot.windows[i];
                }
            }
        }
    }
    return nullptr;
}

static const char* resolveBadgeText(const char* providerId, const char* windowId, const SnapshotWindow* sw) {
    if (windowId && windowId[0] != '\0') {
        if (containsIgnoreCase(windowId, "3p-5h") || containsIgnoreCase(windowId, "3p_5h")) {
            return "3P 5h";
        }
        if (containsIgnoreCase(windowId, "3p-week") || containsIgnoreCase(windowId, "3p_week") || containsIgnoreCase(windowId, "3p-7d")) {
            return "3P Wk";
        }
        if (containsIgnoreCase(windowId, "gemini-5h") || containsIgnoreCase(windowId, "five") || containsIgnoreCase(windowId, "primary") || strcasecmp(windowId, "5h") == 0) {
            return "5h";
        }
        if (containsIgnoreCase(windowId, "gemini-week") || containsIgnoreCase(windowId, "week") || containsIgnoreCase(windowId, "secondary") || containsIgnoreCase(windowId, "7d")) {
            return "Weekly";
        }
    }

    if (sw) {
        if (containsIgnoreCase(sw->windowId, "3p-5h") || containsIgnoreCase(sw->windowId, "3p_5h") ||
            containsIgnoreCase(sw->label, "3p-5h") || containsIgnoreCase(sw->label, "3p 5h")) {
            return "3P 5h";
        }
        if (containsIgnoreCase(sw->windowId, "3p-week") || containsIgnoreCase(sw->windowId, "3p_week") || containsIgnoreCase(sw->windowId, "3p-7d") ||
            containsIgnoreCase(sw->label, "3p-week") || containsIgnoreCase(sw->label, "3p week") || containsIgnoreCase(sw->label, "3p-7d")) {
            return "3P Wk";
        }
        if (containsIgnoreCase(sw->windowId, "primary") || containsIgnoreCase(sw->label, "primary") ||
            containsIgnoreCase(sw->windowId, "5h") || containsIgnoreCase(sw->label, "5h")) {
            return "5h";
        }
        if (containsIgnoreCase(sw->windowId, "secondary") || containsIgnoreCase(sw->label, "secondary") ||
            containsIgnoreCase(sw->windowId, "week") || containsIgnoreCase(sw->label, "week") ||
            containsIgnoreCase(sw->windowId, "7d") || containsIgnoreCase(sw->label, "7d")) {
            return "Weekly";
        }
        if (sw->label[0] != '\0' && strlen(sw->label) <= 8) {
            return sw->label;
        }
    }

    return "Quota";
}

static int getWindowTier(const SnapshotWindow* w) {
    if (!w) return 0;
    const char* id = w->windowId;
    if (containsIgnoreCase(id, "primary") ||
        containsIgnoreCase(id, "five_hour") ||
        containsIgnoreCase(id, "five-hour") ||
        containsIgnoreCase(id, "5h")) {
        return -1;
    }
    if (containsIgnoreCase(id, "secondary") ||
        containsIgnoreCase(id, "seven_day") ||
        containsIgnoreCase(id, "seven-day") ||
        containsIgnoreCase(id, "7d") ||
        containsIgnoreCase(id, "week")) {
        return 1;
    }
    return 0;
}

static bool isMorePrimary(const SnapshotWindow* a, const SnapshotWindow* b) {
    if (!a && !b) return false;
    if (!a) return false;
    if (!b) return true;

    int tierA = getWindowTier(a);
    int tierB = getWindowTier(b);
    if (tierA != tierB) {
        return tierA < tierB;
    }

    if (a->windowDurationSeconds > 0 && b->windowDurationSeconds > 0) {
        if (a->windowDurationSeconds != b->windowDurationSeconds) {
            return a->windowDurationSeconds < b->windowDurationSeconds;
        }
    }

    return false;
}

uint8_t BMOMqttClient::collectUniqueProviders(const char* outProviders[MAX_CONFIG_SCREENS]) const {
    if (!outProviders) return 0;
    uint8_t count = 0;

    if (_config.valid) {
        for (uint8_t i = 0; i < _config.screenCount; i++) {
            if (_config.screens[i].kind == ScreenKind::QUOTA && _config.screens[i].providerId[0] != '\0') {
                const char* pid = _config.screens[i].providerId;
                bool duplicate = false;
                for (uint8_t j = 0; j < count; j++) {
                    if (isSameProvider(outProviders[j], pid)) {
                        duplicate = true;
                        break;
                    }
                }
                if (!duplicate && count < MAX_CONFIG_SCREENS) {
                    outProviders[count++] = pid;
                }
            }
        }
    }

    // Fallback: If _config has no quota screens (or is invalid), check _snapshot.windows
    if (count == 0 && _snapshot.valid) {
        for (uint8_t i = 0; i < _snapshot.windowCount; i++) {
            if (_snapshot.windows[i].providerId[0] != '\0') {
                const char* pid = _snapshot.windows[i].providerId;
                bool duplicate = false;
                for (uint8_t j = 0; j < count; j++) {
                    if (isSameProvider(outProviders[j], pid)) {
                        duplicate = true;
                        break;
                    }
                }
                if (!duplicate && count < MAX_CONFIG_SCREENS) {
                    outProviders[count++] = pid;
                }
            }
        }
    }

    return count;
}

uint8_t BMOMqttClient::getUniqueQuotaProviderCount() const {
    const char* providers[MAX_CONFIG_SCREENS];
    return collectUniqueProviders(providers);
}

const char* BMOMqttClient::getUniqueQuotaProviderAt(uint8_t index) const {
    const char* providers[MAX_CONFIG_SCREENS];
    uint8_t total = collectUniqueProviders(providers);
    if (index >= total) {
        return nullptr;
    }
    return providers[index];
}

uint8_t BMOMqttClient::getProviderWindows(const char* providerId, const SnapshotWindow* outWindows[2]) const {
    if (!outWindows) return 0;
    outWindows[0] = nullptr;
    outWindows[1] = nullptr;

    if (!providerId || providerId[0] == '\0' || !_snapshot.valid) {
        return 0;
    }

    const SnapshotWindow* matched[MAX_SNAPSHOT_WINDOWS];
    uint8_t count = 0;
    for (uint8_t i = 0; i < _snapshot.windowCount; i++) {
        if (isSameProvider(_snapshot.windows[i].providerId, providerId)) {
            if (count < MAX_SNAPSHOT_WINDOWS) {
                matched[count++] = &_snapshot.windows[i];
            }
        }
    }

    if (count == 0) {
        return 0;
    }

    if (count == 1) {
        outWindows[0] = matched[0];
        outWindows[1] = nullptr;
        return 1;
    }

    // Sort matched windows so primary is first
    for (uint8_t i = 0; i < count - 1; i++) {
        for (uint8_t j = i + 1; j < count; j++) {
            if (isMorePrimary(matched[j], matched[i])) {
                const SnapshotWindow* tmp = matched[i];
                matched[i] = matched[j];
                matched[j] = tmp;
            }
        }
    }

    outWindows[0] = matched[0];
    outWindows[1] = matched[1];
    return 2;
}

uint8_t BMOMqttClient::getTotalQuotaPages() const {
    // 1. Primary: Use configured screens from dashboard if available
    uint8_t configuredCount = getQuotaScreenCount();
    if (configuredCount > 0) {
        return configuredCount;
    }

    // 2. Fallback: If no configured quota screens, use snapshot windows directly
    if (_snapshot.valid && _snapshot.windowCount > 0) {
        return _snapshot.windowCount;
    }

    // 3. Fallback: Unique providers awaiting data
    return getUniqueQuotaProviderCount();
}

bool BMOMqttClient::getQuotaPage(uint8_t pageIndex, const char** outProviderId, const SnapshotWindow** outWindow, const char** outDefaultBadge) const {
    // 1. Primary: Use configured screens from dashboard if available
    uint8_t configuredCount = getQuotaScreenCount();
    if (configuredCount > 0) {
        if (pageIndex >= configuredCount) return false;
        const ConfigScreen* cs = getQuotaScreenAt(pageIndex);
        if (!cs) return false;

        if (outProviderId) *outProviderId = cs->providerId;
        const SnapshotWindow* sw = findSnapshotWindow(cs->providerId, cs->windowId);
        if (outWindow) *outWindow = sw;
        if (outDefaultBadge) {
            *outDefaultBadge = resolveBadgeText(cs->providerId, cs->windowId, sw);
        }
        return true;
    }

    // 2. Fallback: If no configured quota screens, use snapshot windows directly
    if (_snapshot.valid && _snapshot.windowCount > 0) {
        if (pageIndex >= _snapshot.windowCount) return false;
        const SnapshotWindow* sw = &_snapshot.windows[pageIndex];
        if (outProviderId) *outProviderId = sw->providerId;
        if (outWindow) *outWindow = sw;
        if (outDefaultBadge) {
            *outDefaultBadge = resolveBadgeText(sw->providerId, sw->windowId, sw);
        }
        return true;
    }

    // 3. Fallback: Unique providers awaiting data
    uint8_t totalProviders = getUniqueQuotaProviderCount();
    if (totalProviders > 0 && pageIndex < totalProviders) {
        const char* pid = getUniqueQuotaProviderAt(pageIndex);
        if (outProviderId) *outProviderId = pid;
        if (outWindow) *outWindow = nullptr;
        if (outDefaultBadge) *outDefaultBadge = "Quota";
        return true;
    }

    return false;
}
