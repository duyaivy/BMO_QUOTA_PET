"""Exercise the real inactivity policy with a host clock and button GPIO."""
import pathlib
import subprocess
import tempfile

root = pathlib.Path(__file__).resolve().parents[3]
with tempfile.TemporaryDirectory() as directory:
    path = pathlib.Path(directory)
    (path/'power_manager.h').write_text('''
#include <cstdint>
extern uint32_t tick; extern bool aDown,bDown; unsigned long millis();
int digitalRead(int); constexpr int LOW=0,HIGH=1,PIN_BUTTON_A=15,PIN_BUTTON_B=12;
struct BMOPowerManager { BMOPowerManager(); void begin(); void resetActivityTimer(); void update(); bool shouldEnterSleep(uint32_t) const; bool enterButtonSleep(); void wakeScreen(); bool isScreenAsleep() const {return _screenAsleep;} private: uint32_t _lastActivityTime; bool _screenAsleep; static constexpr uint32_t SCREEN_TIMEOUT_MS=300000; };
extern BMOPowerManager powerManager;
''')
    (path/'display.h').write_text('''
struct Driver { void ssd1306_command(int){} }; struct Display { Driver driver; Driver& getDriver(){return driver;} } display;
constexpr int SSD1306_DISPLAYON=1, SSD1306_DISPLAYOFF=0;
''')
    (path/'esp_pm.h').write_text('#pragma once\n')
    (path/'esp_sleep.h').write_text('#pragma once\n')
    (path/'driver').mkdir()
    (path/'driver/gpio.h').write_text('#pragma once\n')
    (path/'soc').mkdir()
    (path/'soc/soc.h').write_text('#pragma once\n')
    (path/'soc/rtc_cntl_reg.h').write_text('#pragma once\n')
    source='struct Log { void println(const char*){} }; Log Serial;\n' + (root/'firmware/src/power_manager.cpp').read_text()
    # Hardware setup and actual sleep are excluded from this host policy test.
    begin=source.index('void BMOPowerManager::begin()')
    end=source.index('void BMOPowerManager::resetActivityTimer()',begin)
    source=source[:begin]+source[end:]
    begin=source.index('bool BMOPowerManager::enterButtonSleep()')
    end=source.index('void BMOPowerManager::update()',begin)
    source=source[:begin]+source[end:]
    source += '''
#include <cassert>
uint32_t tick=0;bool aDown=false,bDown=false;unsigned long millis(){return tick;}
int digitalRead(int pin){return (pin==PIN_BUTTON_A?aDown:bDown)?LOW:HIGH;}
int main(){
  powerManager.resetActivityTimer();
  tick=299999;assert(!powerManager.shouldEnterSleep(tick));
  tick=300000;assert(powerManager.shouldEnterSleep(tick));
  aDown=true;assert(!powerManager.shouldEnterSleep(tick));
  aDown=false;powerManager.resetActivityTimer();
  tick=599999;assert(!powerManager.shouldEnterSleep(tick));
  tick=600000;assert(powerManager.shouldEnterSleep(tick));
}
'''
    (path/'test.cpp').write_text(source)
    subprocess.run(['c++','-std=c++17','-I',str(path),str(path/'test.cpp'),'-o',str(path/'test')],check=True)
    subprocess.run([str(path/'test')],check=True)
print('Inactivity policy behavior passed')
