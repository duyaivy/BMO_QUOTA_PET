#include "clock_renderer.h"
#include "display.h"
#include <cmath>
#include <cstring>

BMOClockRenderer clockRenderer;

namespace {

template <typename OLED>
void drawHeader(OLED& oled, const ClockText& text) {
    oled.drawFastHLine(0, 10, 128, SSD1306_WHITE);

    oled.setTextSize(1);
    oled.setTextColor(SSD1306_WHITE);

    if (text.date[0] != '\0') {
        // Expected format: "T2 16/11/2026" or "CN 16/11/2026"
        const char* space = strchr(text.date, ' ');
        if (space) {
            char weekday[4]{};
            size_t wlen = space - text.date;
            if (wlen >= sizeof(weekday)) wlen = sizeof(weekday) - 1;
            strncpy(weekday, text.date, wlen);

            oled.setCursor(2, 1);
            oled.print(weekday);

            int dotX = 2 + (int)strlen(weekday) * 6 + 2;
            oled.fillRect(dotX, 4, 2, 2, SSD1306_WHITE);

            oled.setCursor(dotX + 5, 1);
            oled.print(space + 1);
        } else {
            oled.setCursor(2, 1);
            oled.print(text.date);
        }
    } else {
        oled.setCursor(2, 1);
        oled.print("BMO CLOCK");
    }

    // 7x7 Crisp Monochrome Wi-Fi Glyph at top-right (x: 118..124, y: 1..7)
    if (text.wifiConnected) {
        oled.drawPixel(121, 7, SSD1306_WHITE);
        oled.drawPixel(120, 5, SSD1306_WHITE);
        oled.drawPixel(121, 4, SSD1306_WHITE);
        oled.drawPixel(122, 5, SSD1306_WHITE);
        oled.drawFastHLine(119, 1, 5, SSD1306_WHITE);
        oled.drawPixel(118, 2, SSD1306_WHITE);
        oled.drawPixel(124, 2, SSD1306_WHITE);
    } else {
        oled.drawPixel(121, 7, SSD1306_WHITE);
        oled.drawLine(118, 1, 124, 7, SSD1306_WHITE);
        oled.drawPixel(118, 2, SSD1306_WHITE);
        oled.drawPixel(124, 6, SSD1306_WHITE);
    }
}

template <typename OLED>
void drawClock(OLED& oled, const ClockText& text) {
    oled.setTextColor(SSD1306_WHITE);
    oled.setTextSize(3);
    oled.setCursor(4, 20);
    oled.print(text.time);
}

template <typename OLED>
void drawWeatherIcon(OLED& oled, int cx, int cy, WeatherCondition condition, bool isDay) {
    switch (condition) {
        case WeatherCondition::CLEAR:
            if (isDay) {
                // Sun: 7px disc + 8 cardinal/diagonal rays
                oled.fillCircle(cx, cy, 3, SSD1306_WHITE);
                oled.drawLine(cx, cy - 7, cx, cy - 5, SSD1306_WHITE);
                oled.drawLine(cx, cy + 5, cx, cy + 7, SSD1306_WHITE);
                oled.drawLine(cx - 7, cy, cx - 5, cy, SSD1306_WHITE);
                oled.drawLine(cx + 5, cy, cx + 7, cy, SSD1306_WHITE);
                oled.drawPixel(cx - 5, cy - 5, SSD1306_WHITE);
                oled.drawPixel(cx + 5, cy - 5, SSD1306_WHITE);
                oled.drawPixel(cx - 5, cy + 5, SSD1306_WHITE);
                oled.drawPixel(cx + 5, cy + 5, SSD1306_WHITE);
            } else {
                // Crescent Moon & tiny sparkling star
                oled.fillCircle(cx - 2, cy, 5, SSD1306_WHITE);
                oled.fillCircle(cx - 4, cy - 2, 4, SSD1306_BLACK);
                oled.drawPixel(cx + 5, cy - 5, SSD1306_WHITE);
                oled.drawPixel(cx + 4, cy - 4, SSD1306_WHITE);
                oled.drawPixel(cx + 6, cy - 4, SSD1306_WHITE);
                oled.drawPixel(cx + 5, cy - 3, SSD1306_WHITE);
                oled.drawPixel(cx + 7, cy + 3, SSD1306_WHITE);
            }
            break;

        case WeatherCondition::PARTLY_CLOUDY:
            if (isDay) {
                // Sun peeking top-left
                oled.drawCircle(cx - 4, cy - 4, 3, SSD1306_WHITE);
                oled.drawPixel(cx - 4, cy - 8, SSD1306_WHITE);
                oled.drawPixel(cx - 8, cy - 4, SSD1306_WHITE);
            } else {
                // Moon peeking top-left
                oled.fillCircle(cx - 4, cy - 4, 4, SSD1306_WHITE);
                oled.fillCircle(cx - 6, cy - 6, 3, SSD1306_BLACK);
            }
            // Foreground cloud
            oled.fillRoundRect(cx - 4, cy, 13, 7, 3, SSD1306_WHITE);
            oled.fillCircle(cx + 2, cy - 1, 4, SSD1306_WHITE);
            break;

        case WeatherCondition::CLOUDY:
            // Fluffy pixel cloud with flat bottom
            oled.fillCircle(cx - 3, cy + 1, 4, SSD1306_WHITE);
            oled.fillCircle(cx + 2, cy - 1, 5, SSD1306_WHITE);
            oled.fillCircle(cx + 6, cy + 2, 3, SSD1306_WHITE);
            oled.fillRect(cx - 5, cy + 2, 14, 5, SSD1306_WHITE);
            break;

        case WeatherCondition::RAIN:
            // Cloud top
            oled.fillRoundRect(cx - 7, cy - 7, 14, 6, 2, SSD1306_WHITE);
            oled.fillCircle(cx - 1, cy - 7, 4, SSD1306_WHITE);
            // 3 diagonal rain streaks
            oled.drawLine(cx - 5, cy + 2, cx - 6, cy + 5, SSD1306_WHITE);
            oled.drawLine(cx - 1, cy + 2, cx - 2, cy + 5, SSD1306_WHITE);
            oled.drawLine(cx + 3, cy + 2, cx + 2, cy + 5, SSD1306_WHITE);
            break;

        case WeatherCondition::STORM:
            // Cloud top
            oled.fillRoundRect(cx - 7, cy - 8, 14, 6, 2, SSD1306_WHITE);
            oled.fillCircle(cx - 1, cy - 8, 4, SSD1306_WHITE);
            // Angular lightning bolt
            oled.drawLine(cx + 1, cy - 1, cx - 2, cy + 3, SSD1306_WHITE);
            oled.drawFastHLine(cx - 2, cy + 3, 4, SSD1306_WHITE);
            oled.drawLine(cx + 1, cy + 3, cx - 3, cy + 8, SSD1306_WHITE);
            break;

        case WeatherCondition::SNOW:
            // Cloud top
            oled.fillRoundRect(cx - 7, cy - 7, 14, 6, 2, SSD1306_WHITE);
            oled.fillCircle(cx - 1, cy - 7, 4, SSD1306_WHITE);
            // Flurry dots
            oled.drawPixel(cx - 5, cy + 2, SSD1306_WHITE);
            oled.drawPixel(cx - 5, cy + 4, SSD1306_WHITE);
            oled.drawPixel(cx - 1, cy + 3, SSD1306_WHITE);
            oled.drawPixel(cx - 1, cy + 5, SSD1306_WHITE);
            oled.drawPixel(cx + 3, cy + 2, SSD1306_WHITE);
            oled.drawPixel(cx + 3, cy + 4, SSD1306_WHITE);
            break;

        case WeatherCondition::FOG:
            // 3 wavy horizontal mist lines
            oled.drawFastHLine(cx - 7, cy - 4, 14, SSD1306_WHITE);
            oled.drawFastHLine(cx - 5, cy, 11, SSD1306_WHITE);
            oled.drawFastHLine(cx - 7, cy + 4, 14, SSD1306_WHITE);
            break;

        case WeatherCondition::UNKNOWN:
        default:
            // Minimal outline cloud with '?'
            oled.drawRoundRect(cx - 7, cy - 5, 14, 8, 3, SSD1306_WHITE);
            oled.setTextSize(1);
            oled.setCursor(cx - 2, cy - 4);
            oled.print("?");
            break;
    }
}

template <typename OLED>
void drawWeatherWidget(OLED& oled, const ClockText& text) {
    constexpr int cx = 111, cy = 23;
    drawWeatherIcon(oled, cx, cy, text.condition, text.isDay);

    oled.setTextSize(1);
    oled.setTextColor(SSD1306_WHITE);

    int textW = (int)strlen(text.temperature) * 6;
    int totalW = textW + 4; // Includes degree circle
    int startX = cx - totalW / 2;

    oled.setCursor(startX, 35);
    oled.print(text.temperature);

    // Degree symbol as 2x2 hollow square
    int degX = startX + textW + 1;
    oled.drawRect(degX, 35, 2, 2, SSD1306_WHITE);
}

template <typename OLED>
void drawFooter(OLED& oled, const char* timeStr) {
    oled.drawFastHLine(0, 52, 128, SSD1306_WHITE);

    const char* greeting = "BMO IS READY!";
    if (strcmp(timeStr, "--:--") != 0 && strlen(timeStr) >= 2) {
        int hour = (timeStr[0] - '0') * 10 + (timeStr[1] - '0');
        if (hour >= 5 && hour < 11) {
            greeting = "GOOD MORNING!";
        } else if (hour >= 11 && hour < 17) {
            greeting = "HAVE A NICE DAY!";
        } else if (hour >= 17 && hour < 21) {
            greeting = "GOOD EVENING!";
        } else {
            greeting = "SWEET DREAMS!";
        }
    }

    oled.setTextSize(1);
    oled.setTextColor(SSD1306_WHITE);

    int w = (int)strlen(greeting) * 6;
    int x = (128 - w) / 2;
    if (x < 0) x = 0;
    oled.setCursor(x, 55);
    oled.print(greeting);
}

} // namespace

