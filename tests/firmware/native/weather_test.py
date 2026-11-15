"""Exercise the production weather parser with ArduinoJson on the host."""
import pathlib
import subprocess
import tempfile

root = pathlib.Path(__file__).resolve().parents[3]
arduino_json = root / 'firmware/.pio/libdeps/esp32cam/ArduinoJson/src'
with tempfile.TemporaryDirectory() as directory:
    path = pathlib.Path(directory)
    (path / 'Arduino.h').write_text('#pragma once\n#include <cstdint>\n#include <cstddef>\n#include <cstring>\n')
    (path / 'test.cpp').write_text(r'''
#include "weather.h"
#include <cassert>
#include <cstring>
#include <string>
static bool parse(const std::string& json, WeatherSnapshot& out) {
    return parseWeatherPayload((const uint8_t*)json.data(), json.size(), "bmo-dev-01", out);
}
int main() {
    WeatherSnapshot weather{};
    const std::string ok = R"({"schemaVersion":1,"deviceId":"bmo-dev-01","revision":9007199254740991,"locationRevision":3,"status":"ok","condition":"rain","temperatureC":-12.5,"isDay":false,"dataAt":"2026-11-15T00:00:00.000Z","validUntil":"2026-11-15T01:00:00.000Z"})";
    assert(parse(ok, weather));
    assert(weather.valid && weather.revision == 9007199254740991ULL);
    assert(weather.temperatureC == -12.5f && weather.condition == WeatherCondition::RAIN);
    assert(parse(std::string(ok).replace(ok.find("-12.5"), 5, "70"), weather));
    assert(weather.temperatureC == 70.0f);
    assert(parse(ok, weather));
    WeatherSnapshot before = weather;
    auto rejects = [&](std::string json) { assert(!parse(json, weather)); assert(memcmp(&before, &weather, sizeof(weather)) == 0); };
    rejects(ok + " "+std::string(280, ' '));
    rejects(std::string(ok).replace(ok.find("9007199254740991"), 16, "9007199254740992"));
    rejects(std::string(ok).replace(ok.find("bmo-dev-01"), 10, "other-dev-"));
    rejects(std::string(ok).replace(ok.find("\"rain\""), 6, "\"hail\""));
    rejects(std::string(ok).replace(ok.find("-12.5"), 5, "71.0"));
    rejects(std::string(ok).replace(ok.find("2026-11-15T01:00:00.000Z"), 24, "2026-11-15T00:59:59.000Z"));
    rejects(std::string(ok).replace(ok.find("2026-11-15T01:00:00.000Z"), 24, "2026-11-15T01:00:00.001Z"));
    rejects(std::string(ok).replace(ok.find("2026-11-15T00:00:00.000Z"), 24, "2026-02-29T00:00:00.000Z"));
    rejects(std::string(ok).replace(ok.find("\"status\":\"ok\""), 13, "\"status\":\"bad\""));
    rejects(std::string(ok).insert(ok.size()-1, ",\"extra\":1"));
    const std::string unavailable = R"({"schemaVersion":1,"deviceId":"bmo-dev-01","revision":9007199254740991,"locationRevision":4,"status":"unavailable","condition":"unknown","temperatureC":null,"isDay":null,"dataAt":null,"validUntil":null})";
    assert(parse(unavailable, weather));
    assert(!weather.hasObservation && weather.condition == WeatherCondition::UNKNOWN);
    assert(!parse(std::string(unavailable).replace(unavailable.find("\"unknown\""), 9, "\"rain\""), weather));
    assert(!weatherIsFresh(weather, 1700000000));
    WeatherSnapshot cached = weather;
    assert(applyWeatherSnapshot(weather, cached)); // duplicate retained counts as a response
    WeatherSnapshot old = weather; old.revision--;
    assert(!applyWeatherSnapshot(old, cached));
    WeatherSnapshot wrongLocation = weather; wrongLocation.revision++; wrongLocation.locationRevision--;
    assert(!applyWeatherSnapshot(wrongLocation, cached));
    WeatherSnapshot newer = weather; newer.revision++; newer.locationRevision++;
    assert(applyWeatherSnapshot(newer, cached));
    assert(cached.revision == newer.revision && cached.locationRevision == newer.locationRevision);
}
''')
    subprocess.run(['c++', '-std=c++17', '-I', str(path), '-I', str(root/'firmware/include'), '-I', str(arduino_json), str(path/'test.cpp'), str(root/'firmware/src/weather.cpp'), '-o', str(path/'test')], check=True)
    subprocess.run([str(path/'test')], check=True)
print('Weather parser behavior passed')
