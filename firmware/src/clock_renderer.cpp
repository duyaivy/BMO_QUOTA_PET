#include "clock_renderer.h"
#include "display.h"
#include <cmath>
#include <cstring>

BMOClockRenderer clockRenderer;

BMOClockRenderer::BMOClockRenderer() : _last{}, _rendered(false) {}

void BMOClockRenderer::format(time_t nowUtc, const WeatherSnapshot* weather, ClockText& out) const {
    memset(&out, 0, sizeof(out));
    strcpy(out.time, "--:--");
    strcpy(out.temperature, "--");
    out.condition = WeatherCondition::UNKNOWN;
    if (nowUtc < 1700000000) return;
    time_t local = nowUtc + 7 * 3600;
    tm calendar{};
    gmtime_r(&local, &calendar);
    snprintf(out.time, sizeof(out.time), "%02d:%02d", calendar.tm_hour, calendar.tm_min);
    const int weekday = calendar.tm_wday == 0 ? 8 : calendar.tm_wday + 1;
    if (weekday == 8) snprintf(out.date, sizeof(out.date), "CN %02d/%02d", calendar.tm_mday, calendar.tm_mon + 1);
    else snprintf(out.date, sizeof(out.date), "T%d %02d/%02d", weekday, calendar.tm_mday, calendar.tm_mon + 1);
    if (weather && weatherIsFresh(*weather, nowUtc)) {
        out.condition = weather->condition;
        out.isDay = weather->isDay;
        snprintf(out.temperature, sizeof(out.temperature), "%d", int(lroundf(weather->temperatureC)));
    }
}

void BMOClockRenderer::renderIfChanged(time_t nowUtc, const WeatherSnapshot* weather, bool force) {
    ClockText next{};
    format(nowUtc, weather, next);
    if (!force && _rendered && memcmp(&next, &_last, sizeof(next)) == 0) return;
    _last = next;
    _rendered = true;
    auto& oled = display.getDriver();
    oled.clearDisplay();
    oled.setTextColor(SSD1306_WHITE);
    oled.setTextSize(3);
    oled.setCursor(2, 9);
    oled.print(next.time);

    // Compact static monochrome icon in the 16x16 top-right viewport.
    constexpr int x = 111, y = 20;
    switch (next.condition) {
        case WeatherCondition::CLEAR:
            oled.drawCircle(x, y, 5, SSD1306_WHITE);
            oled.drawFastHLine(x-8, y, 2, SSD1306_WHITE);
            oled.drawFastHLine(x+7, y, 2, SSD1306_WHITE);
            oled.drawLine(x, y-8, x, y-7, SSD1306_WHITE);
            oled.drawLine(x, y+7, x, y+8, SSD1306_WHITE);
            break;
        case WeatherCondition::PARTLY_CLOUDY:
            oled.drawCircle(x-4, y-4, 4, SSD1306_WHITE);
            [[fallthrough]];
        case WeatherCondition::CLOUDY:
        case WeatherCondition::RAIN:
        case WeatherCondition::STORM:
        case WeatherCondition::SNOW:
        case WeatherCondition::FOG:
            oled.drawRoundRect(x-8, y-2, 16, 8, 3, SSD1306_WHITE);
            if (next.condition == WeatherCondition::RAIN || next.condition == WeatherCondition::STORM)
                for (int i = -5; i <= 5; i += 5) oled.drawLine(x+i, y+8, x+i-2, y+11, SSD1306_WHITE);
            else if (next.condition == WeatherCondition::SNOW)
                for (int i = -5; i <= 5; i += 5) oled.drawPixel(x+i, y+10, SSD1306_WHITE);
            else if (next.condition == WeatherCondition::FOG)
                oled.drawFastHLine(x-7, y+10, 14, SSD1306_WHITE);
            break;
        case WeatherCondition::UNKNOWN:
            oled.setTextSize(2);
            oled.setCursor(x-5, y-7);
            oled.print("?");
            break;
    }
    oled.drawFastHLine(0, 44, 128, SSD1306_WHITE);
    oled.setTextSize(1);
    oled.setCursor(1, 53);
    oled.print(next.date);
    oled.setCursor(88, 53);
    oled.print(next.temperature);
    if (strcmp(next.temperature, "--") != 0) {
        const int unitX = 88 + int(strlen(next.temperature)) * 6 + 2;
        oled.drawCircle(unitX, 54, 2, SSD1306_WHITE);
        oled.setCursor(unitX + 4, 53);
        oled.print("C");
    }
    display.update();
}
