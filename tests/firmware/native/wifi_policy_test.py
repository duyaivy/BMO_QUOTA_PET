"""Exercise production Wi-Fi credential selection and no-internet config portal policy."""
import pathlib
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[3]

with tempfile.TemporaryDirectory() as directory:
    p = pathlib.Path(directory)
    (p / "test.cpp").write_text(r'''
#include "wifi_policy.h"
#include <cassert>

int main() {
    // 1. Compiled SSID from config.local.h is used initially until portal overrides it.
    assert(selectWifiCredentialSource(false, false, "Phongtro") == WifiCredentialSource::COMPILED_DEFAULT);
    assert(selectWifiCredentialSource(false, true, "Phongtro") == WifiCredentialSource::COMPILED_DEFAULT);

    // 2. Once user configures a network in portal, NVS credentials override compiled default.
    assert(selectWifiCredentialSource(true, true, "Phongtro") == WifiCredentialSource::NVS_SAVED);

    // 3. After Wi-Fi reset (useNvs=true, empty NVS), provisioning is required.
    assert(selectWifiCredentialSource(true, false, "Phongtro") == WifiCredentialSource::NONE);

    // 4. Placeholder compiled SSID falls back to NVS or triggers provisioning.
    assert(selectWifiCredentialSource(false, false, "YOUR_WIFI_SSID") == WifiCredentialSource::NONE);
    assert(selectWifiCredentialSource(false, true, "YOUR_WIFI_SSID") == WifiCredentialSource::NVS_SAVED);

    // 5. No-internet portal trigger policy.
    // Disconnected Wi-Fi never opens AP portal on wake failure.
    assert(!shouldOpenPortalForNoInternet(false, 15000, false, false, false));
    // Connected >= 4s with neither NTP nor MQTT success triggers AP portal once.
    assert(shouldOpenPortalForNoInternet(true, 4000, false, false, false));
    assert(shouldOpenPortalForNoInternet(true, 18000, false, false, false));
    // Slow DHCP (< 4s connected before deadline) does not false-trigger.
    assert(!shouldOpenPortalForNoInternet(true, 3999, false, false, false));
    // Either NTP arrival or MQTT connection proves internet works -> no portal.
    assert(!shouldOpenPortalForNoInternet(true, 18000, true, false, false));
    assert(!shouldOpenPortalForNoInternet(true, 18000, false, true, false));
    // Already offered once this wake -> no repeat portal loop.
    assert(!shouldOpenPortalForNoInternet(true, 18000, false, false, true));
}
''')
    subprocess.run(
        [
            "c++", "-std=c++17",
            "-I", str(ROOT / "firmware/include"),
            str(p / "test.cpp"), str(ROOT / "firmware/src/wifi_policy.cpp"),
            "-o", str(p / "test"),
        ],
        check=True,
    )
    subprocess.run([str(p / "test")], check=True)

print("Production Wi-Fi credential and no-internet portal policy passed")
