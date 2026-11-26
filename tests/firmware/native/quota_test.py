"""Exercise production quota header status icons (Wi-Fi vs decorative battery) and GFX render."""
import argparse
import pathlib
import struct
import subprocess
import tempfile
import zlib

ROOT = pathlib.Path(__file__).resolve().parents[3]
GFX = ROOT / "firmware/.pio/libdeps/esp32cam/Adafruit GFX Library"


def to_png(bits: str, scale: int = 4) -> bytes:
    rows = bytearray()
    for y in range(64):
        line = bytearray()
        for x in range(128):
            color = (207, 255, 232) if bits[y * 128 + x] == "1" else (4, 9, 8)
            line.extend(bytes(color) * scale)
        for _ in range(scale):
            rows.append(0)
            rows.extend(line)

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">2I5B", 128 * scale, 64 * scale, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(bytes(rows), 9))
        + chunk(b"IEND", b"")
    )


def run(preview=None):
    if not (GFX / "Adafruit_GFX.cpp").exists():
        raise SystemExit("Build firmware first to install Adafruit GFX.")

    with tempfile.TemporaryDirectory() as directory:
        p = pathlib.Path(directory)
        (p / "Arduino.h").write_text("""#pragma once
#include <cstdint>
#include <cstdlib>
#include <cstdio>
#include <cstring>
#include <cmath>
#include <algorithm>
#include <string>
#include <strings.h>
using byte = uint8_t;
using String = std::string;
using std::min; using std::max;
class __FlashStringHelper;
#define PROGMEM
#ifndef pgm_read_byte
#define pgm_read_byte(addr) (*(const uint8_t *)(addr))
#endif
inline float radians(float d) { return d * 0.01745329252f; }
struct SerialStub {
    template <typename... Args> void printf(const char*, Args...) {}
    void println(const char*) {}
};
extern SerialStub Serial;
""")
        (p / "Print.h").write_text("""#pragma once
#include "Arduino.h"
class Print { public:
virtual size_t write(uint8_t) = 0;
size_t write(const char* s) { size_t n = 0; while (*s) n += write(uint8_t(*s++)); return n; }
size_t print(const char* s) { return write(s); }
};
""")
        for name in ("Adafruit_I2CDevice.h", "Adafruit_SPIDevice.h"):
            (p / name).write_text("#pragma once\n")
        (p / "Wire.h").write_text("""#pragma once
#include <cstdint>
struct TwoWire {
    void begin(int, int, uint32_t) {}
    void beginTransmission(uint8_t) {}
    uint8_t endTransmission() { return 0; }
};
extern TwoWire Wire;
""")
        (p / "config.h").write_text("""#pragma once
#define OLED_SCREEN_WIDTH 128
#define OLED_SCREEN_HEIGHT 64
#define OLED_I2C_ADDRESS 0x3C
#define OLED_RESET_PIN -1
#define PIN_I2C_SDA 13
#define PIN_I2C_SCL 14
""")
        (p / "Adafruit_SSD1306.h").write_text("""#pragma once
#include "Adafruit_GFX.h"
#include "Wire.h"
#define SSD1306_WHITE 1
#define SSD1306_BLACK 0
#define SSD1306_SWITCHCAPVCC 0x2
class Adafruit_SSD1306 : public GFXcanvas1 { public:
    Adafruit_SSD1306(uint8_t w, uint8_t h, TwoWire*, int8_t) : GFXcanvas1(w, h) { setTextWrap(false); }
    bool begin(uint8_t, uint8_t, bool, bool) { return true; }
    void clearDisplay() { fillScreen(0); }
    void display() {}
};
""")
        (p / "mqtt_client.h").write_text("""#pragma once
#include "contracts.h"
struct BMOMqttClient {
    bool retired = false;
    SnapshotWindow windows[3]{};
    bool isRetired() const { return retired; }
    uint8_t getTotalQuotaPages() const { return 3; }
    bool getQuotaPage(uint8_t idx, const char** providerId, const SnapshotWindow** sw, const char** badge) const {
        if (idx >= 3) return false;
        static const char* ids[3] = {"codex", "claude", "gemini"};
        static const char* badges[3] = {"5h", "Weekly", "Daily"};
        *providerId = ids[idx];
        *sw = &windows[idx];
        *badge = badges[idx];
        return true;
    }
};
extern BMOMqttClient mqttClient;
""")
        (p / "test.cpp").write_text(r'''
#include "quota_renderer.h"
#include "display.h"
#include "mqtt_client.h"
#include <cassert>
#include <cstdio>
#include <cstring>

SerialStub Serial;
TwoWire Wire;
BMOMqttClient mqttClient;

static void dumpFrame() {
    auto& oled = display.getDriver();
    for (int y = 0; y < 64; ++y) {
        for (int x = 0; x < 128; ++x) putchar(oled.getPixel(x, y) ? '1' : '0');
    }
    putchar('\n');
}

int main() {
    assert(display.begin());

    mqttClient.windows[0].remainingPercent = 98.0f;
    mqttClient.windows[0].windowDurationSeconds = 5 * 3600;
    mqttClient.windows[1].remainingPercent = 76.0f;
    mqttClient.windows[1].windowDurationSeconds = 7 * 86400;
    mqttClient.windows[2].remainingPercent = 42.0f;
    mqttClient.windows[2].windowDurationSeconds = 3600;

    auto& oled = display.getDriver();

    // 1. Offline after wake closes: top-right must show 13x7 rounded battery (114..126, 1..7), never "xW" or overlapping circle.
    quotaRenderer.renderQuotaScreen(0, false, false);
    assert(oled.getPixel(114, 1) == 0 && oled.getPixel(115, 1) == 1); // Rounded top-left corner
    assert(oled.getPixel(114, 2) == 1 && oled.getPixel(114, 6) == 1); // Left wall
    assert(oled.getPixel(126, 3) == 1 && oled.getPixel(126, 4) == 1 && oled.getPixel(126, 5) == 1); // Terminal nub
    assert(oled.getPixel(126, 2) == 0 && oled.getPixel(126, 6) == 0);
    assert(oled.getPixel(116, 4) == 1 && oled.getPixel(118, 4) == 0); // Bar 1 + gap
    assert(oled.getPixel(119, 4) == 1 && oled.getPixel(121, 4) == 0); // Bar 2 + gap
    assert(oled.getPixel(122, 4) == 1 && oled.getPixel(124, 4) == 0); // Bar 3 + gap
    assert(oled.getPixel(124, 2) == 0); // Inside black padding, no old MQTT circle
    assert(oled.getPixel(120, 8) == 0); // No Wi-Fi bottom dot when offline
    dumpFrame();

    // 2. Online during wake: top-right must show 11x8 Wi-Fi signal icon (115..125, 1..8).
    quotaRenderer.renderQuotaScreen(1, true, true);
    assert(oled.getPixel(120, 8) == 1); // Wi-Fi bottom dot
    assert(oled.getPixel(126, 4) == 0); // No battery nub when online
    assert(oled.getPixel(115, 3) == 1 && oled.getPixel(125, 3) == 1); // Outer arc tips
    dumpFrame();

    // 3. Offline third provider + BMODisplay::drawHeader parity check.
    quotaRenderer.renderQuotaScreen(2, false, false);
    assert(oled.getPixel(126, 4) == 1);
    dumpFrame();

    display.clear();
    display.drawHeader("STATUS", false, false);
    assert(oled.getPixel(126, 4) == 1 && oled.getPixel(120, 8) == 0);
    display.clear();
    display.drawHeader("STATUS", true, true);
    assert(oled.getPixel(120, 8) == 1 && oled.getPixel(126, 4) == 0);
}
''')
        subprocess.run(
            [
                "c++", "-std=c++17", "-DARDUINO=100",
                "-I", str(p), "-I", str(GFX), "-I", str(ROOT / "firmware/include"),
                str(p / "test.cpp"),
                str(ROOT / "firmware/src/quota_renderer.cpp"),
                str(ROOT / "firmware/src/display.cpp"),
                str(GFX / "Adafruit_GFX.cpp"),
                "-o", str(p / "test"),
            ],
            check=True,
        )
        frames = subprocess.run([str(p / "test")], capture_output=True, text=True, check=True).stdout.splitlines()
        assert len(frames) == 3 and all(len(f) == 128 * 64 for f in frames)

        if preview:
            out = pathlib.Path(preview)
            out.parent.mkdir(parents=True, exist_ok=True)
            names = [
                ("01_codex_offline_battery", "Codex · Offline (Battery icon, no xwD)"),
                ("02_claude_online_wifi", "Claude · Online (Wi-Fi icon)"),
                ("03_gemini_offline_battery", "Gemini · Offline (Battery icon)"),
            ]
            for (name, _), bits in zip(names, frames):
                (out.parent / f"{name}.png").write_bytes(to_png(bits))
            out.write_text(
                '<!doctype html><meta charset="utf-8"><title>BMO Quota Preview</title>'
                '<style>body{background:#0e1615;color:#e4f5ed;font:15px system-ui;margin:32px}'
                'main{display:grid;grid-template-columns:repeat(auto-fit,minmax(520px,1fr));gap:24px}'
                'figure{background:#162422;padding:16px;border-radius:8px;border:1px solid #233a36;margin:0}'
                'img{width:512px;height:256px;image-rendering:pixelated;border:1px solid #3d635c;display:block}'
                'figcaption{margin-top:10px;font-weight:600;color:#cfffe8}</style>'
                '<h1>BMO Quota Preview (128x64 OLED)</h1><main>'
                + "".join(f'<figure><img src="{n}.png"><figcaption>{d}</figcaption></figure>' for n, d in names)
                + "</main>"
            )

    print("Production quota header status icons and GFX render passed")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--preview")
    run(parser.parse_args().preview)
