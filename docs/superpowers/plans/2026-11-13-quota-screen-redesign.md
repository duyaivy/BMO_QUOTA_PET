# Quota Screen UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the BMO firmware Quota view on the 128x64 OLED to match the 2-card usage dashboard reference with provider icons (Codex, Claude, Gemini), remaining quota percentage, progress bars, and "Resets in Xh Ym" countdowns, removing obsolete `[STALE]` and button hints.

**Architecture:** Group quota snapshot windows by provider (`codex`, `claude`, `antigravity`/`gemini`). Display provider-specific pixel art icons and provider name in the header. Render 2 cards per screen when multiple windows exist (e.g. Primary 5h and Secondary Weekly for Codex/Claude), or 1 centered card when a single window exists. Compute live countdown to `resetAt` using SNTP UTC time.

**Tech Stack:** C++11, Arduino ESP32 core, Adafruit SSD1306 (128x64 monochrome OLED), Adafruit GFX, PlatformIO.

**Spec:** Redesign specification aligned with user image:
- Top bar: Provider icon (Codex, Claude, Gemini) + Provider Name + Wi-Fi & MQTT status indicators.
- Codex screen: Card 1 = Primary (5h) with "Current" badge; Card 2 = Secondary (7d) with "Weekly" badge.
- Claude screen: Card 1 = Five Hour (5h) with "Current" badge; Card 2 = Seven Day (7d) with "Weekly" badge.
- Gemini / Generic screen: Model window(s) with corresponding label badge.
- Remaining %: display `remainingPercent` (or `100 - usedPercent`), rounded to nearest integer.
- Progress bar: rounded horizontal bar representing remaining %.
- Countdown: "Resets in Xh Ym" or "Resets in Xd Yh" computed from `resetAt` ISO timestamp vs current UTC epoch.
- Clean layout: Remove `[STALE]` text and `[A]Face [B]Next Quota` hints.

## Global Constraints
- Target hardware: ESP32-CAM / ESP32 Generic with SSD1306 128x64 I2C OLED (`0x3C`).
- Must compile cleanly with PlatformIO (`~/.platformio/penv/bin/pio run -e esp32cam`).
- Memory safe: no heap thrashing in the rendering loop; keep buffers stack-allocated.

## Review Focus
1. When time is not synced (`time(nullptr) < 1700000000`), countdown falls back gracefully to `windowDurationSeconds` ("Window: 5h" / "Window: 7d") without crashing or displaying bogus dates.
2. When a provider has only 1 window in snapshot, renderer formats a single well-spaced card instead of drawing empty or overlapped second card.
3. When `remainingPercent` is negative or null, renderer calculates from `100.0f - usedPercent` or displays `---%` if both are null.
4. Button B navigation cycles through unique providers rather than repeating the same provider if multiple windows were configured in `_config.screens`.
5. Display coordinates strictly fit inside 128x64 boundary without overflow: Card 1 (y: 12..36), Card 2 (y: 38..62).

---

### Task 1: Provider Icon Bitmaps & Display Helpers

**Files:**
- Modify: `firmware/include/display.h`
- Modify: `firmware/src/display.cpp`

**Interfaces:**
- Produces: `void BMODisplay::drawProviderIcon(const char* providerId, int16_t x, int16_t y);`
- Produces: Bitmaps for `CODEX_ICON_10x10`, `CLAUDE_ICON_10x10`, `GEMINI_ICON_10x10`.

- [ ] **Step 1: Define icon bitmaps in `include/display.h`**
Add 10x10 monochrome bitmap byte arrays for Codex, Claude, and Gemini, and declare `drawProviderIcon(const char* providerId, int16_t x, int16_t y)`.

- [ ] **Step 2: Implement `drawProviderIcon` in `src/display.cpp`**
Implement the method to draw the appropriate bitmap using `_oled.drawBitmap(x, y, bitmap, 10, 10, SSD1306_WHITE)`.

- [ ] **Step 3: Test compilation**
Run: `~/.platformio/penv/bin/pio run -e esp32cam`
Expected: SUCCESS

---

### Task 2: Provider Grouping in `BMOMqttClient`

**Files:**
- Modify: `firmware/include/mqtt_client.h`
- Modify: `firmware/src/mqtt_client.cpp`

**Interfaces:**
- Produces: `uint8_t BMOMqttClient::getUniqueQuotaProviderCount() const;`
- Produces: `const char* BMOMqttClient::getUniqueQuotaProviderAt(uint8_t index) const;`
- Produces: `uint8_t BMOMqttClient::getProviderWindows(const char* providerId, const SnapshotWindow* outWindows[2]) const;`

