#include "faces.h"
#include "man_united_devil.h"

namespace {

// A small integer wave keeps movement smooth without dynamic allocations.
int wave(uint8_t frame, int amplitude, int period = 60) {
    int t = frame % period;
    int triangle = t < period / 2 ? t : period - t;
    return (triangle * amplitude * 4 / period) - amplitude;
}

void sparkle(Adafruit_SSD1306& oled, int x, int y, int r) {
    oled.drawFastHLine(x - r, y, r * 2 + 1, SSD1306_WHITE);
    oled.drawFastVLine(x, y - r, r * 2 + 1, SSD1306_WHITE);
    oled.drawPixel(x - 1, y - 1, SSD1306_WHITE);
    oled.drawPixel(x + 1, y + 1, SSD1306_WHITE);
}

void heart(Adafruit_SSD1306& oled, int x, int y, int r) {
    oled.fillCircle(x - r, y, r, SSD1306_WHITE);
    oled.fillCircle(x + r, y, r, SSD1306_WHITE);
    oled.fillTriangle(x - 2 * r, y, x + 2 * r, y, x, y + 3 * r, SSD1306_WHITE);
}

void stroke(Adafruit_SSD1306& oled, int x1, int y1, int x2, int y2) {
    oled.drawLine(x1, y1, x2, y2, SSD1306_WHITE);
    oled.drawLine(x1 + 1, y1, x2 + 1, y2, SSD1306_WHITE);
}
}

// Home: airy crescent eyes, a small smile and gently rising cheeks.
void BMOFaceRenderer::renderHappy(Adafruit_SSD1306& oled) {
    int bob = wave(_animationFrame, 2);
    int glance = wave(_animationFrame, 3);
    for (int x : {40, 88}) {
        oled.fillCircle(x + glance, 28 + bob, 12, SSD1306_WHITE);
        oled.fillCircle(x + glance, 33 + bob, 11, SSD1306_BLACK);
        oled.fillRect(x - 13 + glance, 34 + bob, 27, 10, SSD1306_BLACK);
    }
    oled.drawLine(55 + glance, 43 + bob, 60 + glance, 47 + bob, SSD1306_WHITE);
    oled.drawFastHLine(60 + glance, 47 + bob, 9, SSD1306_WHITE);
    oled.drawLine(68 + glance, 47 + bob, 73 + glance, 43 + bob, SSD1306_WHITE);
    for (int x : {21, 99}) {
        oled.drawLine(x, 36 + bob, x - 2, 40 + bob, SSD1306_WHITE);
        oled.drawLine(x + 5, 36 + bob, x + 3, 40 + bob, SSD1306_WHITE);
    }
    if (_animationFrame >= 38 && _animationFrame < 52)
        sparkle(oled, 111, 14 - bob, 2);
}

// Face 3 is deliberately asymmetric, with a cheeky wink instead of twin eyes.
void BMOFaceRenderer::renderWink(Adafruit_SSD1306& oled) {
    int dx = wave(_animationFrame, 4);
    int bob = wave(_animationFrame, 2, 30);
    oled.fillRoundRect(25 + dx, 17 + bob, 27, 29, 10, SSD1306_WHITE);
    oled.fillCircle(34 + dx, 25 + bob, 4, SSD1306_BLACK);
    oled.drawPixel(35 + dx, 23 + bob, SSD1306_WHITE);
    int squeeze = _animationFrame >= 12 && _animationFrame < 45 ? 0 : 3;
    stroke(oled, 78 + dx, 23 + bob - squeeze, 94 + dx, 31 + bob);
    stroke(oled, 94 + dx, 31 + bob, 78 + dx, 37 + bob + squeeze);
    oled.drawLine(56 + dx, 47 + bob, 63 + dx, 51 + bob, SSD1306_WHITE);
    oled.drawLine(63 + dx, 51 + bob, 76 + dx, 44 + bob, SSD1306_WHITE);
    oled.drawLine(18 + dx, 40 + bob, 16 + dx, 44 + bob, SSD1306_WHITE);
    oled.drawLine(22 + dx, 40 + bob, 20 + dx, 44 + bob, SSD1306_WHITE);
    sparkle(oled, 108 - dx, 15 - bob, 2 + (_animationFrame / 10) % 3);
}

