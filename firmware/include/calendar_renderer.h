#pragma once

#include <Arduino.h>
#include <time.h>

struct CalendarState {
    int16_t year;
    uint8_t month;
    uint8_t today;
    uint8_t firstCol;    // 0 = Monday (T2) .. 6 = Sunday (CN)
    uint8_t daysInMonth; // 28..31
    bool synced;
    bool wifiConnected;
};

uint8_t calendarDaysInMonth(int year, int month);

class BMOCalendarRenderer {
public:
    BMOCalendarRenderer();
    void format(time_t nowUtc, CalendarState& out, bool wifiConnected = true) const;
    void renderIfChanged(time_t nowUtc, bool force, bool wifiConnected = true);

private:
    CalendarState _last;
    bool _rendered;
};

extern BMOCalendarRenderer calendarRenderer;
