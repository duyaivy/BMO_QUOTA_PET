"""Compile the production navigation implementation with host hardware adapters."""
import pathlib, subprocess, tempfile
root = pathlib.Path(__file__).resolve().parents[3]
with tempfile.TemporaryDirectory() as d:
    p = pathlib.Path(d)
    (p/'navigation.h').write_text('''
#include <cstdint>
unsigned long tick=0; unsigned long millis(){return tick;}
struct Log {void println(const char*){} template<class... T> void printf(const char*, T...){} } Serial;
enum class ButtonId {BUTTON_A,BUTTON_B};
struct Buttons {bool a=false,b=false; void update(){} bool wasClicked(ButtonId id){bool &v=id==ButtonId::BUTTON_A?a:b;bool old=v;v=false;return old;}} buttonManager;
struct Faces {int face=0;void nextFace(){face=(face+1)%6;} int getCurrentFace(){return face;} const char* getFaceName(int){return "";} void render(int){} } faceRenderer;
constexpr int FACE_COUNT=6, END_OF_LIST_AUTO_WRAP_MS=3000;
struct Display {int getDriver(){return 0;}void update(){} void showEmptyQuotaScreen(){} void showEndOfListScreen(){} } display;
struct Renderer {void renderQuotaScreen(int,bool,bool){} } quotaRenderer;
enum class UIMode {PET_FACE,QUOTA_VIEW,END_OF_LIST};
class BMONavigationController {public: BMONavigationController();void begin();void update();void render();UIMode mode(){return _mode;}private:void handleButtonA();void handleButtonB();UIMode _mode;uint8_t _quotaIndex;unsigned long _endOfListEnteredAt;};
''')
    (p/'mqtt_client.h').write_text('struct Mqtt {int count=3;int getTotalQuotaPages(){return count;}int getQuotaScreenCount(){return count;}bool isConnected(){return true;}} mqttClient;')
    (p/'wifi_manager.h').write_text('struct Wifi {bool isWifiConnected(){return true;}} connManager;')
    (p/'power_manager.h').write_text('struct Power {int activity=0;void resetActivityTimer(){activity++;}} powerManager;')
    source=(root/'firmware/src/navigation.cpp').read_text()
    source+='''
#include <cassert>
int main(){
 navigation.begin();
 for(int i=0;i<6;i++){buttonManager.a=true;navigation.update();}
 assert(faceRenderer.face==0 && powerManager.activity==6);
 for(int i=0;i<4;i++){buttonManager.b=true;navigation.update();}
 assert(navigation.mode()==UIMode::END_OF_LIST);
 tick=3001;navigation.update();assert(navigation.mode()==UIMode::PET_FACE);
 mqttClient.count=0;buttonManager.b=true;navigation.update();
 assert(navigation.mode()==UIMode::END_OF_LIST);
 tick=6002;navigation.update();assert(navigation.mode()==UIMode::PET_FACE);
 assert(powerManager.activity==11);
}
'''
    (p/'test.cpp').write_text(source)
    subprocess.run(['c++','-std=c++17','-I',d,str(p/'test.cpp'),'-o',str(p/'test')],check=True)
    subprocess.run([str(p/'test')],check=True)
print('Production navigation: face wrap, quota end/empty return, activity dispatch passed')
