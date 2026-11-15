"""FreeCAD MCP read-only diagnosis of each Boolean stage in the style restore."""
import Part
import json
from pathlib import Path
from FreeCAD import Vector as V
ROOT=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET')
target=next(d for d in App.listDocuments().values() if d.FileName==str(ROOT/'cad/print_shop/BMO_PRINT_SHOP.FCStd'))
src=App.openDocument(str(ROOT/'cad/final_print/LIVE_STATE_BEFORE.FCStd'))
source_shapes={n:src.getObject(n).Shape.copy() for n in ('BMO_Sitting_Leg_Left','BMO_Sitting_Leg_Right','BMO_Letter_B','BMO_Letter_M','BMO_Letter_O')}
App.closeDocument(src.Name); App.setActiveDocument(target.Name)
log=[]
def stats(tag,s):
    b=s.BoundBox
    log.append({'stage':tag,'volume':s.Volume,'valid':s.isValid(),'solids':len(s.Solids),'bounds':[b.XMin,b.YMin,b.ZMin,b.XMax,b.YMax,b.ZMax]})
for n in ('BMO_MAIN_BODY','Before_Live_Style_Restore','Body_Before_User_Revision'):
    stats(n,target.getObject(n).Shape)
shell=target.getObject('Before_Live_Style_Restore').Shape.copy()
for side,suffix in [(-1,'Left'),(1,'Right')]:
    cx=side*10
    shell=shell.cut(Part.makeBox(10,26,8.2,V(cx-5,-27,-1))); stats('cut_'+suffix,shell)
    leg=source_shapes['BMO_Sitting_Leg_'+suffix]
    stats('source_leg_'+suffix,leg)
    leg=leg.cut(Part.makeCylinder(1.85,3.3,V(cx,-7,6.9),V(0,0,1))); stats('cut_peg_'+suffix,leg)
    joint=Part.makeCylinder(2.6,2,V(cx,-7,6.8),V(0,0,1))
    shell=shell.fuse(joint).fuse(leg).removeSplitter(); stats('fuse_'+suffix,shell)
shell=shell.fuse(Part.makeBox(.6,10,36,V(-24,-1,31))); stats('side_patch',shell)
for name in ('BMO_Letter_B','BMO_Letter_M','BMO_Letter_O'):
    glyph=source_shapes[name]; extended=glyph.copy(); extended.translate(V(.15,0,0))
    shell=shell.fuse(glyph.fuse(extended)); stats(name,shell)
print(json.dumps(log))
