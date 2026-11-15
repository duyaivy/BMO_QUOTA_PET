# BMO final print optimization implementation plan

**Goal:** Modify the existing hardware-integrated assembly through FreeCAD MCP;
reduce depth and printed parts while preserving the accepted character.

**Execution:** Inline, directly authorized by the user's detailed nine-phase
specification and request to select feasible alternatives and perform edits.

**Source:** `cad/hardware_review/BMO_HARDWARE_INTEGRATED.FCStd`.
**Outputs:** `cad/print_shop/` (current delivery), `cad/final_print/` (studies), reproducible FreeCAD scripts under `scripts/`,
and `docs/BMO_FINAL_PRINT_OPTIMIZATION.md`.

- [x] Inspect live and saved assembly, inventory CAD/STL, checksum-backup source.
- [x] Measure front silhouettes and compare at least two button layouts, including
  flanges, stem gaps, guide clearances and switch mounting space.
- [x] Compare at least two populated hardware configurations and several depths;
  preserve hardware shapes, antenna/wire reserves and meaningful wall thickness.
- [x] Modify a copy of the existing shell and cover. Keep construction stages,
  original source and regeneration parameters. Fuse feet/ears/decorations;
  reinforce roots and evaluate integrated arms. Preserve wording; latest user
  override restores the original raised BMO glyphs and feet from LIVE_STATE_BEFORE.
- [x] Update exactly two removable functional caps and their guides/switch seats.
  Minimize fixtures, using integrated rails or lid-mounted seats only when
  actual insertion/removal sweeps remain feasible.
- [x] Check valid single solids, pair intersections, cavity containment, ear bores,
  root continuity, cap travel/stops, retention, assembly sequence and service.
- [x] Export editable CAD, STEP, separate print STL and actual CAD renders. Check
  closed/manifold meshes, orientation and saved/reopened geometry.
- [x] Write measured before/after report; retain DESIGN_REVIEW_REQUIRED whenever
  physical dimensions, print strength or actuation remain unverified.

Checks explicitly distinguish nominal CAD geometry from measured hardware.
No printing, flashing, electrical changes, or later software phases are included.

Final user steering: shift triangle/round controls a further 2 mm right, put the
power switch on the rear, restore the reference feet and O/arm alignment, and
deliver exactly four print parts. The default four-part mechanism uses two
nonprinted FR4 carriers and four M2 fasteners; actual switch attachment and fit
remain subject to measurement/coupon checks. The delivery ZIP contains four STL,
Vietnamese print instructions, mesh results and offline previews.
