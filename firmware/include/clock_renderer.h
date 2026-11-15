#pragma once

#include <Arduino.h>
#include <time.h>
#include "weather.h"

struct ClockText {
    char time[6];
    char date[12];
    char temperature[8];
    WeatherCondition condition;
    bool isDay;
};

class BMOClockRenderer {
public:
    BMOClockRenderer();
    void format(time_t nowUtc, const WeatherSnapshot* weather, ClockText& out) const;
    void renderIfChanged(time_t nowUtc, const WeatherSnapshot* weather, bool force);
private:
    ClockText _last;
    bool _rendered;
};

extern BMOClockRenderer clockRenderer;
