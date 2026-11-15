"""FreeCAD MCP finishing details: readable original lettering and service seats."""
import Part
import Draft
import json
from pathlib import Path
from FreeCAD import Vector as V
ROOT=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET'); OUT=ROOT/'cad/final_print'
doc=App.activeDocument(); assert doc.getObject('BMO_MAIN_BODY')
body=doc.getObject('BMO_MAIN_BODY'); cover=doc.getObject('BMO_BACK_COVER')
P=json.loads((OUT/'parameters.json').read_text()); rear=P['body_depth']-15
notes=json.loads((OUT/'modification-notes.json').read_text())
shell=body.Shape.copy()
# Move BMO clear of the reinforced shoulder, preserving the original glyphs.
shell=shell.fuse(Part.makeBox(.6,10,38,V(-24,-1,24)))
for item in notes['text']:
    if not item['name'].startswith('BMO_'): continue
    s=doc.getObject(item['name']).Shape.copy(); b=s.BoundBox
    cy=(b.YMin+b.YMax)/2; cz=(b.ZMin+b.ZMax)/2
    s.translate(V(0,-cy,-cz)); m=App.Matrix(); m.A22=.85; m.A33=.85
    s=s.transformGeometry(m); s.translate(V(.6,4,cz+7))
    shell=shell.cut(s)
    b=s.BoundBox; item['bounds']=[b.XMin,b.YMin,b.ZMin,b.XMax,b.YMax,b.ZMax]
    item['raise_z_mm']=7
# Seats around the unknown slide switch; elastic/adhesive retention remains provisional.
for z in (34.0,41.2):
    x=17.5 if z==34.0 else 19
    shell=shell.fuse(Part.makeBox(22-x,9,.8,V(x,12.5,z)))
body.Shape=shell.removeSplitter()
# Preserve duyaivy, enlarge its tiny original strokes for a more legible recess.
lid=cover.Shape.fuse(Part.makeBox(25,.4,7,V(-22,rear-.4,19)))
text=Draft.make_shapestring(String='duyaivy',FontFile='/System/Library/Fonts/Supplemental/Arial Bold.ttf',Size=4.5,Tracking=0)
doc.recompute(); glyph=text.Shape.copy(); b=glyph.BoundBox
scale=4.5/b.YLength
m=App.Matrix(); m.A11=scale; m.A22=scale; m.A33=scale
glyph=glyph.transformGeometry(m); b=glyph.BoundBox
glyph.translate(V(-(b.XMin+b.XMax)/2,-b.YMin,0))
rot=App.Rotation(V(-1,0,0),V(0,0,1),V(0,1,0),'ZXY')
glyph.Placement=App.Placement(V(-7,rear+.05,20),rot).multiply(glyph.Placement)
cutter=glyph.extrude(V(0,-.65,0)); lid=lid.cut(cutter)
doc.removeObject(text.Name); cover.Shape=lid.removeSplitter()
notes['signature']={'text':'duyaivy','height':4.5,'depth':.6,'same_mint_as_cover':True}
(OUT/'modification-notes.json').write_text(json.dumps(notes,indent=2))
# Source caps can belong to several inherited groups; make final copies with unique names.
for old,new,color in [('BMO_DPad_Yellow','BMO_DPAD_YELLOW',(.95,.78,.08)),('BMO_Action_Button_Red','BMO_BUTTON_RED',(.85,.12,.1))]:
    o=doc.getObject(new)
    if o is None:
        o=doc.addObject('Part::Feature',new); doc.getObject('Final_Print_Parts').addObject(o)
    o.Shape=doc.getObject(old).Shape.copy(); o.ViewObject.ShapeColor=color
    doc.getObject(old).ViewObject.Visibility=False
names=['BMO_MAIN_BODY','BMO_BACK_COVER','BMO_DPAD_YELLOW','BMO_BUTTON_RED','BMO_SWITCH_RETAINER']
hardware=['OLED_096_PCB','OLED_096_Glass','OLED_096_ActiveArea','OLED_096_Header','Tactile_Switch_A_DPad','Tactile_Switch_B_Red','ESP32_CAM_AI_Thinker','Battery_LiPo_503048','Power_Boost_MT3608','Capacitor_2200uF','Charger_Module_PLACEHOLDER','Power_Switch_PLACEHOLDER','Battery_Soft_Pad','Battery_Soft_Retaining_Band','Capacitor_Soft_Retaining_Strap']
for o in doc.Objects:
    if o.TypeId=='App::DocumentObjectGroup': o.ViewObject.Visibility=True
for o in doc.Objects:
    if hasattr(o,'Shape') and hasattr(o,'ViewObject'): o.ViewObject.Visibility=o.Name in names+hardware
doc.recompute(); doc.save()
print(json.dumps({'parts':{n:{'valid':doc.getObject(n).Shape.isValid(),'solids':len(doc.getObject(n).Shape.Solids),'visible':doc.getObject(n).ViewObject.Visibility} for n in names},'signature':notes['signature']}))
