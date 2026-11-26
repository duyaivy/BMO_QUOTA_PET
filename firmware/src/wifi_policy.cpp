#include "wifi_policy.h"
#include <cstring>

WifiCredentialSource selectWifiCredentialSource(bool useNvs, bool hasNvsSaved, const char* compiledSsid) {
    if (useNvs && hasNvsSaved) return WifiCredentialSource::NVS_SAVED;
    if (!useNvs && compiledSsid && compiledSsid[0] != '\0' && strcmp(compiledSsid, "YOUR_WIFI_SSID") != 0) {
        return WifiCredentialSource::COMPILED_DEFAULT;
    }
    if (hasNvsSaved) return WifiCredentialSource::NVS_SAVED;
    return WifiCredentialSource::NONE;
}

bool shouldOpenPortalForNoInternet(bool wifiConnectedThisWake,
                                   uint32_t wifiConnectedDurationMs,
                                   bool syncArrivedThisWake,
                                   bool mqttConnectedThisWake,
                                   bool portalAlreadyOffered) {
    if (portalAlreadyOffered || !wifiConnectedThisWake) return false;
    if (syncArrivedThisWake || mqttConnectedThisWake) return false;
    // Require enough connected time for NTP/MQTT attempts so slow DHCP doesn't false-trigger AP mode.
    return wifiConnectedDurationMs >= 4000u;
}
