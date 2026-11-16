# BMO Personal Desk Pet — ESP32 Firmware

Firmware for the **BMO Personal Desk Pet** running on the **AI-Thinker ESP32-CAM** (and compatible ESP32 development boards) paired with a **0.96-inch SSD1306 128×64 OLED display**.

---

## Features

- **13 Animated BMO Scenes:**
  1. `HAPPY`: Airy crescent eyes, a gentle swaying smile and blush cheeks.
  2. `NEUTRAL / BLINK`: Classic round eyes (`• •`) with a continuous left–right eye sweep.
  3. `WINK / PLAYFUL`: Asymmetric winking eye, tilted smile and moving sparkle.
  4. `WORRIED / SAD`: Slanted eyebrows, a gentle left–right eye sweep and a falling sweat drop.
  5. `SLEEPING`: Relaxed closed eyes (`- -`) with animated drifting "Z z z" bubbles.
  6. `SURPRISED / EXCITED`: Bobbing eyes, moving pupils, pulsing mouth and bouncing exclamation mark.
  7. `LOVE`: Pulsing heart eyes with hearts drifting upward.
  8. `DANCE`: Full-body BMO stepping sideways and swinging arms.
  9. `SIUUU`: Number 7 runs, jumps, turns and lands in the Ronaldo celebration.
  10. `MANCHESTER UNITED`: The owner-supplied Red Devil and trident silhouette, converted to monochrome, with a gentle float and four moving stars drawn in the side margins without shrinking the logo.
  11. `SIUUU FACE`: Eyes and mouth only; inhales, bounces with squeezed happy eyes and a pulsing mouth while displaying "SIUUU!", then smiles. This is a silent OLED animation.
  12. `COOL`: Oversized sunglasses with traveling reflections, a grin and head bob.
  13. `STARRY`: Pulsing five-pointed star eyes and an excited mouth.
