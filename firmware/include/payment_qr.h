#pragma once

#include <Arduino.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// Minimal VietQR (NAPAS IBFT to account) payload for TP Bank STK 90979783396.
// Decoded account matches the owner-supplied TP Bank VietQR screenshot:
//   00020101021138550010A000000727012500069704230111909797833960208QRIBFTTA53037045802VN6304C652
// Version 3 (29x29 modules, EC-L) renders at 2x2 px/module inside a 62x62 white quiet-zone card.
constexpr int kPaymentQrModules = 29;
constexpr int kPaymentQrStride = 4; // ceil(29 / 8) bytes per row, MSB first
constexpr const char* kPaymentBankName = "TP Bank";
constexpr const char* kPaymentAccountLine1 = "9097 9783";
constexpr const char* kPaymentAccountLine2 = "396";
constexpr const char* kPaymentAccountHolder = "QUOC DUY";

static const uint8_t kPaymentQrBits[kPaymentQrModules * kPaymentQrStride] PROGMEM = {
    0xfe, 0x6b, 0xcb, 0xf8, // #######..##.#.####..#.#######
    0x82, 0x46, 0x4a, 0x08, // #.....#..#...##..#..#.#.....#
    0xba, 0xca, 0xba, 0xe8, // #.###.#.##..#.#.#.###.#.###.#
    0xba, 0x53, 0x32, 0xe8, // #.###.#..#.#..##..##..#.###.#
    0xba, 0x2a, 0x6a, 0xe8, // #.###.#...#.#.#..##.#.#.###.#
    0x82, 0x78, 0x32, 0x08, // #.....#..####.....##..#.....#
    0xfe, 0xaa, 0xab, 0xf8, // #######.#.#.#.#.#.#.#.#######
    0x00, 0xc2, 0x38, 0x00, // ........##....#...###........
    0xef, 0xab, 0xde, 0x20, // ###.#####.#.#.####.####...#..
    0x3c, 0x8e, 0x4f, 0xf0, // ..####..#...###..#..########.
    0x12, 0xdb, 0x60, 0x88, // ...#..#.##.##.##.##.....#...#
    0x0c, 0x95, 0x75, 0x50, // ....##..#..#.#.#.###.#.#.#.#.
    0xa3, 0x03, 0x43, 0xd8, // #.#...##......##.#....####.##
    0xbc, 0x55, 0xf5, 0x18, // #.####...#.#.#.#####.#.#...##
    0xca, 0xa2, 0x2a, 0x28, // ##..#.#.#.#...#...#.#.#...#.#
    0xf1, 0x72, 0x3d, 0xa8, // ####...#.###..#...####.##.#.#
    0xe6, 0x03, 0x82, 0xe8, // ###..##.......###.....#.###.#
    0x64, 0x36, 0x2c, 0x70, // .##..#....##.##...#.##...###.
    0x97, 0x2e, 0x12, 0xa8, // #..#.###..#.###....#..#.#.#.#
    0x60, 0x5a, 0x75, 0x50, // .##......#.##.#..###.#.#.#.#.
    0x9b, 0xbf, 0x2f, 0xe8, // #..##.###.######..#.#######.#
    0x00, 0x9e, 0x48, 0x90, // ........#..####..#..#...#..#.
    0xfe, 0xb2, 0xda, 0xc8, // #######.#.##..#.##.##.#.##..#
    0x82, 0xa7, 0x38, 0xa0, // #.....#.#.#..###..###...#.#..
    0xba, 0x8d, 0x8f, 0xf8, // #.###.#.#...##.##...#########
    0xba, 0x77, 0x55, 0x50, // #.###.#..###.###.#.#.#.#.#.#.
    0xba, 0xee, 0xa8, 0xa8, // #.###.#.###.###.#.#.#...#.#.#
    0x82, 0xe5, 0xca, 0x00, // #.....#.###..#.###..#.#......
    0xfe, 0xb0, 0x7e, 0xe8  // #######.#.##.....######.###.#
};

// Draws the crisp 2x2 QR code on a 62x62 white card plus bank name and STK on the right.
template <typename OLED>
inline void renderPaymentQr(OLED& oled) {
    oled.clearDisplay();

    // 1px outer margin keeps the quiet zone clear of enclosure bezels.
    constexpr int kCardX = 1;
    constexpr int kCardY = 1;
    constexpr int kCardSize = 62;
    constexpr int kQrOriginX = 3;
    constexpr int kQrOriginY = 3;
    constexpr int kModuleScale = 2;

    oled.fillRect(kCardX, kCardY, kCardSize, kCardSize, SSD1306_WHITE);
    for (int row = 0; row < kPaymentQrModules; ++row) {
        for (int col = 0; col < kPaymentQrModules; ++col) {
            uint8_t byteVal = pgm_read_byte(&kPaymentQrBits[row * kPaymentQrStride + (col >> 3)]);
            if (byteVal & (0x80u >> (col & 7))) {
                oled.fillRect(kQrOriginX + col * kModuleScale,
                              kQrOriginY + row * kModuleScale,
                              kModuleScale, kModuleScale, SSD1306_BLACK);
            }
        }
    }

    // Bank pill header on the right panel (x=66..125)
    oled.fillRoundRect(66, 3, 60, 13, 2, SSD1306_WHITE);
    oled.setTextSize(1);
    oled.setTextColor(SSD1306_BLACK);
    oled.setCursor(75, 6);
    oled.print(kPaymentBankName);

    oled.setTextColor(SSD1306_WHITE);
    oled.setCursor(67, 20);
    oled.print("STK:");
    oled.setCursor(67, 30);
    oled.print(kPaymentAccountLine1);
    oled.setCursor(67, 40);
    oled.print(kPaymentAccountLine2);

    oled.drawFastHLine(66, 50, 60, SSD1306_WHITE);
    oled.setCursor(67, 54);
    oled.print(kPaymentAccountHolder);
}