BMOClockRenderer::BMOClockRenderer() : _last{}, _rendered(false) {}

void BMOClockRenderer::format(time_t nowUtc, const WeatherSnapshot* weather, ClockText& out, bool wifiConnected) const {
    memset(&out, 0, sizeof(out));
    strcpy(out.time, "--:--");
    strcpy(out.temperature, "--");
    out.condition = WeatherCondition::UNKNOWN;
    out.isDay = true;
    out.wifiConnected = wifiConnected;

    if (nowUtc < 1700000000) return;

    time_t local = nowUtc + 7 * 3600;
    tm calendar{};
    gmtime_r(&local, &calendar);
    snprintf(out.time, sizeof(out.time), "%02d:%02d", calendar.tm_hour, calendar.tm_min);

    const int weekday = calendar.tm_wday == 0 ? 8 : calendar.tm_wday + 1;
    if (weekday == 8) {
        snprintf(out.date, sizeof(out.date), "CN %02d/%02d/%04d", calendar.tm_mday, calendar.tm_mon + 1, calendar.tm_year + 1900);
    } else {
        snprintf(out.date, sizeof(out.date), "T%d %02d/%02d/%04d", weekday, calendar.tm_mday, calendar.tm_mon + 1, calendar.tm_year + 1900);
    }

    if (weather && weatherIsFresh(*weather, nowUtc)) {
        out.condition = weather->condition;
        out.isDay = weather->isDay;
        snprintf(out.temperature, sizeof(out.temperature), "%d", int(lroundf(weather->temperatureC)));
    }
}

void BMOClockRenderer::renderIfChanged(time_t nowUtc, const WeatherSnapshot* weather, bool force, bool wifiConnected) {
    ClockText next{};
    format(nowUtc, weather, next, wifiConnected);
    if (!force && _rendered && memcmp(&next, &_last, sizeof(next)) == 0) return;
    _last = next;
    _rendered = true;

    auto& oled = display.getDriver();
    oled.clearDisplay();

    drawHeader(oled, next);
    drawClock(oled, next);
    drawWeatherWidget(oled, next);
    drawFooter(oled, next.time);

    display.update();
}
