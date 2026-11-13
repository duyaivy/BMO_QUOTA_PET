# Three fingers and filled upper legs

Reference: image copy 3.png. The visible gap above each horizontal leg was
filled up to the body's bottom Z=7 with a rounded 5.4 mm wide support fused into
that leg. The added volume is about 109.47 / 107.57 mm³ left/right. An interior
2 × 9 × 0.5 mm probe in each former gap is fully contained in its leg. The two
legs remain separate assembly parts; the whole underside is not filled across
the space between the two legs.

Each arm now ends in a small rounded palm and three short capsule-ended fingers.
The center finger extends farther than the two outer fingers. Nominal finger
diameter is 1.1 mm and distal gap is 0.4 mm. All fingers and the palm are fused
into the arm's single solid. These small features need a physical print test
for separation, strength and surface finish before release.

Executed checks: all 26 parts valid, one solid each; 325 pairs, no new physical
overlap >0.001 mm³. Only the existing illustrative OLED overlay intersects its
glass. Both feet and both hand ends retain planar table contacts and no limb
extends below Z=0. Static COM estimate remains inside the support polygon,
about 9.80 mm from its nearest edge, using the prior unmeasured mass assumptions.
This is not a physical stability or joint-strength test. Previous hardware and
fit limitations still apply. No STL exported.

Saved BMO_FINGERS_FILLED_LEGS_CONCEPT.FCStd, fingers-filled-legs-audit.json and
fingers-filled-{bmo,dut,side,front,hand-detail}.png. Hand detail, BMO perspective
and side views were opened and visually inspected.

Rebuild via scripts/bmo_fingers_filled_legs.py, then export views in a separate
FreeCAD MCP call using scripts/preview_bmo_fingers_filled_legs.py. Rebuild closes
the open source without saving its in-memory changes; avoid unsaved manual edits.