void BMOFaceRenderer::renderSurprised(Adafruit_SSD1306& oled) {
    int bob = wave(_animationFrame, 3, 30);
    int look = wave(_animationFrame, 4);
    int pulse = (_animationFrame / 10) % 3;
    for (int x : {24, 74}) {
        oled.fillRoundRect(x, 16 + bob, 30, 30, 11, SSD1306_WHITE);
        oled.fillCircle(x + 15 + look, 30 + bob, 5, SSD1306_BLACK);
        oled.drawFastHLine(x + 5, 11 + bob, 20, SSD1306_WHITE);
    }
    oled.drawCircle(64, 50 + bob, 4 + pulse, SSD1306_WHITE);
    int lift = (_animationFrame / 5) % 4;
    oled.fillRoundRect(115, 17 - lift, 3, 10, 1, SSD1306_WHITE);
    oled.fillCircle(116, 31 - lift, 1, SSD1306_WHITE);
    sparkle(oled, 10, 30 - bob, 2);
}

void BMOFaceRenderer::renderLove(Adafruit_SSD1306& oled) {
    int bob = wave(_animationFrame, 2);
    int pulse = 5 + (_animationFrame / 15) % 2;
    heart(oled, 41, 22 + bob, pulse);
    heart(oled, 87, 22 + bob, pulse);
    oled.drawLine(54, 45 + bob, 59, 49 + bob, SSD1306_WHITE);
    oled.drawFastHLine(59, 49 + bob, 11, SSD1306_WHITE);
    oled.drawLine(69, 49 + bob, 74, 45 + bob, SSD1306_WHITE);
    for (int i = 0; i < 2; ++i) {
        int rise = (_animationFrame + i * 25) % 50;
        heart(oled, i ? 113 : 14, 48 - rise * 4 / 5, 2);
    }
}

void BMOFaceRenderer::renderDance(Adafruit_SSD1306& oled) {
    int dx = wave(_animationFrame, 9);
    int bob = wave(_animationFrame, 3, 20);
    int cx = 64 + dx;
    int y = 12 + bob;
    int swing = wave(_animationFrame, 6, 30);
    oled.drawRoundRect(cx - 17, y, 34, 34, 5, SSD1306_WHITE);
    oled.drawRoundRect(cx - 13, y + 4, 26, 17, 3, SSD1306_WHITE);
    oled.fillCircle(cx - 6, y + 11, 2, SSD1306_WHITE);
    oled.fillCircle(cx + 6, y + 11, 2, SSD1306_WHITE);
    oled.drawFastHLine(cx - 3, y + 16, 7, SSD1306_WHITE);
    oled.drawFastHLine(cx - 10, y + 27, 7, SSD1306_WHITE);
    oled.drawFastVLine(cx - 7, y + 24, 7, SSD1306_WHITE);
    oled.fillCircle(cx + 8, y + 27, 3, SSD1306_WHITE);
    stroke(oled, cx - 18, y + 18, cx - 29, y + 13 + swing);
    stroke(oled, cx + 18, y + 18, cx + 29, y + 13 - swing);
    stroke(oled, cx - 8, y + 34, cx - 12 - swing / 2, 55);
    stroke(oled, cx + 8, y + 34, cx + 12 - swing / 2, 55);
    oled.drawFastHLine(cx - 17 - swing / 2, 56, 7, SSD1306_WHITE);
    oled.drawFastHLine(cx + 10 - swing / 2, 56, 7, SSD1306_WHITE);
    for (int side : {0, 1}) {
        int nx = side ? 111 : 13;
        int ny = 18 + (side ? -bob : bob);
        oled.fillCircle(nx, ny + 10, 2, SSD1306_WHITE);
        oled.drawFastVLine(nx + 2, ny, 11, SSD1306_WHITE);
        oled.drawLine(nx + 2, ny, nx + 6, ny + 3, SSD1306_WHITE);
    }
}

