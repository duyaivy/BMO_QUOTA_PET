#include "faces.h"

BMOFaceRenderer faceRenderer;

BMOFaceRenderer::BMOFaceRenderer()
    : _currentFace(FACE_HAPPY),
      _lastAnimationTick(0),
      _animationFrame(0),
      _isBlinking(false),
      _nextBlinkTime(millis() + 2500) {}

void BMOFaceRenderer::setFace(BMOFaceType face) {
    if (face >= 0 && face < FACE_COUNT) {
        _currentFace = face;
        _animationFrame = 0;
    }
}

void BMOFaceRenderer::nextFace() {
    int next = ((int)_currentFace + 1) % FACE_COUNT;
    _currentFace = (BMOFaceType)next;
    _animationFrame = 0;
}

const char* BMOFaceRenderer::getFaceName(BMOFaceType face) const {
    switch (face) {
        case FACE_HAPPY: return "Happy";
        case FACE_NEUTRAL_BLINK: return "Neutral / Blink";
        case FACE_WINK: return "Wink / Playful";
        case FACE_WORRIED: return "Worried / Sad";
        case FACE_SLEEPING: return "Sleeping";
        case FACE_SURPRISED: return "Surprised / Excited";
        default: return "BMO";
    }
}

void BMOFaceRenderer::render(Adafruit_SSD1306& oled) {
    unsigned long now = millis();

    // Advance animation tick every 80ms
    if (now - _lastAnimationTick >= 80) {
        _lastAnimationTick = now;
        _animationFrame = (_animationFrame + 1) % 60;
    }

    // Handle periodic blinking for neutral face
    if (_currentFace == FACE_NEUTRAL_BLINK) {
        if (!_isBlinking && now >= _nextBlinkTime) {
            _isBlinking = true;
            _nextBlinkTime = now + 150; // Blink duration 150ms
        } else if (_isBlinking && now >= _nextBlinkTime) {
            _isBlinking = false;
            _nextBlinkTime = now + random(2000, 5000); // Next blink in 2 to 5 seconds
        }
    }

    oled.clearDisplay();

    switch (_currentFace) {
        case FACE_HAPPY:
            renderHappy(oled);
            break;
        case FACE_NEUTRAL_BLINK:
            renderNeutralBlink(oled);
            break;
        case FACE_WINK:
            renderWink(oled);
            break;
        case FACE_WORRIED:
            renderWorried(oled);
            break;
        case FACE_SLEEPING:
            renderSleeping(oled);
            break;
        case FACE_SURPRISED:
            renderSurprised(oled);
            break;
    }

    // Small subtle indicator at bottom right showing current face index
    char pageBuf[8];
    snprintf(pageBuf, sizeof(pageBuf), "%d/%d", (int)_currentFace + 1, FACE_COUNT);
    oled.setTextSize(1);
    oled.setTextColor(SSD1306_WHITE);
    oled.setCursor(104, 56);
    oled.print(pageBuf);
}

// 1. HAPPY: Radiant curved ^ ^ eyes, wide cheerful open smile, rosy cheeks
void BMOFaceRenderer::renderHappy(Adafruit_SSD1306& oled) {
    // Left eye ^ (thick angled lines)
    oled.drawLine(28, 25, 36, 17, SSD1306_WHITE);
    oled.drawLine(29, 25, 36, 18, SSD1306_WHITE);
    oled.drawLine(36, 17, 44, 25, SSD1306_WHITE);
    oled.drawLine(36, 18, 43, 25, SSD1306_WHITE);

    // Right eye ^
    oled.drawLine(84, 25, 92, 17, SSD1306_WHITE);
    oled.drawLine(85, 25, 92, 18, SSD1306_WHITE);
    oled.drawLine(92, 17, 100, 25, SSD1306_WHITE);
    oled.drawLine(92, 18, 99, 25, SSD1306_WHITE);

    // Cute blush stripes on cheeks
    oled.drawLine(18, 30, 24, 30, SSD1306_WHITE);
    oled.drawLine(19, 33, 23, 33, SSD1306_WHITE);
    oled.drawLine(104, 30, 110, 30, SSD1306_WHITE);
    oled.drawLine(105, 33, 109, 33, SSD1306_WHITE);

    // Big wide happy open mouth with rounded bottom
    oled.fillCircle(64, 34, 16, SSD1306_WHITE);
    oled.fillRect(40, 20, 48, 14, SSD1306_BLACK); // Flat top
    oled.drawFastHLine(48, 34, 32, SSD1306_WHITE); // Upper lip line
    oled.fillCircle(64, 42, 6, SSD1306_BLACK);     // Little tongue cutout inside mouth
}

// 2. NEUTRAL_BLINK: Round oval eyes with cute highlight, gentle smile, animated blink
void BMOFaceRenderer::renderNeutralBlink(Adafruit_SSD1306& oled) {
    if (_isBlinking) {
        // Closed horizontal eyelid lines during blink
        oled.fillRoundRect(30, 24, 18, 4, 2, SSD1306_WHITE);
        oled.fillRoundRect(80, 24, 18, 4, 2, SSD1306_WHITE);
    } else {
        // Left Eye (oval)
        oled.fillRoundRect(32, 16, 14, 20, 6, SSD1306_WHITE);
        oled.fillCircle(35, 20, 2, SSD1306_BLACK); // Cute eye reflection highlight

        // Right Eye (oval)
        oled.fillRoundRect(82, 16, 14, 20, 6, SSD1306_WHITE);
        oled.fillCircle(85, 20, 2, SSD1306_BLACK); // Cute eye reflection highlight
    }

    // Classic cute BMO mouth line with upturned corners
    oled.drawFastHLine(56, 42, 16, SSD1306_WHITE);
    oled.drawPixel(55, 41, SSD1306_WHITE);
    oled.drawPixel(72, 41, SSD1306_WHITE);
}

