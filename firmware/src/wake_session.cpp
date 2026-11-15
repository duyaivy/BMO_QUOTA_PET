#include "wake_session.h"

bool wakeTimeReady(bool trustedBeforeRequest, bool syncArrived,
                   bool currentTimeTrusted, uint32_t elapsedMs) {
    return currentTimeTrusted && (syncArrived || (trustedBeforeRequest && elapsedMs >= 3000u));
}

BMOWakeSession::BMOWakeSession(BMOWakeTransport& transport)
    : _transport(transport), _startMs(0), _state(State::INACTIVE) {}

void BMOWakeSession::begin(uint32_t nowMs) {
    if (!isFinished() && _state != State::INACTIVE) return;
    _startMs = nowMs;
    _state = State::WIFI;
    _transport.startWakeConnection();
}

void BMOWakeSession::update(uint32_t nowMs) {
    if (_state == State::INACTIVE || isFinished()) return;
    if (uint32_t(nowMs - _startMs) >= 20000u) {
        _state = State::DEADLINE;
        _transport.stopForSleep();
        return;
    }
    if (_state == State::WIFI && _transport.isWifiConnected()) {
        _transport.requestTimeSync();
        _state = State::TIME;
    }
    if (_state == State::TIME && _transport.hasTrustedTime()) {
        _transport.startMqttConnection();
        _state = State::MQTT;
    }
    if (_state == State::MQTT && _transport.hasConfig() &&
        _transport.hasMatchingSnapshot() && _transport.hasWeatherResponse()) {
        _state = State::COMPLETE;
        _transport.stopForSleep();
    }
}
