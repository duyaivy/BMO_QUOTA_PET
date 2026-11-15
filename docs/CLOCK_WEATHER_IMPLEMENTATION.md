# Clock/weather implementation evidence

Approved scope: [implementation plan](superpowers/plans/2026-11-15-clock-weather-on-wake.md) and [design](superpowers/specs/2026-11-15-clock-weather-wake-design.md), 2026-11-15. The user requested two implementation agents (server/web and firmware), with the main agent reviewing and integrating their changes. No deployment, monitor activation, real secret generation or ESP flashing is part of this execution.

## Implemented behavior

- Clock first in the face group: HH:MM, Vietnam UTC+7 weekday/date and static weather icon/temperature; redraw only when displayed values change.
- One network session on boot/button wake, early close after retained config/matching quota/weather; 20-second radio budget. Five idle minutes lead to GPIO-only light sleep. A wake press is consumed through release.
- Owner location selection on `/devices`, trusted Open-Meteo geocoding, persisted revision conflicts and bounded polling; device clock timezone remains UTC+7.
- Authenticated HEAD/GET weather trigger, durable 15-minute due gate, provider cache/fencing, MQTT outbox and retained delivery. Weather validity is 60 minutes from source time, independently of retries.
- Weather remains disabled and the upgraded-device allowlist empty by default. Activation instructions are in [WEATHER_SCHEDULING.md](WEATHER_SCHEDULING.md).

## Verification record

All local verification suites were freshly executed on 2026-11-16 (UTC+7 / Node v24.18.0 / pnpm 11.24.0) with zero regressions:

### 1. Firmware Host Tests & Native Harness (7/7 passed)

```bash
python3 tests/firmware/native/weather_test.py
# Weather parser behavior passed
python3 tests/firmware/native/wake_session_test.py
# Wake session state/deadline behavior passed
python3 tests/firmware/native/buttons_test.py
# Wake press consumption passed
python3 tests/firmware/native/power_test.py
# Inactivity policy behavior passed
python3 tests/firmware/native/clock_test.py
# Clock formatting/dirty render behavior passed
python3 tests/firmware/native/navigation_test.py
# Production navigation: face wrap, quota end/empty return, activity dispatch passed
python3 tests/firmware/native/render_clock.py --preview /tmp/bmo-clock-preview/index.html
# Production clock preview: /tmp/bmo-clock-preview/index.html (4 frames)
```

### 2. PlatformIO Builds (2/2 environments SUCCESS)

```bash
/Users/apple/.platformio/penv/bin/pio run -d firmware -e esp32cam -e esp32cam_bench
# esp32cam:       SUCCESS (RAM: 26.9%, Flash: 57.7%)
# esp32cam_bench: SUCCESS (RAM: 26.7%, Flash: 51.4%)
```

### 3. Web & Server Repository Checks (All passed)

- **Production Build:** `pnpm build` → Next.js 16.4.3 production build succeeded, all dynamic and API routes compiled.
- **Unit & Persistence Tests:** `pnpm test:unit` → 35/35 test files passed (195/195 tests), including weather contracts, locations, provider, settings route, delivery CAS, HTTP HEAD trigger auth, and MQTT outbox drain.
- **Strict TypeScript:** `pnpm typecheck` → Route types generated and strict `tsc --noEmit` clean.
- **ESLint:** `pnpm lint` → Zero errors and zero warnings (`--max-warnings=0`).
- **Prettier:** `pnpm format:check` → All matched files conform to Prettier code style.
- **Integration Tests:** `pnpm test:integration` → 24/24 Playwright tests passed against local production server (including location search/save, 409 revision conflict handling, empty search recovery, and existing quota/status behaviors).
- **Whitespace / Conflict Marker Check:** `git diff --check` → Clean (exit code 0).

### 4. UI Preview Artifacts & Visual Inspection

- **OLED Clock Preview:** `/tmp/bmo-clock-preview/index.html` with 4 pixel-accurate PNG frames (512x256, 4x scaled 128x64 pixels):
  - `leap-midnight.png` (2024-02-29 00:00 leap day rendering, T5 29/02)
  - `new-year-2359-minus-100.png` (2024-12-31 23:59 at -100°C extreme low, snow icon)
  - `new-year-0000-plus-70.png` (2025-01-01 00:00 at +70°C extreme high, clear icon)
  - `unknown-time.png` (Time `--:--`, no fake date or weather when un-synced)
- **Web UI Screenshots:**
  - Desktop: `/tmp/bmo-weather-desktop.png` (1280x1840)
  - Mobile: `/tmp/bmo-weather-mobile.png` (390x2607)

### Baseline collector fixtures

Baseline initially had three date-sensitive collector test failures caused by fixed October capture timestamps expiring against the current wall clock. Only those test fixtures were changed to relative capture times; collector production behavior was preserved. Their focused rerun passed all 15 tests.

## Review and practical limits

The main agent reviewed wire compatibility, retained ordering/recovery, token checks before DB access, concurrent location changes, whole-job deadlines, duplicate retained receipt, fixed firmware packet buffers, button wake consumption and clock layout at temperature extremes.

Host tests and builds cannot measure battery runtime, GPIO12/15 sleep pull-ups, Wi-Fi cutoff timing or blocked TLS worker shutdown on the board. Main turns the radio off at the session deadline; a synchronous in-progress TLS call can take additional time to unwind in the worker. These require the fault/current measurements in [firmware/BENCH_TEST.md](../firmware/BENCH_TEST.md).

Production Vercel/Turso/broker/monitor behavior, actual 15-minute invocations and retained delivery to a physical ESP remain unverified. This report does not mark the earlier phase gates complete.
