#include "faces.h"

BMOFaceRenderer faceRenderer;

BMOFaceRenderer::BMOFaceRenderer()
    : _currentFace(FACE_HAPPY),
      _lastAnimationTick(0),
      _animationFrame(0),
      _screenWidth(128),
      _screenHeight(64),
      _eyeLwidthDefault(34),
      _eyeLheightDefault(36),
      _eyeLwidthCurrent(34),
      _eyeLheightCurrent(36),
      _eyeLwidthNext(34),
      _eyeLheightNext(36),
      _eyeLheightOffset(0),
      _eyeRwidthDefault(34),
      _eyeRheightDefault(36),
      _eyeRwidthCurrent(34),
      _eyeRheightCurrent(36),
      _eyeRwidthNext(34),
      _eyeRheightNext(36),
      _eyeRheightOffset(0),
      _eyeLborderRadiusDefault(8),
      _eyeLborderRadiusCurrent(8),
      _eyeLborderRadiusNext(8),
      _eyeRborderRadiusDefault(8),
      _eyeRborderRadiusCurrent(8),
      _eyeRborderRadiusNext(8),
      _spaceBetweenDefault(12),
      _spaceBetweenCurrent(12),
      _spaceBetweenNext(12),
      _eyeLxDefault(24),
      _eyeLyDefault(12),
      _eyeLx(24),
      _eyeLy(12),
      _eyeLxNext(24),
      _eyeLyNext(12),
      _eyeRx(70),
      _eyeRy(12),
      _eyeRxNext(70),
      _eyeRyNext(12),
      _eyelidsTiredHeight(0),
      _eyelidsTiredHeightNext(0),
      _eyelidsHappyBottomOffset(0),
      _eyelidsHappyBottomOffsetNext(0),
      _autoblinker(true),
      _eyeLOpen(true),
      _eyeROpen(true),
      _blinkTimer(millis() + 2500),
      _blinkInterval(2),
      _blinkVariation(3),
      _idle(false),
      _idleTimer(millis() + 3000),
      _idleInterval(2),
      _idleVariation(3),
      _curious(false),
      _hFlicker(false),
      _hFlickerAlternate(false),
      _hFlickerAmplitude(0),
      _vFlicker(false),
      _vFlickerAlternate(false),
      _vFlickerAmplitude(0),
      _sweat(false),
      _sweatX(112),
      _sweatY(2.0f),
      _sweatYMax(22),
      _sweatW(2.0f),
      _sweatH(3.0f),
      _sweatPauseUntil(0) {
    resetMood();
}

void BMOFaceRenderer::setFace(BMOFaceType face) {
    if (face >= 0 && face < FACE_COUNT) {
        _currentFace = face;
        _animationFrame = 0;
        resetMood();
    }
}

void BMOFaceRenderer::nextFace() {
    int next = ((int)_currentFace + 1) % FACE_COUNT;
    _currentFace = (BMOFaceType)next;
    _animationFrame = 0;
    resetMood();
}

const char* BMOFaceRenderer::getFaceName(BMOFaceType face) const {
    switch (face) {
        case FACE_HAPPY: return "Happy";
        case FACE_NEUTRAL_BLINK: return "Neutral / Blink";
        case FACE_WINK: return "Tongue Out / Playful";
        case FACE_WORRIED: return "Worried / Sad";
        case FACE_SLEEPING: return "Sleeping";
        case FACE_SURPRISED: return "Surprised / Excited";
        default: return "BMO";
    }
}

