#pragma once

#include <Arduino.h>
#include <stdint.h>
#include <time.h>

constexpr size_t MAX_WEATHER_PAYLOAD_BYTES = 512;

enum class WeatherCondition : uint8_t {
    CLEAR, PARTLY_CLOUDY, CLOUDY, RAIN, STORM, FOG, SNOW, UNKNOWN
};

struct WeatherSnapshot {
    uint64_t revision;
    uint64_t locationRevision;
    WeatherCondition condition;
    float temperatureC;
    bool isDay;
    bool hasObservation;
    bool valid;
    int64_t dataAt;
    int64_t validUntil;
};

bool parseWeatherPayload(const uint8_t* payload, size_t length,
                         const char* expectedDeviceId, WeatherSnapshot& out);
bool weatherIsFresh(const WeatherSnapshot& weather, time_t nowUtc);
bool applyWeatherSnapshot(const WeatherSnapshot& incoming, WeatherSnapshot& cache);
