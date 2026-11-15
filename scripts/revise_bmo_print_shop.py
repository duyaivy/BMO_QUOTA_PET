"""FreeCAD MCP: user-directed four-part print-shop revision of the existing CAD."""
import Part
import json
import shutil
import hashlib
from pathlib import Path
from FreeCAD import Vector as V
ROOT=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET'); OUT=ROOT/'cad/print_shop'
OUT.mkdir(exist_ok=True)
source=ROOT/'cad/final_print/BMO_FINAL_OPTIMIZED.FCStd'
backup=OUT/'BEFORE_USER_REVISION.FCStd'
if not backup.exists(): shutil.copy2(source,backup)
doc=App.openDocument(str(backup)); doc.Label='BMO — four print parts / rear power switch'
history=doc.addObject('App::DocumentObjectGroup','Print_Shop_History')
def box(w,d,h,x,y,z): return Part.makeBox(w,d,h,V(x,y,z))
def cyl(r,h,p,d=(0,1,0)): return Part.makeCylinder(r,h,V(*p),V(*d))
def moved(s,d):
    s=s.copy(); s.translate(V(*d)); return s
def bb(s):
    b=s.BoundBox; return [b.XMin,b.YMin,b.ZMin,b.XMax,b.YMax,b.ZMax]
def checkpoint(name,s):
    o=doc.addObject('Part::Feature',name); o.Shape=s.copy(); history.addObject(o); o.ViewObject.Visibility=False
body=doc.getObject('BMO_MAIN_BODY'); cover=doc.getObject('BMO_BACK_COVER')
shell=body.Shape.copy(); lid=cover.Shape.copy()
checkpoint('Body_Before_User_Revision',shell); checkpoint('Lid_Before_Rear_Switch',lid)
notes={'source':str(source.relative_to(ROOT)),'backup_sha256':hashlib.sha256(backup.read_bytes()).hexdigest(),'status':'DESIGN_REVIEW_REQUIRED','button_extra_shift_x_mm':2,'feet':[]}

# Keep the accepted seated stance, replace only the old feet below the body.
for side in (-1,1):
    cx=side*10
    shell=shell.cut(box(10,26,8.2,cx-5,-27,-1))
    foot=box(8.4,22.6,4,cx-4.2,-25.6,0)
    foot=foot.makeFillet(1.5,foot.Edges)
    ankle=cyl(3,6.5,(cx,-7,2),(0,0,1))
    root=Part.makeSphere(3.4,V(cx,-7,6.5))
    shell=shell.fuse(foot).fuse(ankle).fuse(root)
    notes['feet'].append({'side':side,'sole_mm':[8.4,22.6,4],'ankle_diameter':6,'toe_y':-25.6,'ankle_y':-7,'root_blend_radius':3.4,'flat_bed_z':0})
# Remove an inherited tangent-only edge between the charger shelf and screw boss.
shell=shell.cut(box(2.2,21.7,.2,-21.1,3.9,32.3))

# Repair only the old decorative footprints, keeping the OLED and D-pad intact.
regions=[(-3.1,7,28,36),(6.4,12.6,37.3,41.5),(10.1,16.3,28.9,33.1)]
for xmin,xmax,zmin,zmax in regions:
    shell=shell.cut(box(xmax-xmin,1.1,zmax-zmin,xmin,-16.1,zmin))
    shell=shell.fuse(box(xmax-xmin,2.75,zmax-zmin,xmin,-15,zmin))
for name,delta in [('Triangle_Cyan',(3,0,5)),('Upper_Button_Blue',(2,0,-5)),('Small_Button_Green',(3,0,2))]:
    detail=moved(doc.getObject(name).Shape,delta)
    wire=detail.slice(V(0,1,0),-15.5)[0]
    profile=Part.Face(wire); profile.translate(V(0,-15.6-profile.BoundBox.YMin,0))
    relief=profile.extrude(V(0,1,0))
    groove=Part.Face(wire.makeOffset2D(.45)).cut(Part.Face(wire.makeOffset2D(.05)))
    groove.translate(V(0,-15.05-groove.BoundBox.YMin,0))
    shell=shell.cut(groove.extrude(V(0,.4,0))).fuse(relief)

