"""FreeCAD MCP read-only audit of rear screw bores and receiving material."""
import json
import math
from pathlib import Path
import Part
from FreeCAD import Vector as V

out = Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET/cad/print_shop/simple_back')
doc = App.openDocument(str(out / 'BMO_SIMPLE_BACK.FCStd'))
body = doc.getObject('BMO_MAIN_BODY').Shape
lid = doc.getObject('BMO_BACK_COVER').Shape
def cylinder(r, y, length, x, z):
    return Part.makeCylinder(r, length, V(x, y, z), V(0, 1, 0))
rows = []
for x, z in [(-20,30), (20,30), (-21.5,69), (21.5,69)]:
    pilot = cylinder(.84, 24, 6, x, z)
    ring = cylinder(1.8,24,6,x,z).cut(cylinder(.95,24,6,x,z))
    receiving = body.common(ring).Volume
    cap = cylinder(1.14,30.25,2.75,x,z)
    line = Part.makeLine(V(x,0,z),V(x,34,z))
    sample = []
    for y in (12,18,24,28,29.5):
        r = cylinder(1.8,y,.2,x,z).cut(cylinder(.95,y,.2,x,z))
        sample.append({'y':y,'ring_fill_fraction':round(body.common(r).Volume/r.Volume,4)})
    rows.append({'axis_xz': [x,z], 'pilot_core_obstruction_mm3':round(body.common(pilot).Volume,6),
                 'receiving_ring_fill_fraction_last_6mm':round(receiving/ring.Volume,4),
                 'lid_clearance_core_obstruction_mm3':round(lid.common(cap).Volume,6),
                 'solid_on_center_axis_mm':round(body.common(line).Length,4),
                 'receiving_sections':sample})
(out/'rear-screw-audit.json').write_text(json.dumps(rows,indent=2))
print(json.dumps(rows))