void BMOFaceRenderer::resetMood() {
    unsigned long now = millis();
    _eyeLOpen = true;
    _eyeROpen = true;
    _hFlicker = false;
    _vFlicker = false;
    _sweat = false;
    _curious = false;
    _idle = false;
    _autoblinker = false;
    _eyelidsTiredHeightNext = 0;
    _eyelidsHappyBottomOffsetNext = 0;
    _eyeLheightOffset = 0;
    _eyeRheightOffset = 0;

    switch (_currentFace) {
        case FACE_HAPPY:
            // 1. HAPPY: Calm, joyful, smooth glances like Face 2 with curved happy eyelids
            _eyeLwidthDefault = 36;
            _eyeRwidthDefault = 36;
            _eyeLheightDefault = 34;
            _eyeRheightDefault = 34;
            _spaceBetweenDefault = 12;
            _eyeLborderRadiusDefault = 8;
            _eyeRborderRadiusDefault = 8;

            _eyeLwidthNext = 36;
            _eyeRwidthNext = 36;
            _eyeLheightNext = 34;
            _eyeRheightNext = 34;
            _spaceBetweenNext = 12;

            _eyeLxNext = (128 - (36 + 12 + 36)) / 2; // = 22
            _eyeLyNext = 10;
            _eyelidsHappyBottomOffsetNext = 18; // Cheerful curved bottom eyelids
            _autoblinker = true;
            _blinkInterval = 3;
            _blinkVariation = 3;
            _idle = true; // Natural gentle glances around
            _idleInterval = 3;
            _idleVariation = 3;
            break;

        case FACE_NEUTRAL_BLINK:
            // 2. NEUTRAL_BLINK: User favorite! Smooth, calm, natural auto-blink & idle glances
            _eyeLwidthDefault = 34;
            _eyeRwidthDefault = 34;
            _eyeLheightDefault = 36;
            _eyeRheightDefault = 36;
            _spaceBetweenDefault = 12;
            _eyeLborderRadiusDefault = 8;
            _eyeRborderRadiusDefault = 8;

            _eyeLwidthNext = 34;
            _eyeRwidthNext = 34;
            _eyeLheightNext = 36;
            _eyeRheightNext = 36;
            _spaceBetweenNext = 12;

            _eyeLxNext = (128 - (34 + 12 + 34)) / 2; // = 24
            _eyeLyNext = 12;
            _autoblinker = true;
            _blinkInterval = 2;
            _blinkVariation = 3;
            _idle = true;
            _idleInterval = 2;
            _idleVariation = 3;
            _curious = true;
            break;

        case FACE_WINK:
            // 3. TONGUE OUT / PLAYFUL: Normal big cute eyes like Face 2 + playful sticking tongue
            _eyeLwidthDefault = 34;
            _eyeRwidthDefault = 34;
            _eyeLheightDefault = 36;
            _eyeRheightDefault = 36;
            _spaceBetweenDefault = 12;
            _eyeLborderRadiusDefault = 8;
            _eyeRborderRadiusDefault = 8;

            _eyeLwidthNext = 34;
            _eyeRwidthNext = 34;
            _eyeLheightNext = 36;
            _eyeRheightNext = 36;
            _spaceBetweenNext = 12;

            _eyeLxNext = (128 - (34 + 12 + 34)) / 2; // = 24
            _eyeLyNext = 12;
            _eyeLOpen = true;
            _eyeROpen = true;
            _autoblinker = true;
            _blinkInterval = 2;
            _blinkVariation = 3;
            _idle = true;
            _idleInterval = 2;
            _idleVariation = 3;
            _curious = true;
            break;

        case FACE_WORRIED:
            // 4. WORRIED: Calm sad look, gentle blinking, slow single sweat drop
            _eyeLwidthDefault = 34;
            _eyeRwidthDefault = 34;
            _eyeLheightDefault = 36;
            _eyeRheightDefault = 36;
            _spaceBetweenDefault = 12;
            _eyeLborderRadiusDefault = 8;
            _eyeRborderRadiusDefault = 8;

            _eyeLwidthNext = 34;
            _eyeRwidthNext = 34;
            _eyeLheightNext = 36;
            _eyeRheightNext = 36;
            _spaceBetweenNext = 12;

            _eyeLxNext = (128 - (34 + 12 + 34)) / 2; // = 24
            _eyeLyNext = 12;
            _eyelidsTiredHeightNext = 14; // Slanted top eyelids
            _autoblinker = true;
            _blinkInterval = 3;
            _blinkVariation = 3;
            _idle = true; // Subtle glances
            _idleInterval = 4;
            _idleVariation = 3;

            _sweat = true;
            _sweatX = 112;
            _sweatY = 2.0f;
            _sweatYMax = 22;
            _sweatW = 2.0f;
            _sweatH = 3.0f;
            _sweatPauseUntil = now + 1500;
            break;

        case FACE_SLEEPING:
            // 5. SLEEPING: Peaceful closed eyes, slow breathing mouth, drifting Z z z
            _eyeLwidthDefault = 36;
            _eyeRwidthDefault = 36;
            _eyeLheightDefault = 3;
            _eyeRheightDefault = 3;
            _spaceBetweenDefault = 12;
            _eyeLborderRadiusDefault = 2;
            _eyeRborderRadiusDefault = 2;

            _eyeLwidthNext = 36;
            _eyeRwidthNext = 36;
            _eyeLheightNext = 3;
            _eyeRheightNext = 3;
            _spaceBetweenNext = 12;

            _eyeLOpen = false;
            _eyeROpen = false;
            _eyeLxNext = 22;
            _eyeLyNext = 20;
            break;

        case FACE_SURPRISED:
            // 6. SURPRISED: Steady extra-large shocked eyes, centered pupils, calm surprise
            _eyeLwidthDefault = 38;
            _eyeRwidthDefault = 38;
            _eyeLheightDefault = 40;
            _eyeRheightDefault = 40;
            _spaceBetweenDefault = 10;
            _eyeLborderRadiusDefault = 10;
            _eyeRborderRadiusDefault = 10;

            _eyeLwidthNext = 38;
            _eyeRwidthNext = 38;
            _eyeLheightNext = 40;
            _eyeRheightNext = 40;
            _spaceBetweenNext = 10;

            _eyeLxNext = (128 - (38 + 10 + 38)) / 2; // = 21
            _eyeLyNext = 8;
            _autoblinker = true; // Wide-eyed stare with rare blink
            _blinkInterval = 5;
            _blinkVariation = 4;
            break;
    }

    _blinkTimer = now + (_blinkInterval * 1000);
    _idleTimer = now + (_idleInterval * 1000);
}

