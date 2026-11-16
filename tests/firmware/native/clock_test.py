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
constexpr int SSD1306_BLACK=0;
struct Driver {
 char lastPrint[64]{}; int cursorX=0,cursorY=0,printX=0,printY=0;
 void clearDisplay(){} void setTextSize(int){} void setTextColor(int){}
 void setCursor(int x,int y){cursorX=x;cursorY=y;}
 void print(const char* s){strncpy(lastPrint,s,sizeof(lastPrint)-1);printX=cursorX;printY=cursorY;}
 void drawCircle(int,int,int,int){} void fillCircle(int,int,int,int){}
 void drawLine(int,int,int,int,int){} void drawRoundRect(int,int,int,int,int,int){}
 void fillRoundRect(int,int,int,int,int,int){} void drawRect(int,int,int,int,int){}
 void fillRect(int,int,int,int,int){} void drawFastHLine(int,int,int,int){} void drawPixel(int,int,int){}
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
 assert(strcmp(text.reminder,"BMO IS READY!")==0);
 struct ReminderCase { int hour, minute; const char* expected; };
 const ReminderCase reminders[] = {
  {0,0,"IT'S LATE, SLEEP!"}, {4,59,"IT'S LATE, SLEEP!"},
  {5,0,"GOOD MORNING!"}, {8,59,"GOOD MORNING!"},
  {9,0,"HAVE A NICE DAY!"}, {9,29,"HAVE A NICE DAY!"},
  {9,30,"TAKE A REST, HYDRATE!"}, {9,39,"TAKE A REST, HYDRATE!"},
  {9,40,"HAVE A NICE DAY!"}, {11,29,"HAVE A NICE DAY!"},
  {11,30,"TIME FOR LUNCH!"}, {12,59,"TIME FOR LUNCH!"},
  {13,0,"NAP & RECHARGE!"}, {13,59,"NAP & RECHARGE!"},
  {14,0,"FANCY A COFFEE?"}, {15,29,"FANCY A COFFEE?"},
  {15,30,"TAKE A REST, HYDRATE!"}, {15,39,"TAKE A REST, HYDRATE!"},
  {15,40,"FANCY A COFFEE?"}, {17,59,"FANCY A COFFEE?"},
  {18,0,"TIME FOR DINNER!"}, {19,59,"TIME FOR DINNER!"},
  {20,0,"TIME TO UNWIND!"}, {21,59,"TIME TO UNWIND!"},
  {22,0,"SWEET DREAMS!"}, {23,59,"SWEET DREAMS!"},
 };
 for (const auto& c : reminders) {
  clock.format(1709139600+c.hour*3600+c.minute*60,nullptr,text);
  assert(strcmp(text.reminder,c.expected)==0);
  assert(strlen(text.reminder)*6 <= 126);
 }
 // 2024-02-28T17:00:00Z is Thursday 29 February, 00:00 in UTC+7.
 clock.format(1709139600,nullptr,text);
 assert(strcmp(text.time,"00:00")==0 && strcmp(text.date,"T5 29/02/2024")==0);
 clock.format(1733072400,nullptr,text);
 assert(strcmp(text.time,"00:00")==0 && strcmp(text.date,"T2 02/12/2024")==0);
 clock.format(1735664340,nullptr,text);
 assert(strcmp(text.time,"23:59")==0 && strcmp(text.date,"T3 31/12/2024")==0);
 clock.format(1735664400,nullptr,text);
 assert(strcmp(text.time,"00:00")==0 && strcmp(text.date,"T4 01/01/2025")==0);
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
 // Wi-Fi status change triggers dirty re-render
 clock.renderIfChanged(1709143200,&weather,false,false);assert(display.flushes==5);
 // The selected reminder reaches the footer and fits with a one-pixel margin.
 clock.renderIfChanged(1709173800,nullptr,false,false);
 assert(strcmp(display.driver.lastPrint,"TAKE A REST, HYDRATE!")==0);
 assert(display.driver.printX==1 && display.driver.printY==55);
 clock.renderIfChanged(1709174400,nullptr,false,false); // 09:40 resumes the daily greeting.
 assert(strcmp(display.driver.lastPrint,"HAVE A NICE DAY!")==0);
}
''')
    subprocess.run(['c++','-std=c++17','-I',str(path),'-I',str(root/'firmware/include'),str(path/'test.cpp'),str(root/'firmware/src/clock_renderer.cpp'),str(root/'firmware/src/weather.cpp'),'-I',str(root/'firmware/.pio/libdeps/esp32cam/ArduinoJson/src'),'-o',str(path/'test')],check=True)
    subprocess.run([str(path/'test')],check=True)
print('Clock formatting/dirty render behavior passed')