# Move the red cap and its complete through-hole/recess/tactile together by +2 X.
shell=shell.fuse(box(16,2.75,13,4,-15,15))
shell=shell.cut(cyl(3.8,5,(12.5,-16.5,21.5))).cut(cyl(4.9,2,(12.5,-12.8,21.5)))
for name in ('BMO_BUTTON_RED','BMO_Action_Button_Red','Tactile_Switch_B_Red'):
    doc.getObject(name).Shape=moved(doc.getObject(name).Shape,(2,0,0))

# Close the former side switch slot, remove its obsolete internal ledges.
shell=shell.cut(box(4,9,8,17.5,12.5,34))
shell=shell.fuse(box(2.5,8.6,6.6,21.5,12.7,34.7))
# Rear upper-right location avoids cell (ends at Z60), PCM (Z62) and JST (X<=7).
switch=doc.getObject('Power_Switch_PLACEHOLDER')
s=switch.Shape.copy(); s.rotate(V(21.5,17,38),V(0,0,1),90)
s.translate(V(12-21.5,14.5,28)); switch.Shape=s
lid=lid.cut(box(8.6,8,6.6,7.7,27.5,62.7))
# Open-backed side guides and a lower ledge, integral with the lid.
lid=lid.fuse(box(1.2,2.1,7.4,6.5,28.4,62.3))
lid=lid.fuse(box(1.2,3,7.4,16.3,27.5,62.3))
lid=lid.fuse(box(11.8,3,.8,6.2,27.5,62.1))
notes['rear_switch']={'rotation_z_deg':90,'translation':[-9.5,14.5,28],'bounds':bb(s),'cell_unchanged':True,'actuator_rear_projection_mm':2,'mounting':'Nominal guide/ledge fit; verify actual switch and retention.'}
doc.getObject('Power_Switch_Finger_Access').Shape=box(14,12,10,5,33,61)
body.Shape=shell.removeSplitter(); cover.Shape=lid.removeSplitter()
assert body.Shape.isValid() and len(body.Shape.Solids)==1
assert cover.Shape.isValid() and len(cover.Shape.Solids)==1
notes['parts']={n:{'bounds':bb(doc.getObject(n).Shape),'valid':doc.getObject(n).Shape.isValid(),'solids':len(doc.getObject(n).Shape.Solids)} for n in ('BMO_MAIN_BODY','BMO_BACK_COVER','BMO_DPAD_YELLOW','BMO_BUTTON_RED')}
physical=['BMO_MAIN_BODY','BMO_BACK_COVER','BMO_DPAD_YELLOW','BMO_BUTTON_RED','BMO_SWITCH_RETAINER','OLED_096_PCB','OLED_096_Glass','OLED_096_ActiveArea','OLED_096_Header','Tactile_Switch_A_DPad','Tactile_Switch_B_Red','ESP32_CAM_AI_Thinker','Battery_LiPo_503048','Power_Boost_MT3608','Capacitor_2200uF','Charger_Module_PLACEHOLDER','Power_Switch_PLACEHOLDER','Battery_Soft_Pad','Battery_Soft_Retaining_Band','Capacitor_Soft_Retaining_Strap']
for o in doc.Objects:
    if hasattr(o,'Shape') and hasattr(o,'ViewObject'): o.ViewObject.Visibility=o.Name in physical
doc.recompute(); doc.saveAs(str(OUT/'BMO_PRINT_SHOP.FCStd'))
(OUT/'revision.json').write_text(json.dumps(notes,indent=2))
view=Gui.activeDocument().activeView(); view.setCameraType('Orthographic')
view.setCameraOrientation(App.Rotation(V(0,0,1),-35).multiply(App.Rotation(V(1,0,0),78)).Q)
Gui.updateGui(); view.fitAll(); Gui.updateGui(); view.saveImage(str(OUT/'revision-preview.png'),1600,1600,'White')
print(json.dumps(notes))
