# BMO Hardware Assembly & ESP32-CAM Integration Guide

This guide details the physical assembly, schematic wiring, power management design, and enclosure guidelines for building the **BMO Personal Desk Pet** using an **AI-Thinker ESP32-CAM** and a **0.96-inch SSD1306 OLED display**.

---

## 1. Bill of Materials (BOM)

| Item | Specification | Qty | Role / Purpose |
|---|---|---|---|
| **Microcontroller** | AI-Thinker ESP32-CAM (with antenna) | 1 | Main compute, Wi-Fi radio & animation driver |
| **Display** | 0.96" SSD1306 I2C OLED (128×64, 4-pin) | 1 | BMO facial animations & Quota screens |
| **Buttons** | 6×6mm tactile push buttons | 2 | Button A (Face cycle), Button B (Quota cycle) |
| **Battery** | 3.7V LiPo or Li-ion cell (600–1200 mAh) | 1 | Portable power |
| **Charger Module** | TP4056 with DW01A protection (USB-C) | 1 | Safe CC/CV charging & over-discharge cutoff |
| **3.3V LDO** | ME6211C33 / XC6206 / AMS1117-3.3 | 1 | Regulates 3.7V–4.2V down to clean 3.3V rail |
| **Decoupling Cap** | 220µF–470µF electrolytic / tantalum | 1 | Buffers peak Wi-Fi transmit current pulses |
| **Ceramic Cap** | 100nF (0.1µF) 50V ceramic | 1 | High-frequency noise suppression on 3.3V line |
| **Power Switch** | Mini SPDT slide switch | 1 | Physical ON/OFF switch |
| **USB-UART** | FTDI FT232RL or CH340 (3.3V logic) | 1 | Flashing code to ESP32-CAM (not in final build) |

---

## 2. ESP32-CAM Pinout & Wiring Map

The AI-Thinker ESP32-CAM exposes two 8-pin headers. Because we do not use the camera or MicroSD card, the SD card SPI data lines are repurposed as reliable I2C and GPIO inputs.

| Component Pin | ESP32-CAM Header Pin | GPIO # | Internal Mode | Notes |
|---|---|---|---|---|
| **SSD1306 SDA** | Header Pin (IO15) | **GPIO 15** | I2C Data | Custom SDA pin via `Wire.begin(15, 14)` |
| **SSD1306 SCL** | Header Pin (IO14) | **GPIO 14** | I2C Clock | Custom SCL pin at 400 kHz |
| **SSD1306 VCC** | 3V3 Pin | 3.3V Rail | Power | Connect to regulated 3.3V rail |
| **SSD1306 GND** | GND Pin | Ground | Ground | Shared ground with ESP32 |
| **Button A Pin 1** | Header Pin (IO13) | **GPIO 13** | `INPUT_PULLUP` | Pressing connects pin to GND |
| **Button A Pin 2** | GND Pin | Ground | - | Return ground |
| **Button B Pin 1** | Header Pin (IO12) | **GPIO 12** | `INPUT_PULLUP` | Initialized after boot to avoid strap conflict |
| **Button B Pin 2** | GND Pin | Ground | - | Return ground |
| **Decoupling Cap (+)**| 3V3 Pin | 3.3V Rail | - | Place as close as possible to ESP32 VCC |
| **Decoupling Cap (-)**| GND Pin | Ground | - | Shared ground |

> [!IMPORTANT]
> **GPIO 12 Boot Strapping Rule:**
> GPIO 12 (MTDI) determines the flash voltage during boot (0 = 3.3V, 1 = 1.8V).
> Since Button B connects GPIO 12 to **GND**, leaving the button unpressed during power-up keeps GPIO 12 LOW, guaranteeing normal 3.3V boot! Once booted, the firmware configures `pinMode(12, INPUT_PULLUP)`.
> *Alternative wiring:* If you prefer to avoid GPIO 12 entirely, you can wire Button B to **GPIO 16** or **GPIO 3 (RX0)** and change `PIN_BUTTON_B` in `firmware/include/config.h`.

---

## 3. Power Architecture & Wi-Fi Brownout Mitigation

```
 [ 3.7V LiPo Battery ]
         |
         v
 [ TP4056 Charger ] -----> [ SPDT Power Switch ]
                                   |
                                   v
                         [ 3.3V LDO Regulator ] (ME6211 / AMS1117)
                                   |
                                   +----+---> 220µF Cap ---> ESP32-CAM 3V3
                                   |    +---> 100nF Cap
                                   |
                                   +--------> SSD1306 OLED VCC
```

### Why Decoupling is Essential on ESP32-CAM
- The ESP32 Wi-Fi radio draws rapid current spikes up to **400mA–500mA** for a few milliseconds during packet transmission.
- Thin breadboard jumper wires or weak regulators produce voltage dips that trigger the ESP32's hardware brownout detector, causing continuous boot loops.
- **Remedy:** Solder a **220µF to 470µF capacitor** directly across the ESP32-CAM's `3V3` and `GND` pins.
- **Firmware Mitigation:**
  1. The firmware immediately forces **GPIO 4 (the high-intensity Flash LED) to LOW** on boot, preventing 1A draw from a floating gate.
  2. The CPU clock is scaled to **160 MHz** (`setCpuFrequencyMhz(160)`), lowering base power draw by ~40% while maintaining a fluid 30 FPS UI frame rate.

---

## 4. Initial Firmware Flashing (via USB-to-UART Adapter)

Because the ESP32-CAM does not have an onboard USB port, connect an external USB-to-UART adapter (set to **3.3V**):

```
 USB-to-UART (FTDI)         ESP32-CAM
 ------------------         ---------
 3.3V / VCC          ---->  5V or 3V3 (Use 5V pin if adapter delivers 5V)
 GND                 ---->  GND
 TXD                 ---->  U0R (GPIO 3)
 RXD                 ---->  U0T (GPIO 1)
                            
 BOOT STRAP:
 GND                 ---->  IO0 (Connect IO0 to GND during code upload!)
```

### Flashing Steps:
1. Connect **IO0 to GND** with a jumper wire.
2. Press the **RESET** button on the bottom of the ESP32-CAM (or cycle power).
3. In PlatformIO, run `pio run -t upload` (or in Arduino IDE, click Upload).
4. Once upload completes ("Leaving... Hard resetting via RTS pin..."), **remove the IO0 to GND jumper wire**.
5. Press the **RESET** button once more. BMO will boot and display the splash screen!

---

## 5. 3D Enclosure & BMO Styling

Following the reference project [`nturmose21/BMO-esp32-Pomodoro`](https://github.com/nturmose21/BMO-esp32-Pomodoro):
- Print the BMO front shell, back body, and button caps in turquoise/teal PLA or PETG.
- Mount the 0.96" SSD1306 OLED in the front face cutout behind a thin acrylic screen protector.
- The two front tactile buttons correspond to Button A (left/top) and Button B (right/bottom).
- Secure the ESP32-CAM and TP4056 board in the rear chamber with M2 screws or mounting brackets.
