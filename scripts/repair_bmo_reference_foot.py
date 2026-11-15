"""FreeCAD MCP heal the mirrored reference BRep without redrawing its exterior."""
import Part
import json
from pathlib import Path
from FreeCAD import Vector as V
ROOT=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET'); OUT=ROOT/'cad/print_shop'
target=App.activeDocument()
src=App.openDocument(str(ROOT/'cad/final_print/LIVE_STATE_BEFORE.FCStd'))
o=src.getObject('BMO_Sitting_Leg_Right'); original=o.Shape.copy()
folder=OUT/'reference'; folder.mkdir(exist_ok=True)
Part.export([o],str(folder/'LIVE_RIGHT_FOOT.step'))
App.closeDocument(src.Name); App.setActiveDocument(target.Name)
joint=Part.makeCylinder(2.6,3.4,V(10,-7,6.8),V(0,0,1))
base=target.getObject('Before_Live_Style_Restore').Shape.copy()
base=base.cut(Part.makeBox(10,26,8.2,V(5,-27,-1))).fuse(joint)
variants=[('original',original.copy()),('step_roundtrip',Part.read(str(folder/'LIVE_RIGHT_FOOT.step')))]
rebuilt=Part.Solid(Part.Shell(original.Faces)); rebuilt.fix(1e-6,1e-7,.001)
variants.append(('rebuilt_shell',rebuilt))
results=[]
for name,s in variants:
    combined=base.fuse(s).removeSplitter()
    r={'variant':name,'input_orientation':s.Orientation,'volume':s.Volume,'valid':s.isValid(),'solids':len(s.Solids),'combined_volume':combined.Volume,'combined_valid':combined.isValid(),'combined_solids':len(combined.Solids)}
    results.append(r)
    if combined.isValid() and len(combined.Solids)==1 and combined.Volume>30000:
        s.exportBrep(str(folder/'LIVE_RIGHT_FOOT_HEALED.brep'))
        r['selected']=True
        break
(OUT/'reference-foot-healing.json').write_text(json.dumps(results,indent=2))
print(json.dumps(results))
