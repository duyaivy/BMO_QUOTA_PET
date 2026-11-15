"""FreeCAD MCP replace the inherited closed-band placeholder with an open strap."""
import Part
import json
from pathlib import Path
from FreeCAD import Vector as V
ROOT=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET'); OUT=ROOT/'cad/final_print'
P=json.loads((OUT/'parameters.json').read_text()); rear=P['body_depth']-15
doc=App.activeDocument()
band=Part.makeBox(35,.4,2,V(-16.5,rear-10.9,40))
for x in (-16.5,18.1): band=band.fuse(Part.makeBox(.4,5.6 if x<0 else 7.7,2,V(x,rear-10.9,40)))
o=doc.getObject('Battery_Soft_Retaining_Band'); o.Shape=band.removeSplitter()
o.DimensionEvidence='Open elastic U-strap placeholder; ends bond to tray/lid anchors. No rigid PLA clamp. Adhesion and retention untested.'
assert o.Shape.common(doc.getObject('BMO_BACK_COVER').Shape).Volume<.001
doc.recompute(); doc.save()
print(json.dumps({'valid':o.Shape.isValid(),'lid_overlap_mm3':o.Shape.common(doc.getObject('BMO_BACK_COVER').Shape).Volume,'strap_type':'open U, elastic, not printed'}))
