"""Exercise production clock formatting, freshness, and dirty render policy."""
import pathlib
import subprocess
import tempfile

root = pathlib.Path(__file__).resolve().parents[3]
with tempfile.TemporaryDirectory() as directory:
    path = pathlib.Path(directory)
    (path/'Arduino.h').write_text('#pragma once\n#include <cstdint>\n#include <cstddef>\n#include <cstring>\n#include <cstdio>\n')
    (path/'display.h').write_text('''#pragma once
constexpr int SSD1306_WHITE=1;
struct Driver {
 void clearDisplay(){} void setTextSize(int){} void setTextColor(int){} void setCursor(int,int){}
 void print(const char*){} void drawCircle(int,int,int,int){} void fillCircle(int,int,int,int){}
 void drawLine(int,int,int,int,int){} void drawRoundRect(int,int,int,int,int,int){}
 void drawFastHLine(int,int,int,int){} void drawPixel(int,int,int){}
};
struct Display {Driver driver; int flushes=0; Driver& getDriver(){return driver;} void update(){flushes++;}};
extern Display display;
''')
    (path/'test.cpp').write_text('''
#include "clock_renderer.h"
#include "display.h"
#include <cassert>
#include <cstring>
Display display;
int main(){
 BMOClockRenderer clock;
 ClockText text{};
 clock.format(0,nullptr,text);
 assert(strcmp(text.time,"--:--")==0 && text.date[0]=='\\0');
 // 2024-02-28T17:00:00Z is Thursday 29 February, 00:00 in UTC+7.
 clock.format(1709139600,nullptr,text);
 assert(strcmp(text.time,"00:00")==0 && strcmp(text.date,"T5 29/02")==0);
 clock.format(1733072400,nullptr,text);
 assert(strcmp(text.time,"00:00")==0 && strcmp(text.date,"T2 02/12")==0);
 clock.format(1735664340,nullptr,text);
 assert(strcmp(text.time,"23:59")==0 && strcmp(text.date,"T3 31/12")==0);
 clock.format(1735664400,nullptr,text);
 assert(strcmp(text.time,"00:00")==0 && strcmp(text.date,"T4 01/01")==0);
 WeatherSnapshot weather{}; weather.valid=true;weather.hasObservation=true;
 weather.condition=WeatherCondition::RAIN;weather.temperatureC=-12.5f;
 weather.dataAt=1709139600;weather.validUntil=1709143200;
 clock.renderIfChanged(1709139600,&weather,false);assert(display.flushes==1);
 clock.renderIfChanged(1709139630,&weather,false);assert(display.flushes==1);
 clock.renderIfChanged(1709139660,&weather,false);assert(display.flushes==2);
 clock.renderIfChanged(1709143200,&weather,false);assert(display.flushes==3);
 clock.format(1709143200,&weather,text);assert(strcmp(text.temperature,"--")==0);
 weather.dataAt=1709143501;weather.validUntil=1709147101;
 clock.format(1709143200,&weather,text);assert(strcmp(text.temperature,"--")==0);
 clock.renderIfChanged(1709143200,&weather,true);assert(display.flushes==4);
}
''')
    subprocess.run(['c++','-std=c++17','-I',str(path),'-I',str(root/'firmware/include'),str(path/'test.cpp'),str(root/'firmware/src/clock_renderer.cpp'),str(root/'firmware/src/weather.cpp'),'-I',str(root/'firmware/.pio/libdeps/esp32cam/ArduinoJson/src'),'-o',str(path/'test')],check=True)
    subprocess.run([str(path/'test')],check=True)
print('Clock formatting/dirty render behavior passed')