void BMOFaceRenderer::renderSiuuu(Adafruit_SSD1306& oled) {
    int f = _animationFrame;
    int cx = 64, headY = 20;
    bool running = f < 16;
    bool jumping = f >= 16 && f < 34;
    if (running) {
        cx = 27 + f * 2;
        headY += wave(f, 2, 8);
    } else if (jumping) {
        // Rise, turn, descend; the narrow jersey at the apex reads as a spin.
        int t = f - 16;
        headY -= (t < 9 ? t : 18 - t) * 13 / 9;
    }
    int bodyY = headY + 6;
    int width = jumping && f >= 23 && f <= 27 ? 5 : 13;
    oled.fillCircle(cx, headY, 5, SSD1306_WHITE);
    oled.fillRect(cx - 5, headY - 5, 10, 3, SSD1306_WHITE); // cropped hair
    oled.fillRoundRect(cx - width / 2, bodyY, width, 15, 2, SSD1306_WHITE);
    oled.setTextSize(1);
    if (width == 13) {
        oled.setTextColor(SSD1306_BLACK);
        oled.setCursor(cx - 2, bodyY + 3);
        oled.print("7");
        oled.setTextColor(SSD1306_WHITE);
    }
    int hipY = bodyY + 15;
    if (running) {
        int stride = wave(f, 7, 8);
        stroke(oled, cx - 6, bodyY + 3, cx - 12, bodyY + 9 + stride / 2);
        stroke(oled, cx + 6, bodyY + 3, cx + 13, bodyY + 9 - stride / 2);
        stroke(oled, cx - 3, hipY, cx - 3 - stride, hipY + 10);
        stroke(oled, cx + 3, hipY, cx + 3 + stride, hipY + 10);
        oled.drawFastHLine(cx - 23, 35, 8, SSD1306_WHITE);
        oled.drawFastHLine(cx - 18, 40, 6, SSD1306_WHITE);
    } else if (jumping) {
        stroke(oled, cx - width / 2, bodyY + 3, cx - 16, headY - 3);
        stroke(oled, cx + width / 2, bodyY + 3, cx + 16, headY - 3);
        stroke(oled, cx - 3, hipY, cx - 10, hipY + 9);
        stroke(oled, cx + 3, hipY, cx + 10, hipY + 9);
    } else {
        stroke(oled, cx - 6, bodyY + 3, cx - 23, bodyY + 14);
        stroke(oled, cx + 6, bodyY + 3, cx + 23, bodyY + 14);
        stroke(oled, cx - 3, hipY, cx - 13, 54);
        stroke(oled, cx + 3, hipY, cx + 13, 54);
        oled.drawFastHLine(cx - 17, 55, 7, SSD1306_WHITE);
        oled.drawFastHLine(cx + 11, 55, 7, SSD1306_WHITE);
        oled.setCursor(46, 1);
        oled.print("SIUUU!");
        int spread = (f - 34) % 13;
        oled.drawLine(40 - spread, 51, 36 - spread, 47, SSD1306_WHITE);
        oled.drawLine(88 + spread, 51, 92 + spread, 47, SSD1306_WHITE);
        sparkle(oled, 23, 23, 2 + (f / 5) % 2);
        sparkle(oled, 105, 19, 2 + (f / 7) % 2);
    }
    oled.drawFastHLine(39, 58, 50, SSD1306_WHITE);
}

// Face-only companion to the full-body celebration: inhale, shout, then smile.
void BMOFaceRenderer::renderSiuuuCheer(Adafruit_SSD1306& oled) {
    int f = _animationFrame;
    bool shouting = f >= 12 && f < 50;
    int bob = shouting ? wave(f, 2, 12) : 0;
    int sway = shouting ? wave(f, 2, 24) : 0;
    for (int x : {40, 88}) {
        if (shouting) {
            // Joyful squeezed eyes; the whole face bounces with the chant.
            stroke(oled, x - 10 + sway, 33 + bob, x + sway, 23 + bob);
            stroke(oled, x + sway, 23 + bob, x + 10 + sway, 33 + bob);
        } else {
            int height = f < 12 ? 19 - f / 3 : 16;
            oled.fillRoundRect(x - 9, 23, 18, height, 7, SSD1306_WHITE);
            oled.fillCircle(x - 3, 28, 2, SSD1306_BLACK);
        }
    }

    if (shouting) {
        // Opening and narrowing the mouth gives a silent "sii-uuu" rhythm.
        int pulse = wave(f, 3, 12);
        int width = 18 + pulse;
        int height = 13 - pulse;
        int left = 64 + sway - width / 2;
        int top = 47 + bob - height / 2;
        oled.fillRoundRect(left, top, width, height, 6, SSD1306_WHITE);
        oled.fillRoundRect(left + 2, top + 2, width - 4, height - 4, 4, SSD1306_BLACK);
        oled.setTextColor(SSD1306_WHITE);
        oled.setTextSize(2);
        oled.setCursor(28, 2);
        oled.print("SIUUU!");
        oled.setTextSize(1);
    } else if (f < 12) {
        oled.drawCircle(64, 49, 3 + f / 4, SSD1306_WHITE);
    } else {
        oled.drawLine(54, 47, 59, 51, SSD1306_WHITE);
        oled.drawFastHLine(59, 51, 11, SSD1306_WHITE);
        oled.drawLine(69, 51, 74, 47, SSD1306_WHITE);
    }
}

