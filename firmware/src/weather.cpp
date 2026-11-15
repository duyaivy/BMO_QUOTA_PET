#include "weather.h"
#include <ArduinoJson.h>
#include <cmath>
#include <cstring>

namespace {
constexpr uint64_t MAX_SAFE_INTEGER = 9007199254740991ULL;

bool readRevision(JsonVariantConst value, uint64_t& out) {
    if (!value.is<uint64_t>() && !value.is<int64_t>()) return false;
    if (value.is<int64_t>() && value.as<int64_t>() <= 0) return false;
    uint64_t revision = value.as<uint64_t>();
    if (revision == 0 || revision > MAX_SAFE_INTEGER) return false;
    out = revision;
    return true;
}

bool readUtc(const char* value, int64_t& result, int& milliseconds) {
    if (!value) return false;
    const size_t len = strlen(value);
    if (len != 24 && len != 20) return false;
    if (value[4] != '-' || value[7] != '-' || value[10] != 'T' ||
        value[13] != ':' || value[16] != ':' || value[len - 1] != 'Z') return false;
    if (len == 24 && value[19] != '.') return false;
    for (size_t i = 0; i < len - 1; ++i) {
        if (i == 4 || i == 7 || i == 10 || i == 13 || i == 16 || (len == 24 && i == 19)) continue;
        if (value[i] < '0' || value[i] > '9') return false;
    }
    auto number = [&](size_t offset, size_t width) -> int {
        int n = 0;
        for (size_t i = 0; i < width; ++i) n = n * 10 + value[offset + i] - '0';
        return n;
    };
    int year = number(0, 4), month = number(5, 2), day = number(8, 2);
    int hour = number(11, 2), minute = number(14, 2), second = number(17, 2);
    if (year < 2020 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31 ||
        hour > 23 || minute > 59 || second > 59) return false;
    constexpr int monthDays[] = {31,28,31,30,31,30,31,31,30,31,30,31};
    const bool leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    if (day > monthDays[month - 1] + (month == 2 && leap ? 1 : 0)) return false;
    // Civil date to Unix days, with all intermediates in signed 64-bit range.
    int y = year - (month <= 2);
    int era = y / 400;
    unsigned yearOfEra = unsigned(y - era * 400);
    unsigned adjustedMonth = unsigned(month + (month > 2 ? -3 : 9));
    unsigned dayOfYear = (153 * adjustedMonth + 2) / 5 + unsigned(day - 1);
    unsigned yearOfEraDay = yearOfEra * 365 + yearOfEra / 4 - yearOfEra / 100 + dayOfYear;
    int64_t days = int64_t(era) * 146097 + yearOfEraDay - 719468;
    result = days * 86400 + hour * 3600 + minute * 60 + second;
    milliseconds = len == 24 ? number(20, 3) : 0;
    return true;
}

bool readCondition(const char* value, WeatherCondition& out) {
    if (!value) return false;
    constexpr const char* names[] = {"clear", "partly_cloudy", "cloudy", "rain", "storm", "fog", "snow", "unknown"};
    for (size_t i = 0; i < sizeof(names) / sizeof(names[0]); ++i) {
        if (strcmp(value, names[i]) == 0) {
            out = static_cast<WeatherCondition>(i);
            return true;
        }
    }
    return false;
}
}

bool parseWeatherPayload(const uint8_t* payload, size_t length,
                         const char* expectedDeviceId, WeatherSnapshot& out) {
    if (!payload || !expectedDeviceId || length == 0 || length > MAX_WEATHER_PAYLOAD_BYTES) return false;
    JsonDocument doc;
    if (deserializeJson(doc, payload, length) || !doc.is<JsonObject>()) return false;
    JsonObjectConst object = doc.as<JsonObjectConst>();
    constexpr const char* keys[] = {"schemaVersion", "deviceId", "revision", "locationRevision", "status",
                                    "condition", "temperatureC", "isDay", "dataAt", "validUntil"};
    if (object.size() != 10) return false;
    for (JsonPairConst pair : object) {
        bool known = false;
        for (const char* key : keys) if (strcmp(pair.key().c_str(), key) == 0) known = true;
        if (!known) return false;
    }
    if (!object["schemaVersion"].is<int>() || object["schemaVersion"].as<int>() != 1 ||
        !object["deviceId"].is<const char*>() ||
        strcmp(object["deviceId"].as<const char*>(), expectedDeviceId) != 0) return false;
    WeatherSnapshot next{};
    if (!readRevision(object["revision"], next.revision) ||
        !readRevision(object["locationRevision"], next.locationRevision) ||
        !readCondition(object["condition"].as<const char*>(), next.condition)) return false;
    const char* status = object["status"].as<const char*>();
    if (!status) return false;
    if (strcmp(status, "ok") == 0) {
        JsonVariantConst temperature = object["temperatureC"];
        if ((!temperature.is<double>() && !temperature.is<float>() && !temperature.is<int>() &&
             !temperature.is<int64_t>()) || !object["isDay"].is<bool>() ||
            !object["dataAt"].is<const char*>() || !object["validUntil"].is<const char*>()) return false;
        double temp = temperature.as<double>();
        if (!std::isfinite(temp) || temp < -100 || temp > 70) return false;
        next.temperatureC = static_cast<float>(temp);
        next.isDay = object["isDay"].as<bool>();
        int dataMs = 0, untilMs = 0;
        if (!readUtc(object["dataAt"].as<const char*>(), next.dataAt, dataMs) ||
            !readUtc(object["validUntil"].as<const char*>(), next.validUntil, untilMs) ||
            next.validUntil - next.dataAt != 3600 || dataMs != untilMs) return false;
        next.hasObservation = true;
    } else if (strcmp(status, "unavailable") == 0) {
        if (next.condition != WeatherCondition::UNKNOWN || !object["temperatureC"].isNull() ||
            !object["isDay"].isNull() || !object["dataAt"].isNull() ||
            !object["validUntil"].isNull()) return false;
    } else return false;
    next.valid = true;
    out = next;
    return true;
}

bool weatherIsFresh(const WeatherSnapshot& weather, time_t nowUtc) {
    return weather.valid && weather.hasObservation && nowUtc >= 1700000000 &&
           weather.dataAt <= nowUtc + 300 && nowUtc < weather.validUntil;
}

bool applyWeatherSnapshot(const WeatherSnapshot& incoming, WeatherSnapshot& cache) {
    if (!incoming.valid) return false;
    if (!cache.valid) {
        cache = incoming;
        return true;
    }
    if (incoming.revision < cache.revision || incoming.locationRevision < cache.locationRevision) return false;
    if (incoming.revision == cache.revision)
        return incoming.locationRevision == cache.locationRevision;
    cache = incoming;
    return true;
}
