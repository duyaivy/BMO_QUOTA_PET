#pragma once

#include <Arduino.h>
#include <Adafruit_SSD1306.h>

enum BMOFaceType {
    FACE_HAPPY = 0,         // Airy crescent eyes, small smile and gentle sway
    FACE_NEUTRAL_BLINK = 1, // Large round-rect eyes with auto-blink & idle glances
    FACE_WINK = 2,          // Asymmetric wink, cheeky smile and a moving sparkle
    FACE_WORRIED = 3,       // Drooping sad eyelids with gentle sweat drop & calm look
    FACE_SLEEPING = 4,      // Closed eyes with animated floating Z z z and breathing mouth
    FACE_SURPRISED = 5,     // Bobbing wide eyes, moving pupils and a pulsing mouth
    FACE_LOVE = 6,
    FACE_DANCE = 7,
    FACE_SIUUU = 8,
    FACE_MAN_UNITED = 9,
    FACE_SIUUU_CHEER = 10,  // Face-only celebration, alongside the full-body scene
    FACE_COOL = 11,
    FACE_LAUGH = 12,
    FACE_STARRY = 13,
    FACE_COUNT = 14
};

class BMOFaceRenderer {
public:
    BMOFaceRenderer();

    // Set active scene; existing face IDs remain stable.
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
    void maximizeScene(Adafruit_SSD1306& oled);
    void renderHappy(Adafruit_SSD1306& oled);
    void renderNeutralBlink(Adafruit_SSD1306& oled);
    void renderWink(Adafruit_SSD1306& oled);
    void renderWorried(Adafruit_SSD1306& oled);
    void renderSleeping(Adafruit_SSD1306& oled);
    void renderSurprised(Adafruit_SSD1306& oled);
    void renderLove(Adafruit_SSD1306& oled);
    void renderDance(Adafruit_SSD1306& oled);
    void renderSiuuu(Adafruit_SSD1306& oled);
    void renderManUnited(Adafruit_SSD1306& oled);
    void renderSiuuuCheer(Adafruit_SSD1306& oled);
    void renderCool(Adafruit_SSD1306& oled);
    void renderLaugh(Adafruit_SSD1306& oled);
    void renderStarry(Adafruit_SSD1306& oled);
    void renderManUnitedStars(Adafruit_SSD1306& oled);

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
    uint8_t _animationFrame;
    uint32_t _sceneStartedAt;

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
