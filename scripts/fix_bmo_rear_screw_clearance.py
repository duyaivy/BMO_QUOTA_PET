"""FreeCAD MCP: clear all four rear screw passages without moving components."""
import json
from pathlib import Path
import Part
import MeshPart
from FreeCAD import Vector as V
out = Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET/cad/print_shop/simple_back')
doc = App.openDocument(str(out/'BMO_SIMPLE_BACK.FCStd'))
cover = doc.getObject('BMO_BACK_COVER')
lid = cover.Shape.copy()
for x,z in [(-20,30),(20,30),(-21.5,69),(21.5,69)]:
    lid = lid.cut(Part.makeCylinder(1.15,4,V(x,30,z),V(0,1,0)))
    lid = lid.cut(Part.makeCylinder(2.1,1.05,V(x,32,z),V(0,1,0)))
assert lid.isValid() and len(lid.Solids)==1
cover.Shape = lid
doc.recompute()
doc.save()
mesh = MeshPart.meshFromShape(Shape=lid,LinearDeflection=.08,AngularDeflection=.18,Relative=False)
mesh.write(str(out/'BMO_BACK_COVER.stl'))
Part.export([cover],str(out/'BMO_BACK_COVER.step'))
report = json.loads((out/'revision-report.json').read_text())
report['parts']['BMO_BACK_COVER']['volume_mm3'] = lid.Volume
report['rear_screws']={'lid_clearance_diameter_mm':2.3,'head_recess_diameter_mm':4.2,'head_recess_depth_mm':1,'receiving_pilot_nominal_diameter_mm':1.7}
(out/'revision-report.json').write_text(json.dumps(report,indent=2))
Part.export([doc.getObject(n) for n in report['parts']],str(out/'BMO_PRINT_ASSEMBLY.step'))
print('Saved four clear rear screw passages, CAD and STEP/STL updated')
