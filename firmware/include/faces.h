#pragma once

#include <Arduino.h>
#include <Adafruit_SSD1306.h>

enum BMOFaceType {
    FACE_HAPPY = 0,         // Broad happy curved smile with large ^ ^ happy eyelids & gentle glances
    FACE_NEUTRAL_BLINK = 1, // Large round-rect eyes with auto-blink & idle glances
    FACE_WINK = 2,          // Playful winking eye with tongue
    FACE_WORRIED = 3,       // Drooping sad eyelids with gentle sweat drop & calm look
    FACE_SLEEPING = 4,      // Closed eyes with animated floating Z z z and breathing mouth
    FACE_SURPRISED = 5,     // Extra-large round-rect eyes with wide shock look & open mouth
    FACE_COUNT = 6
};

class BMOFaceRenderer {
public:
    BMOFaceRenderer();

    // Set active facial expression (0 to 5)
    void setFace(BMOFaceType face);
    void nextFace();
    BMOFaceType getCurrentFace() const { return _currentFace; }
    const char* getFaceName(BMOFaceType face) const;

    // Render active face onto display with non-blocking animation ticks
    void render(Adafruit_SSD1306& oled);

    // Reset geometry and mood to match the current face
    void resetMood();

private:
    void updateAnimation();
    void renderHappy(Adafruit_SSD1306& oled);
    void renderNeutralBlink(Adafruit_SSD1306& oled);
    void renderWink(Adafruit_SSD1306& oled);
    void renderWorried(Adafruit_SSD1306& oled);
    void renderSleeping(Adafruit_SSD1306& oled);
    void renderSurprised(Adafruit_SSD1306& oled);

    void drawBaseEyes(Adafruit_SSD1306& oled);
    void drawHappyEyelids(Adafruit_SSD1306& oled);
    void drawTiredEyelids(Adafruit_SSD1306& oled);
    void drawSweatDrops(Adafruit_SSD1306& oled);

    void closeEyes();
    void openEyes();
    void triggerBlink();

    int getScreenConstraintX() const;
    int getScreenConstraintY() const;

    BMOFaceType _currentFace;
    unsigned long _lastAnimationTick;
    uint8_t _animationFrame;

    // --- RoboEyes Geometry (Enlarged 36x36 for 128x64 display) ---
    int _screenWidth;
    int _screenHeight;

    int _eyeLwidthDefault;
    int _eyeLheightDefault;
    int _eyeLwidthCurrent;
    int _eyeLheightCurrent;
    int _eyeLwidthNext;
    int _eyeLheightNext;
    int _eyeLheightOffset;

    int _eyeRwidthDefault;
    int _eyeRheightDefault;
    int _eyeRwidthCurrent;
    int _eyeRheightCurrent;
    int _eyeRwidthNext;
    int _eyeRheightNext;
    int _eyeRheightOffset;

    byte _eyeLborderRadiusDefault;
    byte _eyeLborderRadiusCurrent;
    byte _eyeLborderRadiusNext;

    byte _eyeRborderRadiusDefault;
    byte _eyeRborderRadiusCurrent;
    byte _eyeRborderRadiusNext;

    int _spaceBetweenDefault;
    int _spaceBetweenCurrent;
    int _spaceBetweenNext;

    int _eyeLxDefault;
    int _eyeLyDefault;
    int _eyeLx;
    int _eyeLy;
    int _eyeLxNext;
    int _eyeLyNext;

    int _eyeRx;
    int _eyeRy;
    int _eyeRxNext;
    int _eyeRyNext;

    // Eyelids
    byte _eyelidsTiredHeight;
    byte _eyelidsTiredHeightNext;
    byte _eyelidsHappyBottomOffset;
    byte _eyelidsHappyBottomOffsetNext;

    // Macro Animations
    bool _autoblinker;
    bool _eyeLOpen;
    bool _eyeROpen;
    unsigned long _blinkTimer;
    int _blinkInterval;
    int _blinkVariation;

    bool _idle;
    unsigned long _idleTimer;
    int _idleInterval;
    int _idleVariation;

    bool _curious;

    bool _hFlicker;
    bool _hFlickerAlternate;
    byte _hFlickerAmplitude;

    bool _vFlicker;
    bool _vFlickerAlternate;
    byte _vFlickerAmplitude;

    // Sweat drop animation (Worried face)
    bool _sweat;
    int _sweatX;
    float _sweatY;
    int _sweatYMax;
    float _sweatW;
    float _sweatH;
    unsigned long _sweatPauseUntil;
};

extern BMOFaceRenderer faceRenderer;