void BMOFaceRenderer::closeEyes() {
    _eyeLheightNext = 1;
    _eyeRheightNext = 1;
}

void BMOFaceRenderer::openEyes() {
    if (_eyeLOpen) _eyeLheightNext = _eyeLheightDefault;
    if (_eyeROpen) _eyeRheightNext = _eyeRheightDefault;
}

void BMOFaceRenderer::triggerBlink() {
    closeEyes();
    openEyes();
}

int BMOFaceRenderer::getScreenConstraintX() const {
    return _screenWidth - _eyeLwidthCurrent - _spaceBetweenCurrent - _eyeRwidthCurrent;
}

int BMOFaceRenderer::getScreenConstraintY() const {
    return _screenHeight - _eyeLheightDefault;
}

void BMOFaceRenderer::updateAnimation() {
    unsigned long now = millis();

    // Auto-blinker with natural randomized timing
    if (_autoblinker) {
        if (now >= _blinkTimer) {
            triggerBlink();
            _blinkTimer = now + (_blinkInterval * 1000) + (random(_blinkVariation) * 1000);
        }
    }

    // Idle glances (smooth look left/right/center)
    if (_idle) {
        if (now >= _idleTimer) {
            int glance = random(5);
            int centerX = (128 - (_eyeLwidthDefault + _spaceBetweenDefault + _eyeRwidthDefault)) / 2;
            int centerY = (_currentFace == FACE_HAPPY) ? 10 : 12;

            if (glance == 0) { // Center
                _eyeLxNext = centerX;
                _eyeLyNext = centerY;
            } else if (glance == 1) { // Left
                _eyeLxNext = max(6, centerX - 12);
                _eyeLyNext = centerY;
            } else if (glance == 2) { // Right
                _eyeLxNext = min(128 - (_eyeLwidthDefault + _spaceBetweenDefault + _eyeRwidthDefault) - 6, centerX + 12);
                _eyeLyNext = centerY;
            } else if (glance == 3) { // Up
                _eyeLxNext = centerX;
                _eyeLyNext = max(6, centerY - 4);
            } else { // Down
                _eyeLxNext = centerX;
                _eyeLyNext = centerY + 3;
            }
            _idleTimer = now + (_idleInterval * 1000) + (random(_idleVariation) * 1000);
        }
    }

    // Curiosity sizing: outer eye gets slightly taller when glancing sideways
    if (_curious) {
        int centerX = (128 - (_eyeLwidthDefault + _spaceBetweenDefault + _eyeRwidthDefault)) / 2;
        if (_eyeLxNext < centerX - 4) {
            _eyeLheightOffset = 6;
            _eyeRheightOffset = 0;
        } else if (_eyeLxNext > centerX + 4) {
            _eyeLheightOffset = 0;
            _eyeRheightOffset = 6;
        } else {
            _eyeLheightOffset = 0;
            _eyeRheightOffset = 0;
        }
    } else {
        _eyeLheightOffset = 0;
        _eyeRheightOffset = 0;
    }

    // Easing interpolation for dimensions (RoboEyes smooth tweening)
    _eyeLwidthCurrent = (_eyeLwidthCurrent + _eyeLwidthNext) / 2;
    _eyeRwidthCurrent = (_eyeRwidthCurrent + _eyeRwidthNext) / 2;

    _eyeLheightCurrent = (_eyeLheightCurrent + _eyeLheightNext + _eyeLheightOffset) / 2;
    _eyeRheightCurrent = (_eyeRheightCurrent + _eyeRheightNext + _eyeRheightOffset) / 2;

    _spaceBetweenCurrent = (_spaceBetweenCurrent + _spaceBetweenNext) / 2;

    // Easing interpolation for positions
    _eyeLx = (_eyeLx + _eyeLxNext) / 2;
    _eyeLy = (_eyeLy + _eyeLyNext) / 2;

    _eyeRxNext = _eyeLxNext + _eyeLwidthCurrent + _spaceBetweenCurrent;
    _eyeRyNext = _eyeLyNext;
    _eyeRx = (_eyeRx + _eyeRxNext) / 2;
    _eyeRy = (_eyeRy + _eyeRyNext) / 2;

    _eyeLborderRadiusCurrent = (_eyeLborderRadiusCurrent + _eyeLborderRadiusNext) / 2;
    _eyeRborderRadiusCurrent = (_eyeRborderRadiusCurrent + _eyeRborderRadiusNext) / 2;

    // Eyelid heights easing
    _eyelidsTiredHeight = (_eyelidsTiredHeight + _eyelidsTiredHeightNext) / 2;
    _eyelidsHappyBottomOffset = (_eyelidsHappyBottomOffset + _eyelidsHappyBottomOffsetNext) / 2;

    // Reopen eyes after closing during a blink
    if (_eyeLOpen && _eyeLheightCurrent <= 2 + _eyeLheightOffset) {
        _eyeLheightNext = _eyeLheightDefault;
    }
    if (_eyeROpen && _eyeRheightCurrent <= 2 + _eyeRheightOffset) {
        _eyeRheightNext = _eyeRheightDefault;
    }
}

