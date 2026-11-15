"""Compile and exercise the real wake session with a fake monotonic clock."""
import pathlib
import subprocess
import tempfile

root = pathlib.Path(__file__).resolve().parents[3]
with tempfile.TemporaryDirectory() as directory:
    path = pathlib.Path(directory)
    (path / 'Arduino.h').write_text('#pragma once\n#include <cstdint>\n')
    (path / 'test.cpp').write_text(r'''
#include "wake_session.h"
#include <cassert>
struct Fake : BMOWakeTransport {
    bool wifi=false, time=false, config=false, snapshot=false, weather=false;
    int starts=0, syncs=0, mqtts=0, stops=0;
    void startWakeConnection() override { starts++; }
    bool isWifiConnected() const override { return wifi; }
    void requestTimeSync() override { syncs++; }
    bool hasTrustedTime() const override { return time; }
    void startMqttConnection() override { mqtts++; }
    bool hasConfig() const override { return config; }
    bool hasMatchingSnapshot() const override { return snapshot; }
    bool hasWeatherResponse() const override { return weather; }
    void stopForSleep() override { stops++; }
};
int main() {
    assert(!wakeTimeReady(true,false,true,2999));
    assert(wakeTimeReady(true,false,true,3000));
    assert(wakeTimeReady(false,true,true,100));
    assert(!wakeTimeReady(false,false,true,19999));
    Fake transport;
    BMOWakeSession session(transport);
    session.begin(0xfffffff0u);
    assert(transport.starts==1 && !session.isFinished());
    session.update(100);
    assert(transport.syncs==0 && transport.mqtts==0);
    transport.wifi=true;
    session.update(101);
    assert(transport.syncs==1);
    transport.time=true;
    session.update(102);
    assert(transport.mqtts==1);
    transport.config=true;
    transport.snapshot=true;
    transport.weather=true;
    session.update(103);
    assert(session.isFinished() && transport.stops==1);
    session.update(30000);
    assert(transport.starts==1 && transport.stops==1);
    transport.wifi=false;
    transport.time=false;
    transport.config=false;
    transport.snapshot=false;
    transport.weather=false;
    session.begin(40000);
    assert(transport.starts==2);
    session.update(59999);
    assert(!session.isFinished());
    session.update(60000);
    assert(session.isFinished() && transport.stops==2);
    session.begin(0xfffffff0u);
    session.update(0x00004e10u);
    assert(session.isFinished() && transport.stops==3);
    transport.wifi=true;transport.time=true;
    session.begin(100000);
    session.update(100001); // DNS/TLS worker may remain stalled after request.
    assert(transport.mqtts==2 && !session.isFinished());
    session.update(120000);
    assert(session.isFinished() && transport.stops==4);
}
''')
    subprocess.run(['c++', '-std=c++17', '-I', str(path), '-I', str(root/'firmware/include'), str(path/'test.cpp'), str(root/'firmware/src/wake_session.cpp'), '-o', str(path/'test')], check=True)
    subprocess.run([str(path/'test')], check=True)
print('Wake session state/deadline behavior passed')
