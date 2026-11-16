#pragma once

#include <Arduino.h>
#include <time.h>
#include "weather.h"

struct ClockText {
    char time[6];
    char date[16];
    char temperature[8];
    char reminder[22]; // At most 21 characters at 6 pixels each on a 128px OLED.
    WeatherCondition condition;
    bool isDay;
    bool wifiConnected;
};

class BMOClockRenderer {
public:
    BMOClockRenderer();
    void format(time_t nowUtc, const WeatherSnapshot* weather, ClockText& out, bool wifiConnected = true) const;
    void renderIfChanged(time_t nowUtc, const WeatherSnapshot* weather, bool force, bool wifiConnected = true);
private:
    ClockText _last;
    bool _rendered;
};

extern BMOClockRenderer clockRenderer;
