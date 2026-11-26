"""Render production payment QR screen with real Adafruit GFX and verify decodability."""
import argparse
import pathlib
import struct
import subprocess
import tempfile
import zlib

ROOT = pathlib.Path(__file__).resolve().parents[3]
GFX = ROOT / "firmware/.pio/libdeps/esp32cam/Adafruit GFX Library"
EXPECTED_PAYLOAD = "00020101021138550010A000000727012500069704230111909797833960208QRIBFTTA53037045802VN6304C652"


def to_png(bits: str, scale: int = 4) -> bytes:
    rows = bytearray()
    for y in range(64):
        line = bytearray()
        for x in range(128):
            color = (255, 255, 255) if bits[y * 128 + x] == "1" else (0, 0, 0)
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
        raise SystemExit("Build firmware with PlatformIO first to install Adafruit GFX.")

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
        (p / "test.cpp").write_text("""#include "payment_qr.h"
#include <cassert>
#include <cstdio>
int main() {
    Adafruit_SSD1306 oled;
    renderPaymentQr(oled);
    // Keep 1px edge safety margin and 2px quiet zone around 58x58 QR (x=3..60, y=3..60).
    for (int x = 0; x < 128; ++x) {
        assert(!oled.getPixel(x, 0) && !oled.getPixel(x, 63));
    }
    for (int y = 0; y < 64; ++y) {
        assert(!oled.getPixel(0, y) && !oled.getPixel(127, y));
    }
    for (int y = 1; y <= 62; ++y) {
        for (int x = 1; x <= 62; ++x) {
            bool inQuietZone = (x < 3 || x > 60 || y < 3 || y > 60);
            if (inQuietZone) assert(oled.getPixel(x, y) && "QR quiet zone must remain solid white");
        }
    }
    for (int y = 0; y < 64; ++y) {
        for (int x = 0; x < 128; ++x) putchar(oled.getPixel(x, y) ? '1' : '0');
    }
    putchar('\\n');
}
""")
        subprocess.run(
            [
                "c++", "-std=c++17", "-DARDUINO=100",
                "-I", str(p), "-I", str(GFX), "-I", str(ROOT / "firmware/include"),
                str(p / "test.cpp"), str(GFX / "Adafruit_GFX.cpp"),
                "-o", str(p / "test"),
            ],
            check=True,
        )
        res = subprocess.run([str(p / "test")], capture_output=True, text=True, check=True)
        bits = res.stdout.strip()
        assert len(bits) == 128 * 64

        png_path = pathlib.Path(preview) if preview else (p / "qr.png")
        png_path.parent.mkdir(parents=True, exist_ok=True)
        png_path.write_bytes(to_png(bits))

        # Verify on macOS via Vision barcode detector when swift is available.
        swift_check = f'''
import Foundation
import Vision
let url = URL(fileURLWithPath: "{png_path}")
var decoded = ""
let req = VNDetectBarcodesRequest {{ r, _ in
    decoded = (r.results as? [VNBarcodeObservation])?.first?.payloadStringValue ?? ""
}}
try VNImageRequestHandler(url: url, options: [:]).perform([req])
print(decoded)
'''
        vision = subprocess.run(["swift", "-e", swift_check], capture_output=True, text=True)
        if vision.returncode == 0:
            decoded = vision.stdout.strip()
            assert decoded == EXPECTED_PAYLOAD, f"QR mismatch: got {decoded!r}, expected {EXPECTED_PAYLOAD!r}"
            print(f"Production payment QR: margins, quiet zone, and Vision decode passed ({len(decoded)} bytes)")
        else:
            print("Production payment QR: margins and quiet zone passed (Vision check unavailable)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--preview")
    run(parser.parse_args().preview)