void BMOFaceRenderer::drawBaseEyes(Adafruit_SSD1306& oled) {
    int drawLx = _eyeLx;
    int drawLy = _eyeLy;
    int drawRx = _eyeRx;
    int drawRy = _eyeRy;

    // Left eye round-rect
    if (_eyeLheightCurrent > 0) {
        oled.fillRoundRect(drawLx, drawLy, _eyeLwidthCurrent, _eyeLheightCurrent, _eyeLborderRadiusCurrent, SSD1306_WHITE);
    }

    // Right eye round-rect
    if (_eyeRheightCurrent > 0) {
        oled.fillRoundRect(drawRx, drawRy, _eyeRwidthCurrent, _eyeRheightCurrent, _eyeRborderRadiusCurrent, SSD1306_WHITE);
    }
}

void BMOFaceRenderer::drawHappyEyelids(Adafruit_SSD1306& oled) {
    if (_eyelidsHappyBottomOffset <= 0) return;

    int drawLx = _eyeLx;
    int drawLy = _eyeLy;
    int drawRx = _eyeRx;
    int drawRy = _eyeRy;

    // Cut out bottom half of each eye with a rounded rectangle in black to create wide ^ ^ smile eyes
    oled.fillRoundRect(drawLx - 1, (drawLy + _eyeLheightCurrent) - _eyelidsHappyBottomOffset + 1,
                       _eyeLwidthCurrent + 2, _eyeLheightDefault, _eyeLborderRadiusCurrent, SSD1306_BLACK);

    oled.fillRoundRect(drawRx - 1, (drawRy + _eyeRheightCurrent) - _eyelidsHappyBottomOffset + 1,
                       _eyeRwidthCurrent + 2, _eyeRheightDefault, _eyeRborderRadiusCurrent, SSD1306_BLACK);
}

