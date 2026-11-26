"""Exercise production monthly calendar formatting, leap years, highlight bounds, and Adafruit GFX pixels."""
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
using byte = uint8_t;
using String = std::string;
using std::min; using std::max;
class __FlashStringHelper;
#define PROGMEM
#ifndef pgm_read_byte
#define pgm_read_byte(addr) (*(const uint8_t *)(addr))
#endif
inline float radians(float d) { return d * 0.01745329252f; }
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
        (p / "Adafruit_SSD1306.h").write_text("""#pragma once
#include "Adafruit_GFX.h"
#define SSD1306_WHITE 1
#define SSD1306_BLACK 0
class Adafruit_SSD1306 : public GFXcanvas1 { public:
    Adafruit_SSD1306() : GFXcanvas1(128, 64) { setTextWrap(false); }
    void clearDisplay() { fillScreen(0); }
};
""")
        (p / "display.h").write_text("""#pragma once
#include "Adafruit_SSD1306.h"
struct Display {
    Adafruit_SSD1306 oled;
    int flushes = 0;
    Adafruit_SSD1306& getDriver() { return oled; }
    void update() { flushes++; }
};
extern Display display;
""")
        (p / "test.cpp").write_text(r'''
#include "calendar_renderer.h"
#include "display.h"
#include <cassert>
#include <cstdio>

Display display;

static void dumpFrame() {
    for (int y = 0; y < 64; ++y) {
        for (int x = 0; x < 128; ++x) putchar(display.oled.getPixel(x, y) ? '1' : '0');
    }
    putchar('\n');
}

int main() {
    assert(calendarDaysInMonth(2024, 2) == 29);
    assert(calendarDaysInMonth(2026, 2) == 28);
    assert(calendarDaysInMonth(2100, 2) == 28);
    assert(calendarDaysInMonth(2000, 2) == 29);
    assert(calendarDaysInMonth(2026, 11) == 30);

    BMOCalendarRenderer cal;
    CalendarState st{};

    // Unsynced epoch stays blank/placeholder.
    cal.format(0, st, false);
    assert(!st.synced);
    cal.format(1699999999, st, true);
    assert(!st.synced);

    // 2024-02-28T17:00:00Z = 2024-02-29 00:00 UTC+7 (Feb 1, 2024 was Thursday -> col 3).
    cal.format(1709139600, st, true);
    assert(st.synced && st.year == 2024 && st.month == 2 && st.today == 29);
    assert(st.daysInMonth == 29 && st.firstCol == 3);

    // 2026-11-26 11:51 UTC+7 (1795668660): Nov 1, 2026 is Sunday -> col 6, 30 days (6 rows).
    cal.format(1795668660, st, true);
    assert(st.synced && st.year == 2026 && st.month == 11 && st.today == 26);
    assert(st.daysInMonth == 30 && st.firstCol == 6);

    // 2026-11-30 23:59:59 UTC+7 -> rolls to Dec 1 one second later.
    cal.format(1796057999, st, true);
    assert(st.year == 2026 && st.month == 11 && st.today == 30);
    cal.format(1796058000, st, true);
    assert(st.year == 2026 && st.month == 12 && st.today == 1 && st.daysInMonth == 31 && st.firstCol == 1);

    // Dirty render policy checks.
    cal.renderIfChanged(0, false, false);
    assert(display.flushes == 1);
    dumpFrame(); // Frame 0: Unsynced

    cal.renderIfChanged(1000, false, false);
    assert(display.flushes == 1); // Still unsynced & same wifi status -> no redraw.

    cal.renderIfChanged(1795668660, false, true); // 2026-11-26 (6 rows)
    assert(display.flushes == 2);
    cal.renderIfChanged(1795668720, false, true); // Same day, 1 min later -> no redraw!
    assert(display.flushes == 2);
    // Today = 26 is at row 4, col 3 -> cellX = 1 + 3*18 = 55, cellY = 22 + 4*7 = 50.
    // Pill is white at (58, 49) with black digit pixels inside (59..67, 50..54).
    assert(display.oled.getPixel(58, 49) == 1);
    assert(display.oled.getPixel(61, 52) == 0);
    dumpFrame(); // Frame 1: 2026-11-26

    // Stress-test bottom row highlight: Nov 30, 2026 (row 5, col 0 -> cellX=1, cellY=57, pill y=56..62).
    cal.renderIfChanged(1796057999, false, true);
    assert(display.flushes == 3);
    assert(display.oled.getPixel(4, 56) == 1);
    assert(display.oled.getPixel(4, 62) == 1);
    for (int x = 0; x < 128; ++x) assert(display.oled.getPixel(x, 63) == 0); // Bottom margin preserved
    dumpFrame(); // Frame 2: 2026-11-30

    // 5-row month with single-digit today highlighted: Dec 1, 2026 (row 0, col 1).
    cal.renderIfChanged(1796058000, false, false);
    assert(display.flushes == 4);
    // Wi-Fi OFF shows 13x7 battery icon (114..126, 1..7) instead of crossed-out Wi-Fi.
    assert(display.oled.getPixel(126, 4) == 1);
    assert(display.oled.getPixel(120, 8) == 0);
    dumpFrame(); // Frame 3: 2026-12-01 (Wi-Fi OFF)

    // When Wi-Fi is ON, top-right shows 11x8 Wi-Fi icon instead of battery.
    cal.renderIfChanged(1796058000, false, true);
    assert(display.flushes == 5);
    assert(display.oled.getPixel(120, 8) == 1);
    assert(display.oled.getPixel(126, 4) == 0);

    // Force refresh redraws even without data change.
    cal.renderIfChanged(1796058000, true, false);
    assert(display.flushes == 6);
}
''')
        subprocess.run(
            [
                "c++", "-std=c++17", "-DARDUINO=100",
                "-I", str(p), "-I", str(GFX), "-I", str(ROOT / "firmware/include"),
                str(p / "test.cpp"), str(ROOT / "firmware/src/calendar_renderer.cpp"),
                str(GFX / "Adafruit_GFX.cpp"),
                "-o", str(p / "test"),
            ],
            check=True,
        )
        frames = subprocess.run([str(p / "test")], capture_output=True, text=True, check=True).stdout.splitlines()
        assert len(frames) == 4 and all(len(f) == 128 * 64 for f in frames)

        if preview:
            out = pathlib.Path(preview)
            out.parent.mkdir(parents=True, exist_ok=True)
            names = [
                ("01_unsynced_waiting", "Unsynced (waiting for Wi-Fi / NTP)"),
                ("02_nov_2026_today_26", "THANG 11/2026 · Today 26 (6 rows)"),
                ("03_nov_2026_today_30", "THANG 11/2026 · Today 30 (bottom row)"),
                ("04_dec_2026_today_01_nowifi", "THANG 12/2026 · Today 1 (5 rows, Wi-Fi OFF)"),
            ]
            for (name, _), bits in zip(names, frames):
                (out.parent / f"{name}.png").write_bytes(to_png(bits))
            out.write_text(
                '<!doctype html><meta charset="utf-8"><title>BMO Calendar Preview</title>'
                '<style>body{background:#0e1615;color:#e4f5ed;font:15px system-ui;margin:32px}'
                'main{display:grid;grid-template-columns:repeat(auto-fit,minmax(520px,1fr));gap:24px}'
                'figure{background:#162422;padding:16px;border-radius:8px;border:1px solid #233a36;margin:0}'
                'img{width:512px;height:256px;image-rendering:pixelated;border:1px solid #3d635c;display:block}'
                'figcaption{margin-top:10px;font-weight:600;color:#cfffe8}</style>'
                '<h1>BMO Calendar Preview (128x64 OLED)</h1><main>'
                + "".join(f'<figure><img src="{n}.png"><figcaption>{d}</figcaption></figure>' for n, d in names)
                + "</main>"
            )

    print("Production calendar: leap years, UTC+7 boundaries, highlight bounds, and GFX render passed")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--preview")
    run(parser.parse_args().preview)
