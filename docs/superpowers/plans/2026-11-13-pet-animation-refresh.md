# OLED pet animation refresh

**Goal:** Refresh the waiting/home presentation, distinguish face 3 from face 2,
animate face 6, and add Love, Dance, Ronaldo SIUUU and Manchester United scenes.

**Design:** Keep the existing C++/Adafruit GFX procedural drawing on the 128×64
monochrome display. Preserve the first six face IDs and append four scenes.
Use a 3.6-second, nonblocking animation timeline, restarting on face selection.
Use small temporary navigation dots instead of permanent page text. The new
wink has asymmetric eyes and a sparkle; surprise bounces and looks around.
SIUUU has a run-up, jump/turn and wide landing; MU uses a simplified ship/devil
crest with moving sparkles. Love pulses hearts and Dance moves a full-body BMO.

**Approach:** Procedural graphics fit the established renderer, avoid large
sprite assets and allow crisp monochrome movement. Raster sprite sheets add
storage and conversion overhead; web/CSS animation does not run on this device.
These visual details are implementation choices under the user's request to
create additional animations. Waiting-screen interpretation is pending the
optional clarification; default is the pet/home screen.

**Constraints:** Scope is existing Phase 4C rendering. No protocol, credentials,
quota ordering, hardware pins, deployment or flashing changes. Retain OLED sleep.
No new runtime dependencies; no delay or heap allocation in frame rendering.

## Implementation and validation

- [x] Add host rendering regression tests using production faces.cpp and actual
  Adafruit GFX rasterization, replacing only Arduino time and OLED transport.
- [x] Verify the current surprise lacks motion, then add the refreshed scenes,
  deterministic restart timing and transient navigation dots.
- [x] Exercise the real face cycle in the native renderer test; update navigation
  adapters and the legacy simulator to ten scenes, plus firmware documentation.
- [x] Export pixel-accurate animated preview and inspect all ten scenes.
- [x] Run host rendering/navigation tests and firmware contract tests; compile
  esp32cam and esp32cam_bench. Report host versus hardware evidence separately.

## Review focus

Face changes must reset animation timing; face 10 must fit the display; motion
must survive timer wrap; a long suspension must not trigger catch-up loops;
new scenes must not affect A/B navigation, MQTT servicing or OLED sleep.

## Verification record

- Native regression initially failed because face 6 had no visible motion.
- Native rendering now passes motion, distinct eye silhouette, ten-scene wrap,
  restart, timer overflow and long-suspension checks using real Adafruit GFX.
- Native navigation tests pass; firmware contract tests: 7 passed.
- Both PlatformIO targets `esp32cam` and `esp32cam_bench` build successfully.
  Existing ArduinoJson `containsKey` deprecation warning remains unrelated.
- Inspected all ten rendered scenes in the animated HTML contact sheet.
- Independent read-only code review found no actionable issues.
- Physical OLED performance and live MQTT during animation remain unverified;
  no firmware was flashed. Scope remains existing Phase 4C UI work.

## Follow-up: face-only SIUUU

User requested an additional eyes-and-mouth-only celebration, keeping the
full-body Ronaldo scene. Append scene 11 without changing the first ten IDs.
Use inhale → bouncing squeezed eyes / pulsing shouting mouth with SIUUU text
→ relaxed smile on the existing nonblocking timeline. No audio hardware is used.
Validate selection, animation, restart/wrap, navigation, and both firmware builds.
MU replacement is pending: the referenced image was not attached to the received
message; keep the existing crest until the reference is available.

## Follow-up: eye sweeps and supplied MU artwork

The owner supplied `image copy 2.png`: the Red Devil / trident mark on fabric.
Replace the procedural full crest with a monochrome conversion of that exact
foreground, keeping gentle float/sparkles. Store the compact PROGMEM asset in
`firmware/include/man_united_devil.h`; leave the original reference untouched.
Face 2 and 4 now sweep horizontally on the shared 3.6-second clock, with 12px
and 9px amplitudes respectively, retaining existing eye geometry/easing.
The new native pixel regression failed on the old idle-only behavior and passes
with both faces visibly reaching left and right.

Validation for this follow-up: native rendering and navigation passed; all seven
firmware contract tests passed; both PlatformIO targets compiled successfully.
Visually inspected the new 41×56 bitmap from the supplied reference in the OLED
preview. No firmware was flashed and no physical verification is claimed.

## Follow-up: maximize icons for the printed enclosure

User requests the largest possible icons. Fit fixed per-animation source bounds
to a 126×62 viewport; keep a one-pixel edge margin and remove navigation dots.
Face art fills the width/height independently; full-body BMO/Ronaldo and MU retain
proportions. Remove the MU sparkles so the silhouette controls the scale.
Use a static 1024-byte SSD1306-format scratch buffer; no per-frame allocations.
Reset eye geometry on scene entry to prevent inherited coordinates from being
cropped by the larger layout. Host checks cover all 121 face transitions,
viewport occupancy, edge margins, movement, restart and timer wrap.
Physical fit within the printed opening still depends on the enclosure dimensions.

## Follow-up: three more scenes and moving MU stars

Append Cool/Shades, Laugh/Happy Tears and Starry/Wow as scenes 12–14. Keep the
existing IDs and large viewport. Add four drifting, twinkling stars to the MU
scene **after** its portrait enlargement so the logo retains its full height.
Stars stay in the side margins and never obscure the central silhouette.
Use the shared nonblocking 3.6-second timeline; no extra runtime dependencies.
Validate star motion/unchanged logo height, new selection and cycle, all 196
scene transitions, restart/wrap, frame margins and large viewport occupancy.
Then visually inspect, build and upload under the owner's existing authorization.
