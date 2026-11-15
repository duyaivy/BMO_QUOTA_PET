#pragma once

#include <Arduino.h>

bool wakeTimeReady(bool trustedBeforeRequest, bool syncArrived,
                   bool currentTimeTrusted, uint32_t elapsedMs);

class BMOWakeTransport {
public:
    virtual ~BMOWakeTransport() = default;
    virtual void startWakeConnection() = 0;
    virtual bool isWifiConnected() const = 0;
    virtual void requestTimeSync() = 0;
    virtual bool hasTrustedTime() const = 0;
    virtual void startMqttConnection() = 0;
    virtual bool hasConfig() const = 0;
    virtual bool hasMatchingSnapshot() const = 0;
    virtual bool hasWeatherResponse() const = 0;
    virtual void stopForSleep() = 0;
};

class BMOWakeSession {
public:
    explicit BMOWakeSession(BMOWakeTransport& transport);
    void begin(uint32_t nowMs);
    void update(uint32_t nowMs);
    bool isFinished() const { return _state == State::COMPLETE || _state == State::DEADLINE; }
private:
    enum class State : uint8_t { INACTIVE, WIFI, TIME, MQTT, COMPLETE, DEADLINE };
    BMOWakeTransport& _transport;
    uint32_t _startMs;
    State _state;
};
