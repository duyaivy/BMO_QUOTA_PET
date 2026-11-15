"""FreeCAD MCP: replace legacy half-mm tray webs with three-line nominal webs."""
import Part
import json
from pathlib import Path
from FreeCAD import Vector as V
ROOT=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET'); OUT=ROOT/'cad/final_print'
P=json.loads((OUT/'parameters.json').read_text()); rear=P['body_depth']-15
doc=App.activeDocument(); cover=doc.getObject('BMO_BACK_COVER')
old=doc.addObject('Part::Feature','Before_Tray_Reinforcement'); old.Shape=cover.Shape.copy()
doc.getObject('Optimization_History').addObject(old); old.ViewObject.Visibility=False
pieces=[]
for x in (-15.5,16.3): pieces.append(Part.makeBox(1.2,7,50,V(x,rear-P['battery_rear_offset']-.8,10.5)))
ey=4+P['esp_shift_y']
for x in (-15.7,16.3): pieces.append(Part.makeBox(1.2,rear-2.5-(ey-2),1.2,V(x,ey-2,28.1)))
cover.Shape=cover.Shape.multiFuse(pieces).removeSplitter()
assert cover.Shape.isValid() and len(cover.Shape.Solids)==1
assert cover.Shape.common(doc.getObject('Battery_LiPo_503048').Shape).Volume<.001
doc.recompute(); doc.save()
print(json.dumps({'added_mm3':cover.Shape.Volume-old.Shape.Volume,'tray_wall_mm':1.2,'nominal_lateral_cell_clearance_mm':.3,'status':'DESIGN_REVIEW_REQUIRED — actual pack dimensions unmeasured'}))
