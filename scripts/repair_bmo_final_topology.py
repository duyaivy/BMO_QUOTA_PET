"""FreeCAD MCP remove tangent-only seams exposed by STL validation."""
import Part
import MeshPart
import json
from pathlib import Path
from FreeCAD import Vector as V
ROOT=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET'); OUT=ROOT/'cad/final_print'
doc=App.activeDocument(); body=doc.getObject('BMO_MAIN_BODY')
old=doc.addObject('Part::Feature','Before_Mesh_Topology_Relief'); old.Shape=body.Shape.copy()
doc.getObject('Optimization_History').addObject(old); old.ViewObject.Visibility=False
# Charger shelf touched the lower screw boss tangentially along one edge.
s=body.Shape.cut(Part.makeBox(2.2,21.7,.2,V(-21.1,3.9,32.3)))
# The inherited hip/thigh seam has near-tangent slivers. A local buried blend
# thickens the hip by .1 mm, without changing outer foot bounds or table contact.
for side in (-1,1):
    s=s.fuse(Part.makeCylinder(2.8,1.4,V(side*10,-7.2,3),V(0,1,0)))
body.Shape=s.removeSplitter()
assert body.Shape.isValid() and len(body.Shape.Solids)==1
added=body.Shape.cut(old.Shape)
assert added.cut(Part.makeBox(100,100,106,V(-50,-50,-100))).Volume<1e-6
doc.recompute(); doc.save()
print(json.dumps({'added_low_hip_mm3':added.Volume,'removed_tangent_mm3':old.Shape.cut(body.Shape).Volume,'shape_methods':[n for n in dir(body.Shape) if 'clean' in n.lower() or 'bound' in n.lower()]}))
