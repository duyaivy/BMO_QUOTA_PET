#pragma once

#include <Arduino.h>

#define MAX_CONFIG_SCREENS  16
#define MAX_SNAPSHOT_WINDOWS 16

enum class ScreenKind {
    PET,
    QUOTA
};

enum class DataStatus {
    STATUS_OK,
    STATUS_UNAVAILABLE,
    STATUS_UNSUPPORTED,
    STATUS_ERROR
};

enum class SourceFreshness {
    FRESH,
    STALE,
    UNKNOWN
};

struct ConfigScreen {
    ScreenKind kind;
    char screenId[32];
    char providerId[24];
    char windowId[32];
};

struct DeviceConfig {
    uint32_t schemaVersion;
    char deviceId[32];
    uint32_t revision;
    char updatedAt[32];
    uint8_t screenCount;
    ConfigScreen screens[MAX_CONFIG_SCREENS];
    bool valid;
};

struct SnapshotWindow {
    char providerId[24];
    char windowId[32];
    char label[48];
    int32_t windowDurationSeconds;
    float usedPercent;       // -1.0f if null
    float remainingPercent;  // -1.0f if null
    char resetAt[32];
    DataStatus dataStatus;
    char collectedAt[32];
    char upstreamObservedAt[32];
    char freshnessBasis[24];
    SourceFreshness sourceFreshness;
    char validUntil[32];
};

struct DeviceSnapshot {
    uint32_t schemaVersion;
    char deviceId[32];
    uint32_t revision;
    uint32_t configRevision;
    char generatedAt[32];
    char validUntil[32];
    uint8_t windowCount;
    SnapshotWindow windows[MAX_SNAPSHOT_WINDOWS];
    bool valid;
};
