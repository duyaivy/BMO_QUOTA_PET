#include "calendar_renderer.h"
#include "display.h"
#include "oled_icons.h"
#include <cstdio>
#include <cstring>

BMOCalendarRenderer calendarRenderer;

namespace {

// Crisp 4x5 pixel digits so even 6-row months fit cleanly with row breathing room.
static const uint8_t kDigits4x5[10][5] PROGMEM = {
    {0b0110, 0b1001, 0b1001, 0b1001, 0b0110}, // 0
    {0b0010, 0b0110, 0b0010, 0b0010, 0b0111}, // 1
    {0b1110, 0b0001, 0b0110, 0b1000, 0b1111}, // 2
    {0b1110, 0b0001, 0b0110, 0b0001, 0b1110}, // 3
    {0b1001, 0b1001, 0b1111, 0b0001, 0b0001}, // 4
    {0b1111, 0b1000, 0b1110, 0b0001, 0b1110}, // 5
    {0b0111, 0b1000, 0b1110, 0b1001, 0b0110}, // 6
    {0b1111, 0b0001, 0b0010, 0b0100, 0b0100}, // 7
    {0b0110, 0b1001, 0b0110, 0b1001, 0b0110}, // 8
    {0b0110, 0b1001, 0b0111, 0b0001, 0b1110}, // 9
};

template <typename OLED>
void drawDigit4x5(OLED& oled, int x, int y, uint8_t digit, uint16_t color) {
    for (int row = 0; row < 5; ++row) {
        uint8_t bits = pgm_read_byte(&kDigits4x5[digit][row]);
        for (int col = 0; col < 4; ++col) {
            if (bits & (1u << (3 - col))) {
                oled.drawPixel(x + col, y + row, color);
            }
        }
    }
}

template <typename OLED>
void drawCalendarDay(OLED& oled, int cellX, int cellY, uint8_t day, bool isToday) {
    const bool twoDigits = day >= 10;
    const int textX = twoDigits ? (cellX + 4) : (cellX + 7);
    if (isToday) {
        const int pillX = twoDigits ? (cellX + 2) : (cellX + 4);
        const int pillW = twoDigits ? 13 : 10;
        oled.fillRoundRect(pillX, cellY - 1, pillW, 7, 1, SSD1306_WHITE);
    }

    const uint16_t color = isToday ? SSD1306_BLACK : SSD1306_WHITE;
    if (twoDigits) {
        drawDigit4x5(oled, textX, cellY, day / 10, color);
        drawDigit4x5(oled, textX + 5, cellY, day % 10, color);
    } else {
        drawDigit4x5(oled, textX, cellY, day, color);
    }
}

} // namespace

uint8_t calendarDaysInMonth(int year, int month) {
    static constexpr uint8_t kDays[12] = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
    if (month < 1 || month > 12) return 30;
    if (month == 2) {
        bool leap = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
        return leap ? 29 : 28;
    }
    return kDays[month - 1];
}

BMOCalendarRenderer::BMOCalendarRenderer() : _last{}, _rendered(false) {}

void BMOCalendarRenderer::format(time_t nowUtc, CalendarState& out, bool wifiConnected) const {
    memset(&out, 0, sizeof(out));
    out.wifiConnected = wifiConnected;

    if (nowUtc < 1700000000) return;

    time_t local = nowUtc + 7 * 3600;
    tm cal{};
    gmtime_r(&local, &cal);

    out.year = static_cast<int16_t>(cal.tm_year + 1900);
    out.month = static_cast<uint8_t>(cal.tm_mon + 1);
    out.today = static_cast<uint8_t>(cal.tm_mday);
    out.daysInMonth = calendarDaysInMonth(out.year, out.month);

    const int todayCol = (cal.tm_wday + 6) % 7; // Mon=0..Sun=6
    const int offset = todayCol - (static_cast<int>(out.today) - 1);
    out.firstCol = static_cast<uint8_t>(((offset % 7) + 7) % 7);
    out.synced = true;
}

void BMOCalendarRenderer::renderIfChanged(time_t nowUtc, bool force, bool wifiConnected) {
    CalendarState next{};
    format(nowUtc, next, wifiConnected);
    if (!force && _rendered && memcmp(&next, &_last, sizeof(next)) == 0) return;
    _last = next;
    _rendered = true;

    auto& oled = display.getDriver();
    oled.clearDisplay();
    oled.setTextSize(1);
    oled.setTextColor(SSD1306_WHITE);

    if (!next.synced) {
        oled.setCursor(2, 1);
        oled.print("CALENDAR");
        drawWifiStatusIcon(oled, 114, 1, next.wifiConnected);
        oled.drawFastHLine(0, 10, 128, SSD1306_WHITE);

        const char* line1 = next.wifiConnected ? "Syncing date..." : "Waiting for Wi-Fi";
        const char* line2 = "UTC+7 via NTP";
        int x1 = (128 - static_cast<int>(strlen(line1)) * 6) / 2;
        int x2 = (128 - static_cast<int>(strlen(line2)) * 6) / 2;
        oled.setCursor(x1 < 0 ? 0 : x1, 28);
        oled.print(line1);
        oled.setCursor(x2 < 0 ? 0 : x2, 42);
        oled.print(line2);
        display.update();
        return;
    }

    char header[18];
    snprintf(header, sizeof(header), "THANG %02d/%04d", next.month, next.year);
    oled.setCursor(2, 1);
    oled.print(header);
    drawWifiStatusIcon(oled, 114, 1, next.wifiConnected);
    oled.drawFastHLine(0, 10, 128, SSD1306_WHITE);

    static constexpr const char* kWeekdays[7] = {"T2", "T3", "T4", "T5", "T6", "T7", "CN"};
    for (int col = 0; col < 7; ++col) {
        oled.setCursor(1 + col * 18 + 3, 12);
        oled.print(kWeekdays[col]);
    }
    oled.drawFastHLine(0, 20, 128, SSD1306_WHITE);

    const int totalCells = static_cast<int>(next.firstCol) + static_cast<int>(next.daysInMonth);
    const int rowCount = (totalCells + 6) / 7;
    const int rowPitch = rowCount >= 6 ? 7 : 8;
    const int gridStartY = rowCount >= 6 ? 22 : 23;

    for (uint8_t day = 1; day <= next.daysInMonth; ++day) {
        const int idx = static_cast<int>(next.firstCol) + static_cast<int>(day) - 1;
        const int row = idx / 7;
        const int col = idx % 7;
        drawCalendarDay(oled, 1 + col * 18, gridStartY + row * rowPitch, day, day == next.today);
    }

    display.update();
}