void BMOFaceRenderer::drawTiredEyelids(Adafruit_SSD1306& oled) {
    if (_eyelidsTiredHeight <= 0) return;

    int drawLx = _eyeLx;
    int drawLy = _eyeLy;
    int drawRx = _eyeRx;
    int drawRy = _eyeRy;

    // Left eye slanted top eyelid (drooping outward)
    oled.fillTriangle(drawLx, drawLy - 1,
                      drawLx + _eyeLwidthCurrent, drawLy - 1,
                      drawLx, drawLy + _eyelidsTiredHeight - 1, SSD1306_BLACK);

    // Right eye slanted top eyelid (drooping outward)
    oled.fillTriangle(drawRx, drawRy - 1,
                      drawRx + _eyeRwidthCurrent, drawRy - 1,
                      drawRx + _eyeRwidthCurrent, drawRy + _eyelidsTiredHeight - 1, SSD1306_BLACK);
}

void BMOFaceRenderer::drawSweatDrops(Adafruit_SSD1306& oled) {
    if (!_sweat) return;

    unsigned long now = millis();
    if (now < _sweatPauseUntil) {
        return; // Pausing between drips for calm natural effect
    }

    // Gentle slow drip
    _sweatY += 0.25f;

    if (_sweatY > _sweatYMax) {
        // Drop reached bottom, pause 3 to 5 seconds before next drop
        _sweatPauseUntil = now + random(3000, 5000);
        _sweatX = random(108, 116);
        _sweatY = 2.0f;
        _sweatYMax = random(16, 24);
        _sweatW = 2.0f;
        _sweatH = 3.0f;
    } else {
        if (_sweatY <= _sweatYMax / 2.0f) {
            _sweatW += 0.1f;
            _sweatH += 0.15f;
        } else {
            _sweatW = max(1.0f, _sweatW - 0.05f);
            _sweatH = max(2.0f, _sweatH - 0.1f);
        }
        oled.fillRoundRect((int)(_sweatX - _sweatW / 2), (int)_sweatY,
                           (int)_sweatW, (int)_sweatH, 2, SSD1306_WHITE);
    }
}

void BMOFaceRenderer::render(Adafruit_SSD1306& oled) {
    unsigned long now = millis();

    // Advance frame tick every 60ms for smooth animations
    if (now - _lastAnimationTick >= 60) {
        _lastAnimationTick = now;
        _animationFrame = (_animationFrame + 1) % 60;
    }

    // Run RoboEyes easing update
    updateAnimation();

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

    // Page indicator at bottom right
    char pageBuf[8];
    snprintf(pageBuf, sizeof(pageBuf), "%d/%d", (int)_currentFace + 1, FACE_COUNT);
    oled.setTextSize(1);
    oled.setTextColor(SSD1306_WHITE);
    oled.setCursor(106, 56);
    oled.print(pageBuf);
}

