#pragma once

#include <Arduino.h>
#include <Adafruit_SSD1306.h>

enum BMOFaceType {
    FACE_HAPPY = 0,         // Broad happy curved smile with ^ ^ eyes
    FACE_NEUTRAL_BLINK = 1, // Classic round dot eyes • • with animated blink
    FACE_WINK = 2,          // Playful winking eye with open smile / tongue
    FACE_WORRIED = 3,       // Drooping sad eyebrows with quivering mouth
    FACE_SLEEPING = 4,      // Closed eyes - - with animated floating Z z z
    FACE_SURPRISED = 5,     // Big round eyes O O with open mouth :O
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

private:
    void renderHappy(Adafruit_SSD1306& oled);
    void renderNeutralBlink(Adafruit_SSD1306& oled);
    void renderWink(Adafruit_SSD1306& oled);
    void renderWorried(Adafruit_SSD1306& oled);
    void renderSleeping(Adafruit_SSD1306& oled);
    void renderSurprised(Adafruit_SSD1306& oled);

    BMOFaceType _currentFace;
    unsigned long _lastAnimationTick;
    uint8_t _animationFrame;
    bool _isBlinking;
    unsigned long _nextBlinkTime;
};

extern BMOFaceRenderer faceRenderer;
