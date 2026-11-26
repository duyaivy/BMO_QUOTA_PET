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
#define SSD1306_BLACK 0
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
#include <cassert>
#include <cstdio>
Display display;
bool weatherIsFresh(const WeatherSnapshot& w,time_t now){return w.valid&&w.hasObservation&&w.dataAt<=now+300&&now<w.validUntil;}
void frame(time_t epoch, const WeatherSnapshot* weather, bool wifi = true) {
 clockRenderer.renderIfChanged(epoch,weather,true,wifi);
 if (wifi) {
  assert(display.oled.getPixel(120, 8) == 1);
  assert(display.oled.getPixel(126, 4) == 0);
 } else {
  assert(display.oled.getPixel(126, 4) == 1);
  assert(display.oled.getPixel(120, 8) == 0);
 }
 for(int y=0;y<64;y++)for(int x=0;x<128;x++)putchar(display.oled.getPixel(x,y)?'1':'0');
 putchar('\\n');
}

int main(){
 // 1. 00:00 midnight cold snow (SWEET DREAMS!, -12 deg, night, wifi)
 // 1709139600 is 2024-02-29 00:00 UTC+7
 WeatherSnapshot w1{}; w1.valid=true; w1.hasObservation=true; w1.condition=WeatherCondition::SNOW;
 w1.temperatureC=-12; w1.isDay=false; w1.dataAt=1709139600; w1.validUntil=1709143200;
 frame(1709139600, &w1, true);

 // 2. 08:08 morning sunny (GOOD MORNING!, 8 deg single digit, sunny, wifi)
 // 1709139600 + 8*3600 + 8*60 = 1709168880 (2024-02-29 08:08 UTC+7)
 WeatherSnapshot w2=w1; w2.condition=WeatherCondition::CLEAR; w2.isDay=true; w2.temperatureC=8;
 w2.dataAt=1709168880; w2.validUntil=1709172480;
 frame(1709168880, &w2, true);

 // 3. 09:41 morning cloudy (GOOD MORNING!, 28 deg, cloudy, wifi)
 // 1709139600 + 9*3600 + 41*60 = 1709174460 (2024-02-29 09:41 UTC+7)
 WeatherSnapshot w3=w1; w3.condition=WeatherCondition::CLOUDY; w3.isDay=true; w3.temperatureC=28;
 w3.dataAt=1709174460; w3.validUntil=1709178060;
 frame(1709174460, &w3, true);

 // 4. 12:59 noon partly cloudy (HAVE A NICE DAY!, 32 deg, partly cloudy, wifi)
 // 1709139600 + 12*3600 + 59*60 = 1709186340 (2024-02-29 12:59 UTC+7)
 WeatherSnapshot w4=w1; w4.condition=WeatherCondition::PARTLY_CLOUDY; w4.isDay=true; w4.temperatureC=32;
 w4.dataAt=1709186340; w4.validUntil=1709189940;
 frame(1709186340, &w4, true);

 // 5. 18:30 evening rain (GOOD EVENING!, 24 deg, rain, NO WIFI)
 // 1709139600 + 18*3600 + 30*60 = 1709206200 (2024-02-29 18:30 UTC+7)
 WeatherSnapshot w5=w1; w5.condition=WeatherCondition::RAIN; w5.isDay=false; w5.temperatureC=24;
 w5.dataAt=1709206200; w5.validUntil=1709209800;
 frame(1709206200, &w5, false);

 // 6. 23:59 night thunderstorm extreme negative (SWEET DREAMS!, -100 deg, storm, wifi)
 // 1735664340 is 2024-12-31 23:59 UTC+7
 WeatherSnapshot w6=w1; w6.condition=WeatherCondition::STORM; w6.isDay=false; w6.temperatureC=-100;
 w6.dataAt=1735664340; w6.validUntil=1735667940;
 frame(1735664340, &w6, true);

 // 7. 00:00 new year clear night (SWEET DREAMS!, 70 deg, clear night moon & star, wifi)
 // 1735664400 is 2025-01-01 00:00 UTC+7
 WeatherSnapshot w7=w1; w7.condition=WeatherCondition::CLEAR; w7.isDay=false; w7.temperatureC=70;
 w7.dataAt=1735664400; w7.validUntil=1735668000;
 frame(1735664400, &w7, true);

 // 8. Unknown time / no NTP sync (BMO IS READY!, --:--, ?, -- deg, NO WIFI)
 frame(0, nullptr, false);

 // 9. Synced time but weather missing/expired (HAVE A NICE DAY!, 14:15, ?, -- deg, wifi)
 // 1709139600 + 14*3600 + 15*60 = 1709190900 (2024-02-29 14:15 UTC+7)
 frame(1709190900, nullptr, true);

 // Reminder boundaries and the longest footer, using production GFX rendering.
 frame(1709173800, nullptr, false); // 09:30 hydration break
 frame(1709195400, nullptr, false); // 15:30 hydration break
 frame(1709186400, nullptr, false); // 13:00 nap
 frame(1709140500, nullptr, false); // 00:15 late-night reminder
}
''')
        command = ['c++', '-std=c++17', '-DARDUINO=100', '-I', str(p), '-I', str(GFX),
                   '-I', str(JSON), '-I', str(ROOT/'firmware/include'),
                   str(p/'test.cpp'), str(ROOT/'firmware/src/clock_renderer.cpp'),
                   str(GFX/'Adafruit_GFX.cpp'),
                   '-o', str(p/'test')]
        subprocess.run(command, check=True)
        frames = subprocess.run([str(p/'test')], capture_output=True, text=True, check=True).stdout.splitlines()
        assert len(frames) == 13 and all(len(frame) == 8192 for frame in frames)
        output = pathlib.Path(preview)
        output.parent.mkdir(parents=True, exist_ok=True)
        names = [
            '01_midnight_0000_snow_neg12',
            '02_morning_0808_sunny_8c',
            '03_morning_0941_cloudy_28c',
            '04_noon_1259_partlycloudy_32c',
            '05_evening_1830_rain_nowifi',
            '06_night_2359_storm_neg100',
            '07_newyear_0000_clearnight_70c',
            '08_unknown_time_no_weather',
            '09_synced_time_no_weather',
            '10_morning_hydration_break',
            '11_afternoon_hydration_break',
            '12_lunch_nap',
            '13_late_night_sleep',
        ]
        descriptions = [
            '00:00 · IT’S LATE, SLEEP! · Snow (-12°C) · Wi-Fi ON',
            '08:08 · GOOD MORNING! · Sunny (8°C) · Wi-Fi ON',
            '09:41 · HAVE A NICE DAY! · Cloudy (28°C) · Wi-Fi ON',
            '12:59 · TIME FOR LUNCH! · Partly Cloudy (32°C) · Wi-Fi ON',
            '18:30 · TIME FOR DINNER! · Rain (24°C) · Wi-Fi OFF',
            '23:59 · SWEET DREAMS! · Storm (-100°C) · Wi-Fi ON',
            '00:00 · IT’S LATE, SLEEP! · Clear Night (70°C) · Wi-Fi ON',
            '--:-- · BMO IS READY! · Unknown (--°) · Wi-Fi OFF',
            '14:15 · FANCY A COFFEE? · Unknown (--°) · Wi-Fi ON',
            '09:30 · TAKE A REST, HYDRATE! · Wi-Fi OFF',
            '15:30 · TAKE A REST, HYDRATE! · Wi-Fi OFF',
            '13:00 · NAP & RECHARGE! · Wi-Fi OFF',
            '00:15 · IT’S LATE, SLEEP! · Wi-Fi OFF',
        ]
        for name, frame in zip(names, frames):
            (output.parent / (name + '.png')).write_bytes(png(frame))
        output.write_text('<!doctype html><meta charset="utf-8"><title>BMO Minimal Pixel Clock Preview</title>'
                          '<style>body{background:#0e1615;color:#e4f5ed;font:15px system-ui;margin:32px}'
                          'h1{color:#8fe3be;font-size:24px;margin-bottom:8px}'
                          'p{color:#94b8aa;margin-top:0;margin-bottom:24px}'
                          'main{display:grid;grid-template-columns:repeat(auto-fit,minmax(520px,1fr));gap:24px}'
                          'figure{background:#162422;padding:16px;border-radius:8px;border:1px solid #233a36;margin:0}'
                          'figcaption{margin-top:10px;font-weight:600;color:#cfffe8}'
                          'img{width:512px;height:256px;image-rendering:pixelated;border:1px solid #3d635c;border-radius:4px;display:block}'
                          '</style>'
                          '<h1>BMO Minimal Pixel Clock · OLED 128x64 Preview</h1>'
                          '<p>Pixel-accurate render via Adafruit_GFX canvas engine (4x scale).</p><main>' + ''.join(
                              f'<figure><img src="{name}.png"><figcaption>{desc}</figcaption></figure>'
                              for name, desc in zip(names, descriptions)) + '</main>')
        print(f'Production clock preview: {output} ({len(names)} frames)')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--preview', required=True)
    run(parser.parse_args().preview)
