#include "display.h"

BMODisplay display;

BMODisplay::BMODisplay()
    : _oled(OLED_SCREEN_WIDTH, OLED_SCREEN_HEIGHT, &Wire, OLED_RESET_PIN),
      _initialized(false) {}

bool BMODisplay::begin() {
    // Preserve the old ESP32-CAM wiring: GPIO 13 (SDA), GPIO 14 (SCL).
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL, 400000); // 400kHz I2C clock for snappy frame rate

    Serial.printf("[DISPLAY] SDA=%d SCL=%d address=0x%02X\n",
                  PIN_I2C_SDA, PIN_I2C_SCL, OLED_I2C_ADDRESS);
    Wire.beginTransmission(OLED_I2C_ADDRESS);
    if (Wire.endTransmission() != 0) {
        Serial.println("[DISPLAY] No I2C ACK. Check power, SDA/SCL and OLED address (0x3C/0x3D).");
        _initialized = false;
        return false;
    }

    // Wire is already initialized with custom pins; do not initialize it again.
    if (!_oled.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDRESS, true, false)) {
        Serial.printf("[DISPLAY] SSD1306 buffer allocation failed at 0x%02X.\n", OLED_I2C_ADDRESS);
        _initialized = false;
        return false;
    }

    _initialized = true;
    _oled.clearDisplay();
    _oled.setTextColor(SSD1306_WHITE);
    _oled.setTextWrap(false);
    _oled.display();
    Serial.println("[DISPLAY] SSD1306 initialized successfully (128x64).");
    return true;
}

void BMODisplay::clear() {
    if (_initialized) {
        _oled.clearDisplay();
    }
}

void BMODisplay::update() {
    if (_initialized) {
        _oled.display();
    }
}

void BMODisplay::drawProgressBar(int16_t x, int16_t y, int16_t w, int16_t h, float percent) {
    if (!_initialized) return;

    // Constrain percent to [0, 100]
    if (percent < 0.0f) percent = 0.0f;
    if (percent > 100.0f) percent = 100.0f;

    // Draw outer rounded frame
    _oled.drawRoundRect(x, y, w, h, 2, SSD1306_WHITE);

    // Calculate inner fill width
    int16_t innerWidth = (int16_t)(((w - 4) * percent) / 100.0f);
    if (innerWidth > 0) {
        _oled.fillRoundRect(x + 2, y + 2, innerWidth, h - 4, 1, SSD1306_WHITE);
    }
}

void BMODisplay::drawCenteredText(const char* text, int16_t y, uint8_t size, bool highlight) {
    if (!_initialized || !text) return;

    _oled.setTextSize(size);
    int16_t x1, y1;
    uint16_t w, h;
    _oled.getTextBounds(text, 0, y, &x1, &y1, &w, &h);
    int16_t x = (OLED_SCREEN_WIDTH - w) / 2;
    if (x < 0) x = 0;

    if (highlight) {
        _oled.fillRect(x - 2, y - 1, w + 4, h + 2, SSD1306_WHITE);
        _oled.setTextColor(SSD1306_BLACK);
    } else {
        _oled.setTextColor(SSD1306_WHITE);
    }

    _oled.setCursor(x, y);
    _oled.print(text);
    _oled.setTextColor(SSD1306_WHITE); // Reset text color
}

void BMODisplay::drawHeader(const char* title, bool wifiConnected, bool mqttConnected) {
    if (!_initialized) return;

    _oled.setTextSize(1);
    _oled.setTextColor(SSD1306_WHITE);
    _oled.setCursor(0, 0);
    _oled.print(title ? title : "BMO");

    // Wi-Fi Status Glyph / text in top-right
    if (wifiConnected) {
        _oled.drawPixel(114, 4, SSD1306_WHITE);
        _oled.drawFastHLine(113, 2, 3, SSD1306_WHITE);
        _oled.drawFastHLine(112, 0, 5, SSD1306_WHITE);
    } else {
        _oled.setCursor(112, 0);
        _oled.print("xW");
    }

    // MQTT Status Glyph / dot
    if (mqttConnected) {
        _oled.fillCircle(124, 2, 2, SSD1306_WHITE);
    } else {
        _oled.drawCircle(124, 2, 2, SSD1306_WHITE);
    }

    // Header divider line
    _oled.drawFastHLine(0, 9, OLED_SCREEN_WIDTH, SSD1306_WHITE);
}

void BMODisplay::drawBitmap128x64(const uint8_t* bitmap) {
    if (!_initialized || !bitmap) return;
    _oled.drawBitmap(0, 0, bitmap, OLED_SCREEN_WIDTH, OLED_SCREEN_HEIGHT, SSD1306_WHITE);
}

void BMODisplay::showSplashScreen(const char* version) {
    if (!_initialized) return;
    _oled.clearDisplay();

    // Friendly ASCII / Block BMO header
    _oled.setTextSize(2);
    drawCenteredText("B M O", 10, 2);

    _oled.setTextSize(1);
    drawCenteredText("DESK COMPANION", 32, 1);
    drawCenteredText(version ? version : "Ready", 48, 1);

    _oled.display();
}

void BMODisplay::showConnectingScreen(const char* stepName) {
    if (!_initialized) return;
    _oled.clearDisplay();

    _oled.setTextSize(1);
    drawCenteredText("BMO STARTUP", 10, 1);
    drawCenteredText("Connecting...", 26, 1);
    if (stepName) {
        drawCenteredText(stepName, 42, 1, true);
    }

    _oled.display();
}

void BMODisplay::showEndOfListScreen() {
    if (!_initialized) return;
    _oled.clearDisplay();

    // Title box
    _oled.fillRect(0, 0, OLED_SCREEN_WIDTH, 12, SSD1306_WHITE);
    _oled.setTextColor(SSD1306_BLACK);
    _oled.setTextSize(1);
    _oled.setCursor(12, 2);
    _oled.print("ALL PROVIDERS VIEWED");
    _oled.setTextColor(SSD1306_WHITE);

    // End notification icon / message
    drawCenteredText("End of Quota List", 22, 1);
    _oled.drawFastHLine(20, 34, 88, SSD1306_WHITE);

    // Navigation cues for the user
    _oled.setCursor(6, 40);
    _oled.print("[A] Back to BMO Face");
    _oled.setCursor(6, 52);
    _oled.print("Auto return in 3s");

    _oled.display();
}

void BMODisplay::showEmptyQuotaScreen() {
    if (!_initialized) return;
    _oled.clearDisplay();

    drawCenteredText("NO QUOTA CONFIGURED", 14, 1);
    drawCenteredText("Configure in Dashboard", 30, 1);
    drawCenteredText("Returning to face...", 48, 1);

    _oled.display();
}

void BMODisplay::showMessageScreen(const char* title, const char* line1, const char* line2) {
    if (!_initialized) return;
    _oled.clearDisplay();

    if (title) drawCenteredText(title, 8, 1, true);
    if (line1) drawCenteredText(line1, 28, 1);
    if (line2) drawCenteredText(line2, 44, 1);

    _oled.display();
}
