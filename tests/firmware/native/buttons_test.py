"""Exercise production wake-press consumption through release and debounce."""
import pathlib
import subprocess
import tempfile

root = pathlib.Path(__file__).resolve().parents[3]
with tempfile.TemporaryDirectory() as directory:
    path = pathlib.Path(directory)
    (path/'Arduino.h').write_text('''#pragma once
#include <cstdint>
extern uint32_t tick; extern bool aDown,bDown;
constexpr int LOW=0,HIGH=1,INPUT_PULLUP=2;
unsigned long millis(); int digitalRead(int); void pinMode(int,int); void delay(int);
struct Log { template<class... A> void printf(const char*,A...){} void println(const char*){} }; extern Log Serial;
''')
    (path/'config.h').write_text('''#pragma once
constexpr int PIN_BUTTON_A=15,PIN_BUTTON_B=12;
constexpr uint32_t BUTTON_DEBOUNCE_MS=35,BUTTON_HOLD_MS=1200;
''')
    (path/'test.cpp').write_text('''
#include "buttons.h"
#include <cassert>
uint32_t tick=0; bool aDown=false,bDown=false; Log Serial;
unsigned long millis(){return tick;} int digitalRead(int pin){return (pin==15?aDown:bDown)?LOW:HIGH;}
void pinMode(int,int){} void delay(int){}
int main(){
 buttonManager.begin();
 aDown=true;tick=10;buttonManager.consumeWakePress();
 tick=100;buttonManager.update();assert(!buttonManager.wasClicked(ButtonId::BUTTON_A));
 aDown=false;tick=120;buttonManager.update();tick=160;buttonManager.update();
 assert(!buttonManager.wasClicked(ButtonId::BUTTON_A));
 aDown=true;tick=200;buttonManager.update();tick=240;buttonManager.update();
 aDown=false;tick=280;buttonManager.update();tick=320;buttonManager.update();
 assert(buttonManager.wasClicked(ButtonId::BUTTON_A));
}
''')
    subprocess.run(['c++','-std=c++17','-I',str(path),'-I',str(root/'firmware/include'),str(path/'test.cpp'),str(root/'firmware/src/buttons.cpp'),'-o',str(path/'test')],check=True)
    subprocess.run([str(path/'test')],check=True)
print('Wake press consumption passed')
