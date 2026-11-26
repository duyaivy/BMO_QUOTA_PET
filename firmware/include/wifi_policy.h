#pragma once

#include <cstdint>

enum class WifiCredentialSource : uint8_t {
    NONE,
    NVS_SAVED,
    COMPILED_DEFAULT,
};

WifiCredentialSource selectWifiCredentialSource(bool useNvs, bool hasNvsSaved, const char* compiledSsid);

bool shouldOpenPortalForNoInternet(bool wifiConnectedThisWake,
                                   uint32_t wifiConnectedDurationMs,
                                   bool syncArrivedThisWake,
                                   bool mqttConnectedThisWake,
                                   bool portalAlreadyOffered);
