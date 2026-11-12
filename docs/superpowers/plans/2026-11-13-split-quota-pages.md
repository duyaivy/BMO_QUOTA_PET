# Split Quota Windows Into Dedicated Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate multi-window quota providers (e.g. Codex Primary and Secondary) into dedicated full-height pages using the 1-card layout (prominent font size 2 for %, pill badge with "5h" for primary and "Weekly" for secondary, 6px progress bar, and reset countdown), and cycle sequentially with Button B.

**Architecture:** Extend `BMOMqttClient` to enumerate individual quota pages across unique providers and windows (`getTotalQuotaPages()` and `getQuotaPage()`). Update `BMONavigationController` to paginate across all quota window pages. Standardize `BMOQuotaRenderer::renderQuotaScreen()` to render each quota page using the full-height card layout with right-aligned pill badges ("5h" for primary window, "Weekly" for secondary window).

**Tech Stack:** C++11, Arduino ESP32 core, Adafruit SSD1306 (128x64 monochrome OLED), Adafruit GFX, PlatformIO.

**Spec:** User direction and feedback:
- Split Codex (and multi-window providers) into 2 separate pages instead of cramming two 25px cards onto one screen.
- First page (primary): pill badge displays "5h".
- Second page (secondary): pill badge displays "Weekly".
- Single window providers (e.g. Gemini 5h): maintain the 1-card full-height layout with badge "5h".
- Navigation: Button B cycles through all quota pages: Codex (5h) -> Codex (Weekly) -> Gemini (5h) -> End of List.

## Global Constraints
- Target hardware: ESP32-CAM / ESP32 Generic with SSD1306 128x64 I2C OLED (`0x3C`).
- Memory safe: stack-allocated buffers only; no dynamic allocations or heap thrashing in the render loop.
- Compile cleanly with PlatformIO (`~/.platformio/penv/bin/pio run -e esp32cam`).
- Keep display within (0..127, 0..63) coordinate bounds without clipping or overflow.

## Review Focus
1. When Codex has 2 windows ("Primary" and "Secondary"), `getTotalQuotaPages()` returns 2 (or 3 when Gemini is also present), and `getQuotaPage()` yields badge "5h" for page 0 and "Weekly" for page 1.
2. When Gemini has only 1 window ("5h"), it renders exactly 1 page with badge "5h" and does not create an empty second page.
3. When Button B is pressed on the last quota page, it cleanly navigates to `END_OF_LIST`, and pressing Button B again loops back to page 0.
4. When `SnapshotWindow` has negative or missing `remainingPercent`, percentage falls back to `100.0f - usedPercent` or `---%` without crashes.
5. All badge pill rectangles fit cleanly inside the 128x64 screen boundaries with text centered or neatly padded.

---

### Task 1: Add Quota Page Helpers in `BMOMqttClient`

**Files:**
- Modify: `include/mqtt_client.h`
- Modify: `src/mqtt_client.cpp`

**Interfaces:**
- Produces: `uint8_t BMOMqttClient::getTotalQuotaPages() const;`
- Produces: `bool BMOMqttClient::getQuotaPage(uint8_t pageIndex, const char** outProviderId, const SnapshotWindow** outWindow, const char** outDefaultBadge) const;`

- [ ] **Step 1: Declare page helpers in `include/mqtt_client.h`**
Add declarations for `getTotalQuotaPages()` and `getQuotaPage(uint8_t pageIndex, const char** outProviderId, const SnapshotWindow** outWindow, const char** outDefaultBadge) const` to `BMOMqttClient`.

- [ ] **Step 2: Implement page helpers in `src/mqtt_client.cpp`**
- `getTotalQuotaPages()`: Iterates through each unique provider from `collectUniqueProviders`. Calls `getProviderWindows(pid, windows)`. If `winCount == 0`, adds 1 (for empty/awaiting screen). Otherwise adds `winCount`.
- `getQuotaPage(pageIndex, ...)`: Traverses providers and their windows to find the item corresponding to `pageIndex`. Sets `outProviderId` to provider ID, `outWindow` to the matching `SnapshotWindow*`, and `outDefaultBadge` to `"5h"` for window index 0 and `"Weekly"` for window index 1 (or label fallback).

