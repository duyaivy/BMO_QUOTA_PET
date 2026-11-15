"""FreeCAD MCP local service relief; only removes an obstructing seat corner."""
import Part
import json
from FreeCAD import Vector as V
doc=App.activeDocument(); body=doc.getObject('BMO_MAIN_BODY')
old=doc.addObject('Part::Feature','Before_Switch_Seat_Clearance')
old.Shape=body.Shape.copy(); doc.getObject('Optimization_History').addObject(old)
old.ViewObject.Visibility=False
body.Shape=body.Shape.cut(Part.makeBox(1.5,9,.8,V(17.5,12.5,41.2))).removeSplitter()
assert body.Shape.isValid() and len(body.Shape.Solids)==1
assert body.Shape.cut(old.Shape).Volume<1e-6
doc.recompute(); doc.save()
print(json.dumps({'removed_mm3':old.Shape.Volume-body.Shape.Volume,'valid':body.Shape.isValid(),'solids':len(body.Shape.Solids)}))