void BMOFaceRenderer::renderManUnited(Adafruit_SSD1306& oled) {
    int bob = wave(_animationFrame, 1);
    oled.drawBitmap((128 - kManUnitedDevilWidth) / 2, 2 + bob,
                    kManUnitedDevil, kManUnitedDevilWidth, kManUnitedDevilHeight,
                    SSD1306_WHITE);
    // Stars are drawn after maximizeScene(), preserving this logo's scale.
}

void BMOFaceRenderer::renderManUnitedStars(Adafruit_SSD1306& oled) {
    for (int i = 0; i < 4; ++i) {
        uint8_t phase = (_animationFrame + i * 15) % 60;
        int drift = wave(phase, 6);
        int x = i < 2 ? 22 + drift : 105 - drift;
        int y = 12 + (phase * 39 / 60);
        int radius = 2 + (phase / 10) % 3;
        sparkle(oled, x, y, radius);
    }
}

void BMOFaceRenderer::renderCool(Adafruit_SSD1306& oled) {
    int bob = wave(_animationFrame, 2, 30);
    int sway = wave(_animationFrame, 2);
    int y = 16 + bob;
    // Broad white frames and dark lenses, with a traveling reflection.
    for (int x : {18, 70}) {
        oled.fillRoundRect(x + sway, y, 40, 26, 7, SSD1306_WHITE);
        oled.fillRoundRect(x + 3 + sway, y + 3, 34, 20, 5, SSD1306_BLACK);
        int glint = 6 + (_animationFrame % 30) * 22 / 30;
        stroke(oled, x + glint + sway, y + 5, x + glint - 5 + sway, y + 17);
    }
    stroke(oled, 57 + sway, y + 7, 70 + sway, y + 7);
    stroke(oled, 14 + sway, y + 2, 20 + sway, y + 4);
    stroke(oled, 108 + sway, y + 4, 114 + sway, y + 2);
    // Asymmetric grin lifts with the beat.
    stroke(oled, 48 + sway, 48 + bob, 57 + sway, 53 + bob);
    stroke(oled, 57 + sway, 53 + bob, 77 + sway, 49 + bob);
    stroke(oled, 77 + sway, 49 + bob, 81 + sway, 45 + bob);
}

void BMOFaceRenderer::renderLaugh(Adafruit_SSD1306& oled) {
    int bob = wave(_animationFrame, 2, 12);
    for (int x : {38, 90}) {
        stroke(oled, x - 14, 28 + bob, x, 16 + bob);
        stroke(oled, x, 16 + bob, x + 14, 28 + bob);
    }
    int mouthHeight = 19 + wave(_animationFrame, 2, 12);
    oled.fillRoundRect(43, 34 + bob, 42, mouthHeight, 10, SSD1306_WHITE);
    oled.fillRoundRect(46, 37 + bob, 36, mouthHeight - 6, 7, SSD1306_BLACK);
    oled.fillRect(47, 36 + bob, 34, 4, SSD1306_WHITE); // Bright smiling teeth
    for (int i = 0; i < 2; ++i) {
        int t = (_animationFrame + i * 15) % 30;
        int x = i ? 112 : 16;
        int y = 29 + t * 18 / 30;
        oled.fillTriangle(x, y - 4, x - 3, y + 1, x + 3, y + 1, SSD1306_WHITE);
        oled.fillCircle(x, y + 2, 3, SSD1306_WHITE);
    }
}

void BMOFaceRenderer::renderStarry(Adafruit_SSD1306& oled) {
    // Five-pointed eyes pulse together, staying recognizable at one-bit depth.
    static const int8_t points[10][2] = {
        {0,-10},{3,-3},{10,-3},{5,2},{6,10},
        {0,6},{-6,10},{-5,2},{-10,-3},{-3,-3}
    };
    int radius = 18 + wave(_animationFrame, 2, 30);
    int bob = wave(_animationFrame, 2);
    for (int cx : {36, 92}) {
        int cy = 25 + bob;
        for (int i = 0; i < 10; ++i) {
            int j = (i + 1) % 10;
            oled.fillTriangle(cx, cy,
                cx + points[i][0] * radius / 10, cy + points[i][1] * radius / 10,
                cx + points[j][0] * radius / 10, cy + points[j][1] * radius / 10,
                SSD1306_WHITE);
        }
    }
    int opening = 3 + (_animationFrame / 10) % 3;
    oled.drawCircle(64, 51, opening, SSD1306_WHITE);
    oled.drawCircle(64, 51, opening + 1, SSD1306_WHITE);
}
