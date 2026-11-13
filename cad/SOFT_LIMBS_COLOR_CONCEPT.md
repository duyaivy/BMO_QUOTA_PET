# Soft limbs and separate color inserts

Request: improve the visibly rigid arms and feet, and allow the small front
controls to have their own filament colors.

## Geometry and appearance

The arm and mitten-style palm now use one non-ruled loft through eleven round
and elliptical sections, rather than a cylindrical arm fused to a separate
flattened palm and bead-like fingers. The shoulder curves outward; the wrist
curves into the hand. The second arm mirrors the first for symmetry. The peg
remains a separate geometric feature fused to the arm solid. A matching larger
loft provides shoulder clearance.

Foot outer edges are filleted by 2.4 mm before trimming the bottom at Z=0. The
leg/foot are still one solid per side. Each sole contacts about 25.39 mm²;
each new palm contacts about 25.81 mm². Arms and feet use Shaded display mode
and finer tessellation; their physical surfaces were also changed. The muted
CAD preview and specular highlights are not a prediction of printed finish.

## Separate colors on a single-color printer

Three separate Part::Feature objects now sit in blind pockets in the shell:

| Part | Color | Locating peg |
| --- | --- | --- |
| Triangle_Cyan | Cyan / turquoise | Ø1.5 mm |
| Upper_Button_Blue | Blue | Ø1.2 mm |
| Small_Button_Green | Green | Ø1.2 mm |

These are fixed cosmetic pieces, not three additional switches. Print each in
its chosen filament and glue into its seat. Nominal radial peg clearance and
pocket end clearance are 0.2 mm. The tiny pegs, feature dimensions and glue fit
need a print coupon before release. The previous yellow and red button caps
remain the two functional caps. BMO/DUT, hollow cat ears and duyaivy remain.

FreeCAD ShapeColor only changes visualization. It does not automatically assign
filaments. Separate STL exports, when authorized for print release, would need
to be made per part/color; conventional STL does not carry these display colors.
An appropriate multi-material workflow can also assign colors/tools to parts:
[Prusa documentation](https://help.prusa3d.com/article/assigning-tools-colors-extruders_124811?product=prusaslicer).
Manual changes are also possible but depend on the layer/toolchange strategy:
[Prusa color changes](https://help.prusa3d.com/article/colorprint-with-the-mmu_124861?product=mmu3).

## Executed checks

20 physical leaf objects, each one valid solid. All 190 pairs checked; no
physical overlap >0.001 mm³. Only the pre-existing display overlay intersects
its glass. All four supports have actual planar contact at Z=0. No limb extends
below the table. Using the same unmeasured mass assumptions as the preceding
study, the COM projection lies within a support polygon sampled from the actual
contact-face edges, about 13.32 mm from its nearest edge. This remains a rigid,
level-surface estimate, not proof of physical stability or joint strength.

Files: BMO_SOFT_LIMBS_COLOR_CONCEPT.FCStd, soft-limbs-color-audit.json and
soft-color-{front,dut,side}.png. Front and DUT images were visually inspected.
No print mesh exported. Electronics dimensions, fastening, strength, print
tolerances and real stability remain subject to the limitations in REVIEW.md
and SEATED_DUYAIVY_CONCEPT.md.

Rebuild with scripts/bmo_soft_limbs_color_concept.py via FreeCAD MCP, then render
in a second call with scripts/preview_bmo_soft_limbs.py. The rebuild closes the
source document without saving its in-memory changes; do not run with manual
unsaved changes to that source.
