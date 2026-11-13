# BMO hardware integration implementation plan

**Goal:** Review and extend the existing accepted BMO assembly for the explicitly
requested hardware, preserving the front, limbs, side lettering and hollow ears.

**Architecture:** Load and back up BMO_FINGERS_FILLED_LEGS_CONCEPT.FCStd. Reuse its
exterior geometry; compare component/connector/service envelopes for A/B/C on
copies, then modify only rear depth and internal fixtures if required. Parameters
and generated audit results travel with the resulting FreeCAD document.

**Execution:** User explicitly requests continuous Inspect → Backup → Analyze →
Model → Optimize → Validate → Export → Report, with placeholders for missing
measurements. Execute inline; independent electrical datasheet research runs in
parallel. Do not claim print readiness from nominal dimensions.

- [x] Inspect and checksum-backup current CAD through FreeCAD MCP; inventory all
  parts, units, bounds and original support/contact geometry.
- [x] Gather manufacturer evidence and identify missing physical dimensions.
- [x] Parameterize battery variants, MT3608, capacitor, charger, switch, wiring,
  mounting and service envelopes. Preserve only two functional switches.
- [x] Compare at least A rear battery, B lower battery, C searched layouts using
  whole-envelope containment, pair clearance, wire/service access and required
  size changes. Record failures and evaluated candidates, not fabricated scores.
- [x] Update on a copy, retain appearance and hollow ears, add rear extension only
  if quantified; separate all new components and brackets for inspection.
- [x] Validate solids, physical/envelope clashes, lid/tool access, button travel,
  nominal wall sections, ear ligaments and static COM with stated mass assumptions.
- [x] Export changed shell/cover/fixtures as prototype STL, validate mesh closure,
  produce requested eight CAD views and editable source/config.
- [x] Write docs/BMO_HARDWARE_FIT_REVIEW.md with evidence, measured CAD results,
  assumptions, unresolved mechanical/electrical risks and one completion status.

## Checks that govern the result

Geometry valid is not sufficient: evaluate populated board thickness including
headers, pack/PCM/wire envelopes, capacitor lead/solder allowances, lid closure,
insertion/tool sweeps and cap actuation. Treat antenna and service spaces as
keep-outs, not physical parts. Preserve ear openings by geometric comparison.
STLs are explicitly prototype artifacts while dimensions remain unverified.