- [ ] **Step 3: Compile and verify**
Run: `~/.platformio/penv/bin/pio run -e esp32cam`
Expected: SUCCESS

- [ ] **Step 4: Commit**
```bash
git add include/mqtt_client.h src/mqtt_client.cpp
git commit -m "feat(mqtt): add getTotalQuotaPages and getQuotaPage helpers"
```

---

### Task 2: Update Navigation Controller to Paginate by Quota Page

**Files:**
- Modify: `src/navigation.cpp`

**Interfaces:**
- Consumes: `mqttClient.getTotalQuotaPages()` from Task 1.
- Modifies: `BMONavigationController::update()`, `BMONavigationController::handleButtonB()`, and `BMONavigationController::render()`.

- [ ] **Step 1: Update `navigation.cpp` to use `getTotalQuotaPages`**
Replace `mqttClient.getUniqueQuotaProviderCount()` in `BMONavigationController::update()` and `handleButtonB()` with `mqttClient.getTotalQuotaPages()`.
- When transitioning from `PET_FACE` to `QUOTA_VIEW`: set `_quotaIndex = 0`.
- In `QUOTA_VIEW`: increment `_quotaIndex++`. If `_quotaIndex >= totalPages`, transition to `UIMode::END_OF_LIST`.
- In `END_OF_LIST`: if Button B pressed, reset `_quotaIndex = 0` and switch to `UIMode::QUOTA_VIEW`.

- [ ] **Step 2: Compile and verify**
Run: `~/.platformio/penv/bin/pio run -e esp32cam`
Expected: SUCCESS

- [ ] **Step 3: Commit**
```bash
git add src/navigation.cpp
git commit -m "feat(nav): paginate by quota window page instead of provider"
```

---

### Task 3: Redesign Quota Renderer to Full-Height Single Card Per Page

**Files:**
- Modify: `include/quota_renderer.h`
- Modify: `src/quota_renderer.cpp`

**Interfaces:**
- Consumes: `mqttClient.getTotalQuotaPages()`, `mqttClient.getQuotaPage(...)`
- Modifies: `BMOQuotaRenderer::renderQuotaScreen(uint8_t pageIndex, bool wifiConnected, bool mqttConnected)`

- [ ] **Step 1: Update `renderQuotaScreen` signature & interface in `include/quota_renderer.h`**
Update comment/parameter name from `providerIndex` to `pageIndex`.

- [ ] **Step 2: Implement full-height 1-card render in `src/quota_renderer.cpp`**
- Query `pageIndex` using `mqttClient.getQuotaPage(pageIndex, &providerId, &sw, &defaultBadge)`.
- Render top header (y=0..10): provider icon bitmap, provider display name ("Codex", "Gemini", "Claude"), WiFi indicator, MQTT dot indicator, horizontal divider line.
- If `sw == nullptr`: render rounded card at (0, 14, 128, 48) with centered "Awaiting quota data...".
- If `sw != nullptr`: render rounded card at (0, 14, 128, 48):
  - Row 1: Left: TextSize 2 remaining percentage (`95%`, `---%`). Right: right-aligned pill badge (e.g. `[5h]`, `[Weekly]`) drawn with rounded rect border.
  - Row 2: Progress bar at `(6, 38, 116, 6)` showing `remainingPercent`.
  - Row 3: TextSize 1 countdown string at `(6, 48)` (e.g. `"Resets in 3h 24m"` or `"Resets in 5d 14h"`).
- Remove obsolete 2-card splitting (`renderQuotaCard` at y=12 and y=38).

- [ ] **Step 3: Compile and verify firmware binary**
Run: `~/.platformio/penv/bin/pio run -e esp32cam`
Expected: SUCCESS with zero compilation errors and clean link.

- [ ] **Step 4: Commit**
```bash
git add include/quota_renderer.h src/quota_renderer.cpp
git commit -m "feat(quota): render each window as dedicated full-height card with 5h/Weekly badges"
```
