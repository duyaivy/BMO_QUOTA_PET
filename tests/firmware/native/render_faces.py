"""Exercise production face rendering with real Adafruit GFX, without OLED I/O.

Requires the GFX dependency installed by a PlatformIO firmware build.
Optional --preview PATH exports a standalone animated HTML contact sheet.
"""
import argparse
import json
import pathlib
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[3]
GFX = ROOT / "firmware/.pio/libdeps/esp32cam/Adafruit GFX Library"


def run(preview=None):
    if not (GFX / "Adafruit_GFX.cpp").exists():
        raise SystemExit("Build firmware with PlatformIO first to install Adafruit GFX.")
    with tempfile.TemporaryDirectory() as directory:
        p = pathlib.Path(directory)
        (p / "Arduino.h").write_text('''#pragma once
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
inline float radians(float degrees) { return degrees * 0.01745329252f; }
extern uint32_t tick;
inline unsigned long millis() { return tick; }
inline long random(long) { return 0; } // Deterministic idle glances for host tests.
inline long random(long a, long) { return a; }
''')
        (p / "Print.h").write_text('''#pragma once
#include "Arduino.h"
class Print { public:
virtual size_t write(uint8_t) = 0;
size_t write(const char* s) { size_t n=0; while (*s) n+=write(uint8_t(*s++)); return n; }
size_t print(const char* s) { return write(s); }
};
''')
        for name in ("Adafruit_I2CDevice.h", "Adafruit_SPIDevice.h"):
            (p / name).write_text("#pragma once\n")
        (p / "Adafruit_SSD1306.h").write_text('''#pragma once
#include "Adafruit_GFX.h"
#define SSD1306_WHITE 1
#define SSD1306_BLACK 0
class Adafruit_SSD1306 : public GFXcanvas1 {
uint8_t oledBuffer[1024] = {};
public: Adafruit_SSD1306() : GFXcanvas1(128,64) { setTextWrap(false); }
void clearDisplay() { fillScreen(0); }
// SSD1306 transport layout is column-addressed inside eight vertical pages.
uint8_t* getBuffer() {
    memset(oledBuffer, 0, sizeof(oledBuffer));
    for(int y=0;y<64;y++) for(int x=0;x<128;x++)
        if(getPixel(x,y)) oledBuffer[(y/8)*128+x] |= uint8_t(1u<<(y%8));
    return oledBuffer;
}
};
''')
        (p / "test.cpp").write_text('''
#include "faces.h"
#include <cassert>
#include <set>
#include <string>
uint32_t tick = 0;
std::string pixels(Adafruit_SSD1306& oled) {
    std::string s;
    for(int y=0;y<64;y++) for(int x=0;x<128;x++) s += oled.getPixel(x,y)?'1':'0';
    return s;
}
int main() {
    Adafruit_SSD1306 oled;
    // After settling geometry, face 6 must move before its rare blink.
    BMOFaceRenderer surprise;
    surprise.setFace(FACE_SURPRISED);
    std::set<std::string> motion;
    for(int i=0;i<100;i++) {
        tick=uint32_t(i*33); surprise.render(oled);
        if(i>40) motion.insert(pixels(oled));
    }
    assert(motion.size()>8 && "Surprised must visibly animate, not stay static");
    BMOFaceRenderer faces;
    for(int i=0;i<FACE_COUNT;i++) {
        assert(int(faces.getCurrentFace())==i);
        faces.nextFace();
    }
    assert(faces.getCurrentFace()==FACE_HAPPY);
    // Measure the left eye's horizontal extent at its solid middle row.
    // Both faces must look to both sides even with deterministic random().
    for(auto face : {FACE_NEUTRAL_BLINK, FACE_WORRIED}) {
        tick=10000; faces.setFace(face);
        int minLeft=128, maxLeft=0;
        for(int i=0;i<180;i++) {
            tick=10000+uint32_t(i*33); faces.render(oled);
            if(i<30) continue; // Ignore geometry settling after face selection.
            int left=0;
            while(left<64 && !oled.getPixel(left,32)) ++left;
            if(left<64) { minLeft=min(minLeft,left); maxLeft=max(maxLeft,left); }
        }
        assert(maxLeft-minLeft>=12 && "Eyes 2 and 4 must sweep left and right");
    }
    // The face-only celebration is an additional selectable scene, not a
    // replacement for the full-body number 7 celebration at index 8.
    faces.setFace(BMOFaceType(10));
    assert(int(faces.getCurrentFace())==10 && "Face-only SIUUU must be selectable");
    // Stars must move in the unused side space without shrinking the MU mark.
    tick=10000; faces.setFace(FACE_MAN_UNITED);
    std::set<std::string> sideMotion;
    int logoMinY=64, logoMaxY=0;
    for(int i=0;i<60;i++) {
        tick=10000+i*60; faces.render(oled);
        std::string sides; int leftCount=0,rightCount=0;
        for(int y=0;y<64;y++) for(int x=0;x<128;x++) {
            bool on=oled.getPixel(x,y);
            if(x<39 || x>88) {sides+=on?'1':'0';if(on) {if(x<39)leftCount++;else rightCount++;}}
            else if(on) {logoMinY=min(logoMinY,y);logoMaxY=max(logoMaxY,y);}
        }
        assert(leftCount>0 && rightCount>0 && "MU needs visible stars on both sides");
        sideMotion.insert(sides);
    }
    assert(sideMotion.size()>8 && logoMaxY-logoMinY>=57);
    for(int f : {11,12,13}) {
        faces.setFace(BMOFaceType(f));
        assert(int(faces.getCurrentFace())==f && "New faces must be selectable");
    }
    // Enlarged scenes must not inherit off-center geometry from the previous
    // face (which can crop the first sleeping/neutral frame).
    for(int target=0;target<FACE_COUNT;target++) {
        tick=10000; faces.setFace(BMOFaceType(target));
        for(int i=0;i<30;i++) faces.render(oled);
        faces.setFace(BMOFaceType(target)); faces.render(oled);
        auto entry=pixels(oled);
        for(int previous=0;previous<FACE_COUNT;previous++) {
            faces.setFace(BMOFaceType(previous));
            for(int i=0;i<30;i++) faces.render(oled);
            faces.setFace(BMOFaceType(target)); faces.render(oled);
            assert(pixels(oled)==entry && "Face entry must not inherit previous geometry");
        }
    }
    // Restart and timer rollover must preserve the same visible choreography.
    for(int f : {0, 2, 5, 6, 7, 8, 9, 10, 11, 12, 13}) {
        std::string reference[6];
        const uint32_t offsets[] = {0, 60, 960, 1500, 2300, 3540};
        tick=10000; faces.setFace(BMOFaceType(f));
        for(int i=0;i<6;i++) {
            tick=10000+offsets[i]; faces.render(oled); reference[i]=pixels(oled);
        }
        for(uint32_t start : {20000u, 0xfffffc00u}) {
            tick=start; faces.setFace(BMOFaceType(f));
            for(int i=0;i<6;i++) {
                tick=start+offsets[i]; faces.render(oled);
                assert(pixels(oled)==reference[i] && "Scene timing must restart and survive wrap");
            }
        }
        tick=10000; faces.setFace(BMOFaceType(f));
        tick=12400; faces.render(oled); auto beforeSleep=pixels(oled);
        tick=372400; faces.render(oled);
        assert(pixels(oled)==beforeSleep && "Long suspensions must resume the timeline directly");
    }
    // Compare the eye area, excluding mouths, sparkles, and navigation dots.
    tick=10000; faces.setFace(FACE_NEUTRAL_BLINK);
    for(int i=0;i<30;i++) faces.render(oled);
    auto neutral=pixels(oled);
    faces.setFace(FACE_WINK); faces.render(oled);
    auto wink=pixels(oled); int eyeDifference=0;
    for(int y=16;y<42;y++) for(int x=25;x<102;x++)
        eyeDifference += neutral[y*128+x]!=wink[y*128+x];
    assert(eyeDifference>400 && "Face 3 needs a distinct eye silhouette");
    // Export actual frames for visual inspection and assert each new scene moves.
    for(int f=0;f<FACE_COUNT;f++) {
        tick=10000;
        faces.setFace(BMOFaceType(f));
        motion.clear();
        int minX=128,minY=64,maxX=0,maxY=0;
        printf("%s\\n", faces.getFaceName(BMOFaceType(f)));
        for(int i=0;i<60;i++) {
            tick=10000+uint32_t(i*60); faces.render(oled);
            auto s=pixels(oled); motion.insert(s);
            for(int y=0;y<64;y++) for(int x=0;x<128;x++) if(oled.getPixel(x,y)) {
                minX=min(minX,x);maxX=max(maxX,x);minY=min(minY,y);maxY=max(maxY,y);
                assert(x>0 && x<127 && y>0 && y<63 && "Keep a one-pixel motion safety margin");
            }
            printf("%s\\n",s.c_str());
        }
        if(f>=6 && f!=9) assert(motion.size()>8 && "New scenes must move");
        if(f==9) assert(motion.size()>=3 && "MU retains its gentle vertical float");
        if(maxX-minX<119 && maxY-minY<57)
            fprintf(stderr,"Scene %d spans only %dx%d pixels\\n",f+1,maxX-minX+1,maxY-minY+1);
        assert((maxX-minX>=119 || maxY-minY>=57) && "Each scene must maximize the OLED area");
    }
}
''')
        command = ["c++", "-std=c++17", "-DARDUINO=100", "-I", str(p),
                   "-I", str(GFX), "-I", str(ROOT / "firmware/include"),
                   str(p / "test.cpp"), str(ROOT / "firmware/src/faces.cpp")]
        scenes = ROOT / "firmware/src/face_scenes.cpp"
        if scenes.exists():
            command.append(str(scenes))
        command.append(str(ROOT / "firmware/src/face_layout.cpp"))
        command += [str(GFX / "Adafruit_GFX.cpp"), "-o", str(p / "test")]
        subprocess.run(command, check=True)
        result = subprocess.run([str(p / "test")], capture_output=True, text=True)
        if result.returncode:
            raise AssertionError(result.stderr)
        lines = result.stdout.splitlines()
        data = [{"name": lines[i], "frames": lines[i+1:i+61]}
                for i in range(0, len(lines), 61)]
        if preview:
            path = pathlib.Path(preview)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('''<!doctype html><meta charset="utf-8">
<title>BMO · OLED motion study</title>
<style>body{background:#101918;color:#e4f5ed;font:16px system-ui;margin:40px}
h1{font-size:28px}p{color:#9cb6ac}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px}
article{padding:20px;background:#192725;border:1px solid #31443e;border-radius:16px}
canvas{width:100%;image-rendering:pixelated;background:#000;border-radius:8px}
button{padding:10px 22px;margin-bottom:24px;cursor:pointer}h2{font-size:15px;font-weight:500}</style>
<h1>BMO / Motion study</h1><p>Actual firmware pixels · 128 × 64 · host preview, not hardware verification.</p>
<button id="pause">Pause</button><main></main><script>
const scenes=''' + json.dumps(data) + ''';
let playing=true, frame=0;
document.querySelector('#pause').onclick=e=>{playing=!playing;e.target.textContent=playing?'Pause':'Play'};
const contexts=scenes.map((s,i)=>{const a=document.createElement('article');
const h=document.createElement('h2');h.textContent=String(i+1).padStart(2,'0')+' / '+s.name;
const c=document.createElement('canvas');c.width=128;c.height=64;a.append(c,h);document.querySelector('main').append(a);return c.getContext('2d')});
function draw(){contexts.forEach((c,i)=>{const im=c.createImageData(128,64);const bits=scenes[i].frames[frame];
for(let p=0;p<bits.length;p++){let n=p*4,on=bits[p]==='1';im.data[n]=on?207:4;im.data[n+1]=on?255:9;im.data[n+2]=on?232:8;im.data[n+3]=255}c.putImageData(im,0,0)})}
draw();setInterval(()=>{if(playing){frame=(frame+1)%60;draw()}},60);
</script>''')
        print(f"Production rendering: motion and cycle checks passed ({len(data)} faces)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--preview")
    run(parser.parse_args().preview)