// 1. HAPPY: Large cheerful curved eyes, blush cheeks, steady happy smile, gentle glances
void BMOFaceRenderer::renderHappy(Adafruit_SSD1306& oled) {
    drawBaseEyes(oled);
    drawHappyEyelids(oled);

    // Cheerful blush lines on both cheeks
    oled.drawFastHLine(max(2, _eyeLx - 10), _eyeLy + 20, 7, SSD1306_WHITE);
    oled.drawFastHLine(max(3, _eyeLx - 9), _eyeLy + 23, 5, SSD1306_WHITE);

    oled.drawFastHLine(min(125, _eyeRx + _eyeRwidthCurrent + 3), _eyeRy + 20, 7, SSD1306_WHITE);
    oled.drawFastHLine(min(125, _eyeRx + _eyeRwidthCurrent + 4), _eyeRy + 23, 5, SSD1306_WHITE);

    // Big happy open mouth with rounded bottom (steady, no vibration!)
    int mouthY = 48;
    oled.fillCircle(64, mouthY, 9, SSD1306_WHITE);
    oled.fillRect(52, mouthY - 10, 24, 10, SSD1306_BLACK); // Flat top lip
    oled.drawFastHLine(54, mouthY, 20, SSD1306_WHITE);
    oled.fillCircle(64, mouthY + 4, 3, SSD1306_BLACK);     // Cute tongue cutout
}

// 2. NEUTRAL_BLINK: Large round-rect eyes with reflection highlight, auto-blink, idle glance (User favorite!)
void BMOFaceRenderer::renderNeutralBlink(Adafruit_SSD1306& oled) {
    drawBaseEyes(oled);

    // Cute pupil reflection sparkle if eye is open
    if (_eyeLheightCurrent > 16) {
        oled.fillCircle(_eyeLx + 8, _eyeLy + 10, 2, SSD1306_BLACK);
    }
    if (_eyeRheightCurrent > 16) {
        oled.fillCircle(_eyeRx + 8, _eyeRy + 10, 2, SSD1306_BLACK);
    }

    // Classic cute BMO mouth line
    oled.drawFastHLine(56, 52, 16, SSD1306_WHITE);
    oled.drawPixel(55, 51, SSD1306_WHITE);
    oled.drawPixel(72, 51, SSD1306_WHITE);
}

// 3. TONGUE OUT / PLAYFUL: Normal large cute eyes with reflection, smiling mouth with tongue sticking out
void BMOFaceRenderer::renderWink(Adafruit_SSD1306& oled) {
    drawBaseEyes(oled);

    // Cute pupil reflection sparkle in both eyes (like Screen #2)
    if (_eyeLheightCurrent > 16) {
        oled.fillCircle(_eyeLx + 8, _eyeLy + 10, 2, SSD1306_BLACK);
    }
    if (_eyeRheightCurrent > 16) {
        oled.fillCircle(_eyeRx + 8, _eyeRy + 10, 2, SSD1306_BLACK);
    }

    // Cheerful blush lines on cheeks
    oled.drawFastHLine(max(2, _eyeLx - 8), _eyeLy + 22, 6, SSD1306_WHITE);
    oled.drawFastHLine(min(125, _eyeRx + _eyeRwidthCurrent + 2), _eyeRy + 22, 6, SSD1306_WHITE);

    // Cheerful curved smile
    oled.drawFastHLine(52, 48, 24, SSD1306_WHITE);
    oled.drawPixel(51, 47, SSD1306_WHITE);
    oled.drawPixel(76, 47, SSD1306_WHITE);

    // Cute rounded tongue sticking out :P
    oled.fillRoundRect(59, 49, 10, 9, 4, SSD1306_WHITE);
    oled.drawFastVLine(64, 49, 5, SSD1306_BLACK); // Tongue crease
}

