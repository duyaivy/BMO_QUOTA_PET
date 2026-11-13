# Vertical BMO / DUT and simple arms

User reference: image copy 2.png. The previous mitten-shaped hand was rejected.
This concept uses a uniform Ø3.2 mm round arm swept along a single cubic Bézier,
with a rounded end and no separate palm, finger beads or paddle. The tip is
trimmed at Z=0 to retain a small planar table contact. Two arms mirror each other.
The centerline extends from X=±24.4, Y=0, Z=29 to X=±29.8, Y=8, Z=1 mm.

The previous horizontal labels are removed. Separate black letters now read
top-to-bottom, with each glyph upright:

- Left: B at Z=50, M at Z=37, O at Z=24 mm, actual glyph height 10 mm each.
  The O center is Z=29, on the shoulder axis. A Ø3.2 mm cylindrical gauge along
  the shoulder axis has zero overlap with the O strokes, and the arm also has
  no geometric overlap with the letter. The arm visibly exits the O counter.
- Right: D at Z=59, U at Z=46, T at Z=33 mm. This column ends above the opposite
  shoulder, preserving the T stroke. The right arm is not claimed to exit T.

Letters project 0.65 mm and are individual black print/glue pieces touching the
side wall. Bond strength, print readability and assembly are not validated.
Unlike a rotated wordmark, the glyphs themselves remain upright; this is the
chosen interpretation of the requested vertical column.

Executed checks: 26 valid single-solid parts, all 325 pairs checked. Only the
existing illustrative OLED overlay intersects the glass. No physical overlap
>0.001 mm³. Both soles retain about 25.39 mm² planar contact; arm tips have about
4.9 mm² each. No limb extends below Z=0. Static COM estimate lies inside the
support polygon, nearest edge about 9.75 mm away, using unmeasured component
mass assumptions from the preceding study. This does not establish real tip
resistance, arm stiffness or joint strength; the small arm-tip contacts need
physical testing. All earlier electronics and fit limitations still apply.

Files: BMO_VERTICAL_LETTERS_SIMPLE_ARMS.FCStd,
vertical-letters-simple-arms-audit.json, vertical-front.png, vertical-bmo.png,
vertical-dut.png, vertical-bmo-side.png, vertical-dut-side.png. The BMO/DUT
perspective images were visually inspected. Earlier variants are preserved.
Colored cosmetic inserts, hollow ears, seated feet and duyaivy are retained.
No STL released.

Rebuild: scripts/bmo_vertical_letters_simple_arms.py through FreeCAD MCP, then
scripts/preview_bmo_vertical_letters.py in a second call. Rebuild closes an open
source document without saving its in-memory changes; do not run if manual
unsaved source edits need to be retained.
