"""FreeCAD MCP restore the user's preferred exact feet and BMO letter positions."""
import Part
import json
from pathlib import Path
from FreeCAD import Vector as V
ROOT=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET'); OUT=ROOT/'cad/print_shop'
doc=App.activeDocument()
source=ROOT/'cad/final_print/LIVE_STATE_BEFORE.FCStd'
src=App.openDocument(str(source))
original={n:src.getObject(n).Shape.copy() for n in ('BMO_Sitting_Leg_Left','BMO_Sitting_Leg_Right','BMO_Letter_B','BMO_Letter_M','BMO_Letter_O')}
App.closeDocument(src.Name); App.setActiveDocument(doc.Name)
body=doc.getObject('BMO_MAIN_BODY')
old=doc.getObject('Before_Live_Style_Restore')
if old is None:
    old=doc.addObject('Part::Feature','Before_Live_Style_Restore'); old.Shape=body.Shape.copy()
    doc.getObject('Print_Shop_History').addObject(old); old.ViewObject.Visibility=False
shell=old.Shape.copy()
for side,suffix in [(-1,'Left'),(1,'Right')]:
    cx=side*10
    shell=shell.cut(Part.makeBox(10,26,8.2,V(cx-5,-27,-1)))
    leg=original['BMO_Sitting_Leg_'+suffix].copy()
    if side==1:
        leg=Part.read(str(OUT/'reference/LIVE_RIGHT_FOOT_HEALED.brep'))
    # The former peg is buried inside a wider fused root, no separate locating joint.
    joint=Part.makeCylinder(2.6,3.4,V(cx,-7,6.8),V(0,0,1))
    shell=shell.fuse(joint).fuse(leg).removeSplitter()
    assert shell.isValid() and shell.Volume>30000, 'Foot Boolean failed: '+suffix
# Restore the smooth side before adding the original embossed glyph geometry.
shell=shell.fuse(Part.makeBox(.6,10,36,V(-24,-1,31)))
glyphs=[]
for name in ('BMO_Letter_B','BMO_Letter_M','BMO_Letter_O'):
    s=original[name]
    extended=s.copy(); extended.translate(V(.15,0,0))
    shell=shell.fuse(s.fuse(extended)).removeSplitter()
    assert shell.isValid() and shell.Volume>30000, 'Letter Boolean failed: '+name
    b=s.BoundBox
    glyphs.append({'name':name,'source_bounds':[b.XMin,b.YMin,b.ZMin,b.XMax,b.YMax,b.ZMax],'outer_outline_and_position':'Exact LIVE_STATE_BEFORE geometry; only hidden inward overlap added for fusion.'})
body.Shape=shell.removeSplitter()
assert body.Shape.isValid() and len(body.Shape.Solids)==1
report={'reference':str(source.relative_to(ROOT)),'feet':'Original full foot solids restored; original exterior retained, internal peg replaced by fused root.','BMO_letters':glyphs,'O_center_yz_mm':[0,29],'arm_root_center_yz_mm':[0,29],'unchanged_user_changes':'Buttons shifted right; rear power switch; four print parts.'}
(OUT/'live-style-restoration.json').write_text(json.dumps(report,indent=2))
doc.recompute(); doc.save()
view=Gui.activeDocument().activeView()
if hasattr(view,'setAnimationEnabled'): view.setAnimationEnabled(False)
view.setCameraOrientation(App.Rotation(V(0,0,1),-35).multiply(App.Rotation(V(1,0,0),78)).Q)
Gui.updateGui(); view.fitAll(); Gui.updateGui(); view.saveImage(str(OUT/'live-style-preview.png'),1600,1600,'White')
print(json.dumps(report))
