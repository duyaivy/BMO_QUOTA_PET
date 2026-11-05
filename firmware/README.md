# BMO Personal Desk Pet — ESP32 Firmware

Firmware for the **BMO Personal Desk Pet** running on the **AI-Thinker ESP32-CAM** (and compatible ESP32 development boards) paired with a **0.96-inch SSD1306 128×64 OLED display**.

---

## Features

- **6 Animated BMO Expressions:**
  1. `HAPPY`: Radiant curved eyes (`^ ^`) and cheerful open smile with blush cheeks.
  2. `NEUTRAL / BLINK`: Classic round eyes (`• •`) with natural periodic blinking animation.
  3. `WINK / PLAYFUL`: Playful winking eye with open smile and sticking tongue.
  4. `WORRIED / SAD`: Slanted eyebrows with watery eyes and quivering mouth.
  5. `SLEEPING`: Relaxed closed eyes (`- -`) with animated drifting "Z z z" bubbles.
  6. `SURPRISED / EXCITED`: Wide eyes (`O O`) and big open mouth (`:O`).
- **Interactive 2-Button Navigation:**
  - **Button A (Face Mode):**
    - Switches from Quota view back to BMO Face mode.
    - While in Face mode, pressing Button A cycles through all 6 facial expressions (`1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 1`).
  - **Button B (Quota Provider Mode):**
    - Switches from Face mode to Quota mode (showing Quota screen #1).
    - While in Quota mode, pressing Button B cycles through configured provider quotas (Claude, Codex, Antigravity).
    - Upon reaching the end of the quota list, displays the **"ALL PROVIDERS VIEWED / End of Quota List"** screen, informing the user that all providers have been seen and prompting either to restart or return to Face!
- **Robust Real-Time Telemetry:**
  - Subscribes to retained MQTT topics (`bmo/v1/devices/<deviceId>/{config,snapshot}`).
  - Validates monotonic revisions (`revision`, `configRevision`) and limits payloads to < 8 KiB.
  - Renders provider quota percentages, dynamic progress bars, and status pills (`[OK]`, `[STALE]`, `[UNAVAILABLE]`, `[UNSUPPORTED]`, `[ERROR]`).
  - Supports tombstones (zero-byte retirement messages).
- **ESP32-CAM Hardware Hardening:**
  - Custom I2C pin assignment: SDA on **GPIO 13**, SCL on **GPIO 14** (existing wiring).
  - Immediate boot suppression of the blinding GPIO 4 flash LED.
  - 160 MHz CPU power optimization for cool operation and reduced CPU frequency (power stability requires bench testing).
  - Idle screen saver timeout (5 minutes) to protect OLED phosphor from burn-in.

---

## Directory Structure

```text
firmware/
├── platformio.ini              # PlatformIO project configuration
├── BMO_Firmware.ino            # Arduino IDE entry point
├── HARDWARE.md                 # Pinout, schematic, power, & 3D enclosure guide
├── README.md                   # This documentation
├── include/
│   ├── config.example.h        # Configuration template
│   ├── config.h                # Loader for ignored config.local.h or example defaults
│   ├── contracts.h             # C++ data structures for MQTT Config & Snapshot v1
│   ├── display.h               # OLED driver wrapper & primitive drawing widgets
│   ├── wifi_manager.h          # Non-blocking Wi-Fi manager & SNTP clock client
│   ├── mqtt_client.h           # PubSubClient MQTT manager with revision arbitration
│   ├── quota_renderer.h        # Quota screen formatting & progress bar renderer
│   ├── faces.h                 # 6 BMO facial expressions & animation controllers
│   ├── buttons.h               # 2-button debouncer and event generator
│   ├── navigation.h            # State machine coordinating modes and transitions
│   └── power_manager.h         # CPU scaling, flash LED safety, & display sleep
└── src/
    ├── main.cpp                # Core Arduino setup() and loop() orchestration
    ├── display.cpp             # SSD1306 implementation on custom pins
    ├── wifi_manager.cpp        # Reconnect state machine & SNTP synchronization
    ├── mqtt_client.cpp         # ArduinoJson MQTT parsing & tombstone detection
    ├── quota_renderer.cpp      # Quota UI layout & duration formatting
    ├── faces.cpp               # Procedural vector rendering for 6 BMO expressions
    ├── buttons.cpp             # Hardware pin reading & debouncing
    ├── navigation.cpp          # Button A & B event handler & screen router
    └── power_manager.cpp       # Flash LED cutoff & OLED sleep control
```

---

## Getting Started

For the first physical test, follow [BENCH_TEST.md](BENCH_TEST.md). Use the
`esp32cam_bench` environment to test OLED/buttons without Wi-Fi or MQTT.
Battery, charging and enclosure power design are deferred. The normal `esp32cam`
environment still enables Wi-Fi and MQTT and requires the configuration below.

### 1. Configuration

Copy `include/config.example.h` to `include/config.local.h`:

```bash
cp firmware/include/config.example.h firmware/include/config.local.h
```

Edit `include/config.local.h` and update:
- `BMO_WIFI_SSID` & `BMO_WIFI_PASSWORD`
- `BMO_MQTT_BROKER` (IP or hostname of your local EMQX or staging broker)
- `BMO_DEVICE_ID` (matches the device enrolled on the BMO dashboard, e.g. `bmo-dev-01`)

### 2. Building & Flashing with PlatformIO (Recommended)

1. Connect your USB-to-UART adapter to the ESP32-CAM:
   - Stable external 5V supply -> ESP32-CAM **5V**; supply GND -> board GND.
   - USB-UART uses **3.3V logic**; leave its VCC disconnected when using external power.
   - FTDI GND -> ESP32-CAM GND
   - FTDI TX -> ESP32-CAM U0R (GPIO 3)
   - FTDI RX -> ESP32-CAM U0T (GPIO 1)
   - **Connect IO0 to GND** before powering on to enter bootloader mode.
2. Build and upload:
   ```bash
   pio run -d firmware -e esp32cam -t upload
   ```
3. Disconnect **IO0 from GND** and press the **Reset** button on the bottom of the ESP32-CAM.
4. Monitor serial logs:
   ```bash
   pio device monitor -b 115200
   ```

### 3. Building & Flashing with Arduino IDE

1. Open `firmware/BMO_Firmware.ino` in Arduino IDE.
2. Under **Tools > Board > ESP32 Arduino**, select **AI Thinker ESP32-CAM**.
3. Install required libraries from Library Manager:
   - `Adafruit SSD1306`
   - `Adafruit GFX Library`
   - `ArduinoJson` (v7)
   - `PubSubClient` (by Nick O'Leary)
4. Upload code following the boot strap instructions above.

---

## Button Controls Reference

| Button | Current Screen | Action | Result |
|---|---|---|---|
| **Button A** | Face Mode | Press | Cycles to next BMO Face (Happy -> Blink -> Wink -> Worried -> Sleep -> Surprised) |
| **Button A** | Quota View | Press | Immediately returns to Face Mode |
| **Button A** | End of List | Press | Returns to Face Mode |
| **Button B** | Face Mode | Press | Enters Quota Mode at first provider screen |
| **Button B** | Quota View | Press | Advances to next Quota screen |
| **Button B** | Last Quota Screen | Press | Displays **"ALL PROVIDERS VIEWED / End of Quota List"** screen |
| **Button B** | End of List | Press | Wraps back to first Quota screen |

## Correction and verification status

Button A cycles faces. Button B advances configured quota pages. Empty lists and
end-of-list notifications return to the current face after 3 seconds. A returns
immediately; B on the end notification restarts the list. A zero remaining quota
is displayed as a quota value; it does not mean the list has ended.

Use ignored `include/config.local.h` for credentials. The tracked `config.h` is
only a loader. TLS is enabled by default: supply the broker hostname, port 8883,
and PEM root CA in `BMO_MQTT_CA_CERT`. Missing CA or unsynchronized time prevents
connection. Plaintext (`BMO_MQTT_TLS=0`, port 1883) is for trusted local tests only.

Run `python3 tests/firmware/native/navigation_test.py` from the repository root
for host tests of the production navigation implementation. The TypeScript
simulator alone is not firmware validation. Both `esp32cam` and `esp32cam_bench`
compiled successfully on 2026-11-03. TLS integration, OLED output, electrical
design, runtime and charging require physical validation.
Arduino IDE compatibility has not been validated; use the PlatformIO project.