- [ ] **Step 1: Declare helper methods in `include/mqtt_client.h`**
Add `getUniqueQuotaProviderCount()`, `getUniqueQuotaProviderAt(uint8_t index)`, and `getProviderWindows(...)`.

- [ ] **Step 2: Implement provider grouping in `src/mqtt_client.cpp`**
- `getUniqueQuotaProviderCount()`: iterates over `_config.screens` (or fallback to `_snapshot.windows`) and returns count of distinct `providerId`s.
- `getUniqueQuotaProviderAt(index)`: returns the `providerId` of the N-th distinct provider.
- `getProviderWindows(providerId, outWindows[2])`: searches `_snapshot.windows` for windows belonging to `providerId`. Sorts so primary/5h is `outWindows[0]` and secondary/week is `outWindows[1]`. Returns the number of found windows (0, 1, or 2).

- [ ] **Step 3: Test compilation**
Run: `~/.platformio/penv/bin/pio run -e esp32cam`
Expected: SUCCESS

---

### Task 3: ISO 8601 UTC Countdown & Quota Card Renderer

**Files:**
- Modify: `firmware/include/quota_renderer.h`
- Modify: `firmware/src/quota_renderer.cpp`

**Interfaces:**
- Produces: `static void formatResetCountdown(const char* resetAtStr, int32_t fallbackWindowSeconds, char* outBuf, size_t bufSize);`
- Produces: `void renderQuotaCard(int16_t y, int16_t h, const SnapshotWindow* sw, const char* defaultBadge);`
- Modifies: `BMOQuotaRenderer::renderQuotaScreen(uint8_t providerIndex, bool wifiConnected, bool mqttConnected);`

- [ ] **Step 1: Implement countdown formatter in `src/quota_renderer.cpp`**
Parse ISO 8601 string `YYYY-MM-DDTHH:MM:SS` using `sscanf`, convert to epoch with `timegm(&t)` (or manual UTC conversion), compare with `time(nullptr)`. Output `"Resets in Xh Ym"` or `"Resets in Xd Yh"`. Fallback to `"Window: Xh Ym"` or `"Resets soon"`.

- [ ] **Step 2: Implement card renderer `renderQuotaCard`**
Draws:
- Outer rounded rect: `_oled.drawRoundRect(0, y, 128, h, 3, SSD1306_WHITE)`
- Row 1: Left: percentage text `XX%` (or `---%`); Right: pill badge `[Current]`, `[Weekly]`, or custom label with rounded border.
- Row 2: Progress bar: `display.drawProgressBar(4, y + 11, 120, 4, remainingPercent)`
- Row 3: Countdown string: `Resets in ...` at `y + 17`.

- [ ] **Step 3: Implement full screen layout in `renderQuotaScreen`**
- Header: Provider Icon at (x=1, y=0), Provider Name ("Codex", "Claude", "Gemini") at (x=15, y=2), Wi-Fi & MQTT indicators at top right.
- Fetch up to 2 windows for this provider via `mqttClient.getProviderWindows()`.
- If 2 windows: Render Card 1 at `y = 12, h = 25` and Card 2 at `y = 38, h = 25`.
- If 1 window: Render Card at `y = 14, h = 48` (larger text and progress bar).
- If 0 windows: Render awaiting snapshot card.
- Remove old `[STALE]` badge and button hints `[A]Face  [B]Next Quota`.

- [ ] **Step 4: Test compilation**
Run: `~/.platformio/penv/bin/pio run -e esp32cam`
Expected: SUCCESS

---

### Task 4: Navigation Integration & Verification

**Files:**
- Modify: `firmware/src/navigation.cpp`

**Interfaces:**
- Consumes: `mqttClient.getUniqueQuotaProviderCount()`
- Consumes: `quotaRenderer.renderQuotaScreen(quotaIndex, wifi, mqtt)`

- [ ] **Step 1: Update navigation to use unique provider count in `src/navigation.cpp`**
Replace `mqttClient.getQuotaScreenCount()` with `mqttClient.getUniqueQuotaProviderCount()` so pressing Button B cycles across providers (e.g. Codex -> Claude -> Gemini -> End of List).

- [ ] **Step 2: Build firmware binary**
Run: `~/.platformio/penv/bin/pio run -e esp32cam`
Expected: SUCCESS with clean memory footprint and 0 errors.

- [ ] **Step 3: Document flash/upload command for user**
Provide the command to upload the built binary to the ESP32:
`~/.platformio/penv/bin/pio run -e esp32cam -t upload`
along with port discovery / tips.
