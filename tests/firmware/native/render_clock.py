"""Render production clock/GFX pixels into a static preview and PNG frames."""
import argparse
import pathlib
import struct
import subprocess
import tempfile
import zlib

ROOT = pathlib.Path(__file__).resolve().parents[3]
GFX = ROOT / 'firmware/.pio/libdeps/esp32cam/Adafruit GFX Library'
JSON = ROOT / 'firmware/.pio/libdeps/esp32cam/ArduinoJson/src'


def png(bits):
    scale = 4
    rows = bytearray()
    for y in range(64):
        line = bytearray()
        for x in range(128):
            color = (207, 255, 232) if bits[y * 128 + x] == '1' else (4, 9, 8)
            line.extend(bytes(color) * scale)
        for _ in range(scale):
            rows.append(0)
            rows.extend(line)

    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))

    return (b'\x89PNG\r\n\x1a\n' +
            chunk(b'IHDR', struct.pack('>2I5B', 128 * scale, 64 * scale, 8, 2, 0, 0, 0)) +
            chunk(b'IDAT', zlib.compress(bytes(rows), 9)) + chunk(b'IEND', b''))


def run(preview):
    if not (GFX / 'Adafruit_GFX.cpp').exists():
        raise SystemExit('Build firmware first to install Adafruit GFX.')
    with tempfile.TemporaryDirectory() as directory:
        p = pathlib.Path(directory)
        (p / 'Arduino.h').write_text('''#pragma once
#include <cstdint>
#include <cstdlib>
#include <cstdio>
#include <cstring>
#include <cmath>
#include <algorithm>
#include <string>
using byte=uint8_t; using String=std::string; using std::min; using std::max;
class __FlashStringHelper;
#define PROGMEM
inline float radians(float d){return d*0.01745329252f;}
''')
        (p / 'Print.h').write_text('''#pragma once
#include "Arduino.h"
class Print { public: virtual size_t write(uint8_t)=0;
size_t write(const char* s){size_t n=0;while(*s)n+=write(uint8_t(*s++));return n;}
size_t print(const char* s){return write(s);} };
''')
        for name in ('Adafruit_I2CDevice.h', 'Adafruit_SPIDevice.h'):
            (p / name).write_text('#pragma once\n')
        (p / 'Adafruit_SSD1306.h').write_text('''#pragma once
#include "Adafruit_GFX.h"
#define SSD1306_WHITE 1
class Adafruit_SSD1306 : public GFXcanvas1 { public:
 Adafruit_SSD1306():GFXcanvas1(128,64){setTextWrap(false);}
 void clearDisplay(){fillScreen(0);} };
''')
        (p / 'display.h').write_text('''#pragma once
#include "Adafruit_SSD1306.h"
struct Display {Adafruit_SSD1306 oled; Adafruit_SSD1306& getDriver(){return oled;} void update(){} };
extern Display display;
''')
        (p / 'test.cpp').write_text('''#include "clock_renderer.h"
#include "display.h"
#include <cstdio>
Display display;
bool weatherIsFresh(const WeatherSnapshot& w,time_t now){return w.valid&&w.hasObservation&&w.dataAt<=now+300&&now<w.validUntil;}
void frame(time_t epoch, const WeatherSnapshot* weather) {
 clockRenderer.renderIfChanged(epoch,weather,true);
 for(int y=0;y<64;y++)for(int x=0;x<128;x++)putchar(display.oled.getPixel(x,y)?'1':'0');
 putchar('\\n');
}
int main(){
 WeatherSnapshot cold{};
 cold.valid=true;cold.hasObservation=true;cold.condition=WeatherCondition::SNOW;
 cold.temperatureC=-100;cold.isDay=false;cold.dataAt=1735664340;cold.validUntil=1735667940;
 WeatherSnapshot hot=cold;hot.condition=WeatherCondition::CLEAR;hot.temperatureC=70;
 frame(1709139600,nullptr);
 frame(1735664340,&cold);
 frame(1735664400,&hot);
 frame(0,nullptr);
}
''')
        command = ['c++', '-std=c++17', '-DARDUINO=100', '-I', str(p), '-I', str(GFX),
                   '-I', str(JSON), '-I', str(ROOT/'firmware/include'),
                   str(p/'test.cpp'), str(ROOT/'firmware/src/clock_renderer.cpp'),
                   str(GFX/'Adafruit_GFX.cpp'),
                   '-o', str(p/'test')]
        subprocess.run(command, check=True)
        frames = subprocess.run([str(p/'test')], capture_output=True, text=True, check=True).stdout.splitlines()
        assert len(frames) == 4 and all(len(frame) == 8192 for frame in frames)
        output = pathlib.Path(preview)
        output.parent.mkdir(parents=True, exist_ok=True)
        names = ['leap-midnight', 'new-year-2359-minus-100', 'new-year-0000-plus-70', 'unknown-time']
        for name, frame in zip(names, frames):
            (output.parent / (name + '.png')).write_bytes(png(frame))
        output.write_text('<!doctype html><meta charset="utf-8"><title>BMO clock preview</title>'
                          '<style>body{background:#101918;color:#e4f5ed;font:16px system-ui;margin:32px}'
                          'main{display:grid;grid-template-columns:repeat(auto-fit,minmax(520px,1fr));gap:24px}'
                          'img{width:512px;image-rendering:pixelated;border:1px solid #667}</style>'
                          '<h1>BMO clock · production GFX pixels</h1><main>' + ''.join(
                              f'<figure><img src="{name}.png"><figcaption>{name}</figcaption></figure>'
                              for name in names) + '</main>')
        print(f'Production clock preview: {output} (4 frames)')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--preview', required=True)
    run(parser.parse_args().preview)