// 3. WINK: Left eye open, right eye winking >, cheerful smirk with tongue
void BMOFaceRenderer::renderWink(Adafruit_SSD1306& oled) {
    // Left eye open wide with sparkle
    oled.fillRoundRect(32, 16, 14, 20, 6, SSD1306_WHITE);
    oled.fillCircle(36, 19, 3, SSD1306_BLACK);
    oled.fillCircle(38, 27, 1, SSD1306_BLACK);

    // Right eye wink > (thick lines)
    oled.drawLine(82, 20, 94, 26, SSD1306_WHITE);
    oled.drawLine(82, 21, 94, 27, SSD1306_WHITE);
    oled.drawLine(94, 26, 82, 32, SSD1306_WHITE);
    oled.drawLine(94, 27, 82, 33, SSD1306_WHITE);

    // Cheerful sideways smile
    oled.drawFastHLine(56, 40, 16, SSD1306_WHITE);
    oled.drawPixel(55, 39, SSD1306_WHITE);
    oled.drawPixel(72, 39, SSD1306_WHITE);

    // Playful sticking tongue
    oled.fillRoundRect(62, 41, 8, 8, 3, SSD1306_WHITE);
    oled.drawFastVLine(66, 41, 5, SSD1306_BLACK); // Tongue crease
}

// 4. WORRIED: Slanted sad eyebrows \ /, watery rounded eyes, quivering mouth ~
void BMOFaceRenderer::renderWorried(Adafruit_SSD1306& oled) {
    // Slanted eyebrows \ /
    oled.drawLine(30, 12, 46, 16, SSD1306_WHITE);
    oled.drawLine(30, 13, 46, 17, SSD1306_WHITE);
    oled.drawLine(98, 12, 82, 16, SSD1306_WHITE);
    oled.drawLine(98, 13, 82, 17, SSD1306_WHITE);

    // Teary eyes
    oled.fillRoundRect(34, 18, 12, 16, 5, SSD1306_WHITE);
    oled.fillCircle(38, 22, 2, SSD1306_BLACK);
    oled.drawPixel(34, 36, SSD1306_WHITE); // Little tear drop forming

    oled.fillRoundRect(82, 18, 12, 16, 5, SSD1306_WHITE);
    oled.fillCircle(86, 22, 2, SSD1306_BLACK);

    // Quivering sad mouth ~
    oled.drawLine(56, 44, 60, 42, SSD1306_WHITE);
    oled.drawLine(60, 42, 64, 45, SSD1306_WHITE);
    oled.drawLine(64, 45, 68, 42, SSD1306_WHITE);
    oled.drawLine(68, 42, 72, 44, SSD1306_WHITE);
}

// 5. SLEEPING: Closed peaceful eyes - -, relaxed mouth, floating Z z z animation
void BMOFaceRenderer::renderSleeping(Adafruit_SSD1306& oled) {
    // Left closed peaceful eye (curved downwards)
    oled.drawFastHLine(30, 26, 18, SSD1306_WHITE);
    oled.drawFastHLine(32, 27, 14, SSD1306_WHITE);
    oled.drawPixel(29, 25, SSD1306_WHITE);
    oled.drawPixel(48, 25, SSD1306_WHITE);

    // Right closed peaceful eye
    oled.drawFastHLine(80, 26, 18, SSD1306_WHITE);
    oled.drawFastHLine(82, 27, 14, SSD1306_WHITE);
    oled.drawPixel(79, 25, SSD1306_WHITE);
    oled.drawPixel(98, 25, SSD1306_WHITE);

    // Relaxed small 'o' sleeping mouth (breathing)
    int breathOffset = (_animationFrame / 15) % 2;
    oled.drawCircle(64, 42, 3 + breathOffset, SSD1306_WHITE);

    // Floating animated "Z", "z", "z" drifting upwards
    int zY1 = 36 - ((_animationFrame * 2) % 32);
    int zY2 = 36 - (((_animationFrame * 2) + 10) % 32);
    int zY3 = 36 - (((_animationFrame * 2) + 20) % 32);

    oled.setTextSize(1);
    oled.setTextColor(SSD1306_WHITE);

    if (zY1 > 4 && zY1 < 48) {
        oled.setCursor(102, zY1);
        oled.print("Z");
    }
    if (zY2 > 4 && zY2 < 48) {
        oled.setCursor(108, zY2);
        oled.print("z");
    }
    if (zY3 > 4 && zY3 < 48) {
        oled.setCursor(114, zY3);
        oled.print(".");
    }
}

// 6. SURPRISED: Big round eyes O O, big open circular mouth :O
void BMOFaceRenderer::renderSurprised(Adafruit_SSD1306& oled) {
    // Big round eyes
    oled.drawCircle(38, 22, 11, SSD1306_WHITE);
    oled.drawCircle(38, 22, 10, SSD1306_WHITE);
    oled.fillCircle(38, 22, 4, SSD1306_WHITE); // Centered pupil

    oled.drawCircle(90, 22, 11, SSD1306_WHITE);
    oled.drawCircle(90, 22, 10, SSD1306_WHITE);
    oled.fillCircle(90, 22, 4, SSD1306_WHITE); // Centered pupil

    // Raised excited eyebrows
    oled.drawFastHLine(30, 8, 16, SSD1306_WHITE);
    oled.drawFastHLine(82, 8, 16, SSD1306_WHITE);

    // Big open round mouth :O
    oled.fillCircle(64, 42, 8, SSD1306_WHITE);
    oled.fillCircle(64, 42, 6, SSD1306_BLACK);
}
