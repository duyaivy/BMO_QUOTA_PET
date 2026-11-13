#include "faces.h"

void BMOFaceRenderer::maximizeScene(Adafruit_SSD1306& oled) {
    // Fixed bounds include the whole animation, so the scale/anchor never
    // pumps or follows the eyes as they look around. Reserve one edge pixel.
    struct Bounds { uint8_t x, y, width, height; bool preserveAspect; };
    static constexpr Bounds bounds[] = {
        {17, 10, 99, 42, false},  // Happy
        {10, 10, 107, 45, false}, // Neutral + horizontal sweep
        {10, 8, 109, 48, false},  // Wink
        {12, 2, 111, 53, false},  // Worried + sweat drop
        {20, 2, 99, 52, false},   // Sleeping + drifting Zs
        {7, 7, 112, 53, false},   // Surprise
        {9, 6, 110, 50, false},   // Hearts
        {10, 8, 109, 50, true},   // Dancing BMO
        {3, 0, 107, 60, true},    // Full-body run, jump and landing
        {43, 1, 41, 58, true},    // MU devil silhouette + vertical float
        {27, 1, 76, 55, false},   // Face-only SIUUU
        {12, 9, 105, 49, false},  // Sunglasses + head bob
        {12, 12, 105, 45, false}, // Laughter + tears
        {13, 2, 103, 56, false},  // Pulsing star eyes
    };
    static_assert(sizeof(bounds) / sizeof(bounds[0]) == FACE_COUNT,
                  "Every scene needs a full-cycle layout");
    const Bounds& box = bounds[int(_currentFace)];

    // One reusable 1 KiB scratch buffer, no per-frame heap allocation.
    // SSD1306 uses eight pages of 128 columns, eight vertical bits per byte.
    static uint8_t source[128 * 64 / 8];
    memcpy(source, oled.getBuffer(), sizeof(source));
    oled.clearDisplay();
    int width = 126, height = 62;
    if (box.preserveAspect) {
        if (int(box.width) * height > int(box.height) * width)
            height = int(box.height) * width / box.width;
        else
            width = int(box.width) * height / box.height;
    }
    int left = (128 - width) / 2, top = (64 - height) / 2;
    for (int y = 0; y < height; ++y) {
        int sy = box.y + y * box.height / height;
        for (int x = 0; x < width; ++x) {
            int sx = box.x + x * box.width / width;
            if (source[(sy / 8) * 128 + sx] & (1u << (sy % 8)))
                oled.drawPixel(left + x, top + y, SSD1306_WHITE);
        }
    }
}