- **Clock and weather:** Boots into a 24-hour Vietnam clock (UTC+7) with weekday/date and a static weather icon. The clock reads a retained `weather` MQTT topic during a single wake session, keeps it in RAM, and hides expired or future observations. No periodic weather wake is scheduled.
- **Interactive 2-Button Navigation:**
  - **Button A (Face Mode):**
    - Switches from Quota view back to Clock.
    - From Clock, opens the Happy face. In Face mode, cycles through all 13 scenes and then returns to Clock; the scene IDs are preserved.
  - **Button B (Quota Provider Mode):**
    - Switches from Face mode to Quota mode (showing Quota screen #1).
    - While in Quota mode, pressing Button B cycles through configured provider quotas (Claude, Codex, Antigravity).
    - Upon reaching the end of the quota list, displays the **"ALL PROVIDERS VIEWED / End of Quota List"** screen, informing the user that all providers have been seen and prompting either to restart or return to Face!
- **Robust Real-Time Telemetry:**
  - Subscribes to retained MQTT topics (`bmo/v1/devices/<deviceId>/{config,snapshot,weather}`) once per boot or button wake.
  - Validates monotonic revisions (`revision`, `configRevision`) and limits payloads to < 8 KiB.
  - Renders provider quota percentages, dynamic progress bars, and status pills (`[OK]`, `[STALE]`, `[UNAVAILABLE]`, `[UNSUPPORTED]`, `[ERROR]`).
  - Supports tombstones (zero-byte retirement messages).
- **ESP32-CAM Hardware Hardening:**
  - Custom I2C pin assignment: SDA on **GPIO 13**, SCL on **GPIO 14** (existing wiring).
  - Immediate boot suppression of the blinding GPIO 4 flash LED.
  - 160 MHz CPU power optimization for cool operation and reduced CPU frequency (power stability requires bench testing).
  - After five idle minutes, powers down radio and OLED and enters button-only CPU light sleep. A/B wake is consumed through release.

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
│   ├── faces.h                 # 14 scene IDs & animation controllers
│   ├── buttons.h               # 2-button debouncer and event generator
│   ├── navigation.h            # State machine coordinating modes and transitions
│   └── power_manager.h         # CPU scaling, flash LED safety, & display sleep
└── src/
    ├── main.cpp                # Core Arduino setup() and loop() orchestration
    ├── display.cpp             # SSD1306 implementation on custom pins
    ├── wifi_manager.cpp        # Reconnect state machine & SNTP synchronization
    ├── mqtt_client.cpp         # ArduinoJson MQTT parsing & tombstone detection
    ├── quota_renderer.cpp      # Quota UI layout & duration formatting
    ├── faces.cpp               # Existing eye rendering & shared scene timeline
    ├── face_layout.cpp         # Full-screen scene fitting with a one-pixel margin
    ├── face_scenes.cpp         # Refreshed home, wink, surprise & four new scenes
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
| **Button A** | Clock | Press | Opens Happy face |
| **Button A** | Face Mode | Press | Cycles to next BMO Face (Happy -> Blink -> Wink -> Worried -> Sleep -> Surprised -> Love -> Dance -> SIUUU -> MU -> SIUUU Face -> Cool -> Starry -> Clock) |
| **Button A** | Quota View | Press | Immediately returns to Clock |
| **Button A** | End of List | Press | Returns to Clock |
| **Button B** | Clock or Face Mode | Press | Enters Quota Mode at first provider screen |
| **Button B** | Quota View | Press | Advances to next Quota screen |
| **Button B** | Last Quota Screen | Press | Displays **"ALL PROVIDERS VIEWED / End of Quota List"** screen |
| **Button B** | End of List | Press | Wraps back to first Quota screen |
| **A or B** | Light sleep | Press | Wakes to Clock; release is consumed |

## Correction and verification status

Button A cycles faces after Clock. Button B advances configured quota pages. Empty lists and
end-of-list notifications return to Clock after 3 seconds. A returns
immediately; B on the end notification restarts the list. A zero remaining quota
is displayed as a quota value; it does not mean the list has ended.

Use ignored `include/config.local.h` for credentials. The tracked `config.h` is
only a loader. TLS is enabled by default: supply the broker hostname, port 8883,
and PEM root CA in `BMO_MQTT_CA_CERT`. Missing CA or unsynchronized time prevents
connection. The firmware never calls `setInsecure`; missing CA disables TLS MQTT.
Plaintext (`BMO_MQTT_TLS=0`, port 1883) is for trusted local tests only.

If Button B reports no quota and weather is blank, inspect the serial log before
changing server data. `[MQTT] TLS CA missing` means the device cannot connect:
set `BMO_MQTT_CA_CERT` in ignored `config.local.h` to the broker's trusted PEM
root CA, rebuild, and upload. A successful weather monitor response only proves
the server job ran; it does not prove the ESP received the retained messages.
The `[WAKE] Closing` log reports the Wi-Fi, UTC time, config, matching snapshot,
and weather stages separately. All five should be `1` after a complete session.
A cold boot tries the second configured NTP server after 3 seconds without UTC;
this avoids waiting for lwIP's longer default failover. A boot that still fails
to obtain UTC within the 20-second budget cannot start TLS MQTT. The next boot
or button wake from light sleep starts another session.
While awake after a completed session, the radio stays off; monitor updates are
received on the next boot or wake, rather than every 15 minutes on the device.
The clock's top-right Wi-Fi icon shows signal arcs while connected and the same
arcs crossed out while disconnected, including intentional radio shutdown.

Run the host tests under `tests/firmware/native/` for weather parsing, the wake
session, buttons, power policy, navigation, and clock formatting. Build both
`esp32cam` and `esp32cam_bench` PlatformIO environments. The preview at
`/tmp/bmo-clock-preview/index.html` can be regenerated with
`python3 tests/firmware/native/render_clock.py --preview /tmp/bmo-clock-preview/index.html`.
These checks do not prove DNS/TLS completion time, wake pin pull-ups, or battery
runtime on the ESP32-CAM. Those require the physical bench procedure.
Arduino IDE compatibility has not been validated; use the PlatformIO project.

## Clock reminders

The clock footer uses Vietnam time (UTC+7) for these daily reminders:

| Local time | Footer |
|---|---|
| 00:00–04:59 | IT'S LATE, SLEEP! |
| 05:00–08:59 | GOOD MORNING! |
| 09:00–11:29 | HAVE A NICE DAY! |
| 11:30–12:59 | TIME FOR LUNCH! |
| 13:00–13:59 | NAP & RECHARGE! |
| 14:00–17:59 | FANCY A COFFEE? |
| 18:00–19:59 | TIME FOR DINNER! |
| 20:00–21:59 | TIME TO UNWIND! |
| 22:00–23:59 | SWEET DREAMS! |

At 09:30–09:39 and 15:30–15:39, `TAKE A REST, HYDRATE!` overrides the normal
footer. Messages fit one centered line (at most 21 characters / 126 pixels).
They appear on the active clock screen; they do not wake the sleeping device,
interrupt quota/face screens, or send additional MQTT messages. Without a synced
clock, the footer remains `BMO IS READY!`.

## Pet animation preview

All pet scenes maximize a 126×62 viewport with a one-pixel outer margin.
Navigation dots are removed to free the full display height. Face scenes fill
the wide frame; full-body scenes and the MU mark preserve aspect ratio.
Fixed per-scene bounds include the full movement, avoiding scale changes while
an eye moves. Rendering uses one reusable 1 KiB scratch buffer.
New scenes repeat on a nonblocking 3.6-second cycle; Button A restarts the selected scene.
The five-minute idle policy now turns off OLED/radio and enters button-only light sleep.

After a PlatformIO build installs the Adafruit GFX dependency, run:

```bash
python3 tests/firmware/native/render_faces.py --preview /tmp/bmo-motion-preview/index.html
python3 tests/firmware/native/navigation_test.py
```

Open the generated HTML locally to view all fourteen animated scenes. Its pixels
come from production C++ rendering with the actual Adafruit GFX library; only
Arduino time and OLED transport are replaced. It is not a physical OLED test.