// 4. WORRIED: Drooping sad eyelids, sad slanted eyebrows, gentle blinking, slow single sweat drop
void BMOFaceRenderer::renderWorried(Adafruit_SSD1306& oled) {
    drawBaseEyes(oled);
    drawTiredEyelids(oled);

    // Slanted eyebrows \ /
    oled.drawLine(_eyeLx, _eyeLy - 4, _eyeLx + _eyeLwidthCurrent, _eyeLy - 1, SSD1306_WHITE);
    oled.drawLine(_eyeLx, _eyeLy - 3, _eyeLx + _eyeLwidthCurrent, _eyeLy, SSD1306_WHITE);

    oled.drawLine(_eyeRx + _eyeRwidthCurrent, _eyeRy - 4, _eyeRx, _eyeRy - 1, SSD1306_WHITE);
    oled.drawLine(_eyeRx + _eyeRwidthCurrent, _eyeRy - 3, _eyeRx, _eyeRy, SSD1306_WHITE);

    // Slow, calm sweat drop
    drawSweatDrops(oled);

    // Steady wavy sad mouth ~
    oled.drawLine(54, 52, 59, 50, SSD1306_WHITE);
    oled.drawLine(59, 50, 64, 53, SSD1306_WHITE);
    oled.drawLine(64, 53, 69, 50, SSD1306_WHITE);
    oled.drawLine(69, 50, 74, 52, SSD1306_WHITE);
}

// 5. SLEEPING: Relaxed horizontal closed eyes, breathing mouth, drifting Z z z
void BMOFaceRenderer::renderSleeping(Adafruit_SSD1306& oled) {
    // Left closed peaceful eye
    oled.fillRoundRect(_eyeLx, _eyeLy + 12, _eyeLwidthCurrent, 4, 2, SSD1306_WHITE);
    oled.drawPixel(_eyeLx - 1, _eyeLy + 11, SSD1306_WHITE);
    oled.drawPixel(_eyeLx + _eyeLwidthCurrent, _eyeLy + 11, SSD1306_WHITE);

    // Right closed peaceful eye
    oled.fillRoundRect(_eyeRx, _eyeRy + 12, _eyeRwidthCurrent, 4, 2, SSD1306_WHITE);
    oled.drawPixel(_eyeRx - 1, _eyeRy + 11, SSD1306_WHITE);
    oled.drawPixel(_eyeRx + _eyeRwidthCurrent, _eyeRy + 11, SSD1306_WHITE);

    // Relaxed breathing small mouth
    int breathOffset = (_animationFrame / 15) % 2;
    oled.drawCircle(64, 48, 3 + breathOffset, SSD1306_WHITE);

    // Floating animated "Z", "z", "." drifting upwards to top-right
    int zY1 = 34 - ((_animationFrame * 2) % 32);
    int zY2 = 34 - (((_animationFrame * 2) + 10) % 32);
    int zY3 = 34 - (((_animationFrame * 2) + 20) % 32);

    oled.setTextSize(1);
    oled.setTextColor(SSD1306_WHITE);
    if (zY1 > 2 && zY1 < 44) {
        oled.setCursor(102, zY1);
        oled.print("Z");
    }
    if (zY2 > 2 && zY2 < 44) {
        oled.setCursor(108, zY2);
        oled.print("z");
    }
    if (zY3 > 2 && zY3 < 44) {
        oled.setCursor(114, zY3);
        oled.print(".");
    }
}

// 6. SURPRISED: Extra-large 38x40 eyes, raised arched eyebrows, centered steady pupils, open round mouth
void BMOFaceRenderer::renderSurprised(Adafruit_SSD1306& oled) {
    drawBaseEyes(oled);

    // Steady centered shock pupils
    if (_eyeLheightCurrent > 20) {
        oled.fillCircle(_eyeLx + _eyeLwidthCurrent / 2, _eyeLy + _eyeLheightCurrent / 2, 5, SSD1306_BLACK);
        oled.fillCircle(_eyeRx + _eyeRwidthCurrent / 2, _eyeRy + _eyeRheightCurrent / 2, 5, SSD1306_BLACK);
    }

    // Raised arched eyebrows
    oled.drawFastHLine(_eyeLx + 4, _eyeLy - 4, _eyeLwidthCurrent - 8, SSD1306_WHITE);
    oled.drawFastHLine(_eyeRx + 4, _eyeRy - 4, _eyeRwidthCurrent - 8, SSD1306_WHITE);

    // Big open round mouth :O (steady and crisp)
    oled.fillCircle(64, 52, 7, SSD1306_WHITE);
    oled.fillCircle(64, 52, 4, SSD1306_BLACK);
}
