"""Modify the existing assembly through FreeCAD MCP, retaining staged geometry.

Regenerate from the immutable source using cad/final_print/parameters.json.
Dimensions are nominal CAD values, not measurements of purchased hardware.
"""
import Part
import json
import math
from pathlib import Path
from FreeCAD import Vector as V

ROOT=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET')
OUT=ROOT/'cad/final_print'
P=json.loads((OUT/'parameters.json').read_text())
source=ROOT/'cad/hardware_review/BMO_HARDWARE_INTEGRATED.FCStd'
# Never discard a dirty working document. Each run opens a fresh source copy.
doc=App.openDocument(str(source))
doc.Label='BMO final print optimization — DESIGN_REVIEW_REQUIRED'
history=doc.addObject('App::DocumentObjectGroup','Optimization_History')
printing=doc.addObject('App::DocumentObjectGroup','Final_Print_Parts')
def box(w,d,h,x,y,z): return Part.makeBox(w,d,h,V(x,y,z))
def cyl(r,h,p,d=(0,1,0)): return Part.makeCylinder(r,h,V(*p),V(*d))
def bounds(s):
    b=s.BoundBox
    return [b.XMin,b.YMin,b.ZMin,b.XMax,b.YMax,b.ZMax]
def move(s,xyz):
    s=s.copy(); s.translate(V(*xyz)); return s
def objshape(name): return doc.getObject(name).Shape.copy()
def stage(name,s):
    assert s.isValid(),name+' invalid'
    o=doc.addObject('Part::Feature',name); o.Shape=s; history.addObject(o)
    o.ViewObject.Visibility=False
    return s
def union(shapes):
    s=shapes[0]
    for x in shapes[1:]: s=s.fuse(x)
    return s.removeSplitter()
notes={'roots':[],'ears':[],'text':[],'buttons':[], 'integrated':[], 'hardware_transforms':{}}
base_names=list(json.loads((ROOT/'cad/hardware_review/integration-audit.json').read_text())['parts'])
original={n:objshape(n) for n in base_names}
depth=P['body_depth']; rear=depth-15; delta=depth-54
shell=original['BMO_Front_Shell'].copy()
lid=move(original['BMO_Back_Cover'],(0,delta,0))
# Shorten only the added rear extension, preserving accepted front and roof.
shell=shell.cut(box(150,80,150,-75,rear-3,-10))
# Close old power-switch opening in the side wall only, then relocate it.
shell=shell.fuse(box(2.5,8.6,6.6,21.5,19.7,34.7))
shell=shell.cut(box(150,80,150,-75,rear-3,-10))
# Clear obsolete internal switch rails and repair old cap/decorative seats.
shell=shell.cut(box(39,6.0,32.5,-20,-12.25,9.5))
shell=shell.fuse(box(39,2.75,32,-20,-15,10))
shell=shell.fuse(cyl(1.85,2.75,(8.5,-15,44.4)))
# The old rear USB cut in the shortened shell vanishes; create the translated port.
usb_access=box(6,16,11,-21.8,rear-5,37)
shell=shell.cut(usb_access); lid=lid.cut(usb_access)
shell=shell.cut(box(6.5,8.6,6.6,17.7,12.7,34.7))
stage('Stage_01_Shortened_And_Repaired_Shell',shell)

# Keep exactly one installed copy of every unchanged hardware model.
transforms={
    'ESP32_CAM_AI_Thinker':(0,P['esp_shift_y'],0),
    'Capacitor_2200uF':(0,P['cap_shift_y'],0),
    'Battery_LiPo_503048':(0,rear-P['battery_rear_offset']-29.5,0),
    'Charger_Module_PLACEHOLDER':(0,delta,0),
    'Power_Switch_PLACEHOLDER':(0,-7,0),
    'Battery_Soft_Pad':(0,rear-P['battery_rear_offset']-29.5,0),
    'Battery_Soft_Retaining_Band':(0,rear-P['battery_rear_offset']-29.5,0),
    'Capacitor_Soft_Retaining_Strap':(0,P['cap_shift_y'],0)}
for name,xyz in transforms.items():
    doc.getObject(name).Shape=move(original[name],xyz)
    notes['hardware_transforms'][name]={'translation':xyz}
boost=original['Power_Boost_MT3608'].copy()
boost.rotate(V(0,10,10.5),V(1,0,0),90)
b=bounds(boost); boost.translate(V(0,P['boost_min_y']-b[1],0))
doc.getObject('Power_Boost_MT3608').Shape=boost
notes['hardware_transforms']['Power_Boost_MT3608']={'rotation_x_deg':90,'bounds':bounds(boost)}

# Fused legs, no locating pegs or sockets. A rounded hip blends into the floor.
for side,suffix in [(-1,'Left'),(1,'Right')]:
    cx=side*10
    shell=shell.fuse(cyl(2.1,2.6,(cx,-7,6.95),(0,0,1)))
    leg=original['BMO_Sitting_Leg_'+suffix].common(box(80,80,7,-40,-40,0))
    root=box(7,9,4,cx-3.5,-11.5,5.5)
    root=root.makeFillet(1.2,[e for e in root.Edges if e.BoundBox.YLength>8.9])
    overlap=leg.common(root).Volume
    shell=union([shell,leg,root])
    notes['roots'].append({'part':'leg_'+suffix,'root_radius':1.2,'root_to_leg_overlap_mm3':overlap})
    notes['integrated'].append('BMO_Sitting_Leg_'+suffix)

# Close shoulder sockets with rounded collars, fuse existing arms, retain fingers.
for side,suffix in [(-1,'Left'),(1,'Right')]:
    arm=original['BMO_Sitting_Arm_'+suffix].copy()
    collar=cyl(2.5,5,(side*21.4,0,29),(side,0,0))
    collar=collar.fuse(Part.makeSphere(2.5,V(side*24.4,0,29)))
    # At 1.4 mm fingers with 0.4 mm gaps the three-finger gesture is preserved.
    cx=side*29.8
    arm=arm.cut(box(8,8,3,cx-4,8.6,0))
    for dx in (-1.8,0,1.8):
        tip=11.5 if dx==0 else 10.8
        finger=cyl(.7,tip-8.3,(cx+dx,8.3,.7),(0,1,0)).fuse(Part.makeSphere(.7,V(cx+dx,tip,.7)))
        arm=arm.fuse(finger)
    arm=arm.common(box(100,100,100,-50,-50,0))
    shell=union([shell,collar,arm])
    notes['roots'].append({'part':'arm_'+suffix,'collar_diameter':5,'collar_to_original_arm_overlap_mm3':collar.common(original['BMO_Sitting_Arm_'+suffix]).Volume})
    notes['integrated'].append('BMO_Sitting_Arm_'+suffix)
stage('Stage_02_Integrated_Limbs',shell)

# Add material outside the original hollow-ear contours; preserve both bores.
ear_faces=[f for f in original['BMO_Front_Shell'].Faces if f.BoundBox.ZMax>80 and f.BoundBox.YLength<1e-5 and len(f.Wires)>1]
seen=set()
for f in ear_faces:
    side=-1 if f.CenterOfMass.x<0 else 1
    if side in seen: continue
    seen.add(side)
    outer=f.OuterWire.makeOffset2D(P['ear_outer_reinforcement'])
    face=Part.Face(outer)
    inners=[w for w in f.Wires if not w.isSame(f.OuterWire)]
    for w in inners: face=face.cut(Part.Face(w))
    face.translate(V(0,-5-face.BoundBox.YMin,0))
    ear=face.extrude(V(0,P['ear_depth'],0))
    shell=shell.fuse(ear).removeSplitter()
    notes['ears'].append({'side':side,'outer_offset_mm':P['ear_outer_reinforcement'],'depth_mm':P['ear_depth'],'opening_preserved':True})
stage('Stage_03_Reinforced_Hollow_Ears',shell)

# Exactly two sliding caps, inserted from the rear before a removable retainer.
layout=json.loads((OUT/'alternatives.json').read_text())['button_layouts'][0]
cap_names=['BMO_DPad_Yellow','BMO_Action_Button_Red']
retainer=[]
for cap_name,sw_name,red in [('BMO_DPad_Yellow','Tactile_Switch_A_DPad',False),('BMO_Action_Button_Red','Tactile_Switch_B_Red',True)]:
    dx,_,dz=layout['offsets'][cap_name]
    cx=(9.5 if red else -10.5)+dx; cz=(20.5 if red else 27)+dz
    cap=move(original[cap_name],(dx,-.2,dz))
    switch=move(original[sw_name],(dx,-.25,dz))
    doc.getObject(cap_name).Shape=cap; doc.getObject(sw_name).Shape=switch
    if red:
        hole=cyl(3.8,5,(cx,-16.5,cz))
        recess=cyl(4.9,2,(cx,-12.8,cz))
    else:
        hole=box(4.2,5,11.8,cx-2.1,-16.5,cz-5.9).fuse(box(11.8,5,4.2,cx-5.9,-16.5,cz-2.1))
        recess=box(13.8,2,13.8,cx-6.9,-12.8,cz-6.9)
    shell=shell.cut(hole).cut(recess)
    # Switch guides belong to the removable carrier, leaving cap extraction open.
    for xx in (cx-4.1,cx+3.3):
        retainer.append(box(.8,4.35,7.2,xx,-11.6,cz-3.6))
    retainer.append(box(8.2,.15,1.1,cx-4.1,-10.9,cz+2.5))
    # A removable bridge holds the rear face of each tactile, not the actuator.
    retainer.append(box(7.6,1.6,7.6,cx-3.8,-7.25,cz-3.8))
    retainer.append(box(1.6,1.6,38-(cz+3),cx-1,-7.25,cz+3))
    # Cantilever stop connected to the removable rear bridge; unobstructed when removed.
    if red:
        stop=box(2,1.2,1.5,cx-1,-11.7,cz+3.8)
        reach=box(7,1.2,1.2,cx-1,-11.7,cz+4.3)
        spine=box(1.4,6.05,1.2,cx+4.6,-11.7,cz+4.3)
        web=box(6,1.6,2,cx,-7.25,cz+3.5)
    else:
        stop=box(2,1.2,2,cx+4.5,-11.7,cz+4.5)
        reach=box(3.2,1.2,2,cx+4.5,-11.7,cz+4.5)
        spine=box(1.2,6.05,2,cx+6.5,-11.7,cz+4.5)
        web=box(8,1.6,2,cx,-7.25,cz+4.5)
    retainer += [stop,reach,spine,web]
    notes['buttons'].append({'cap':cap_name,'switch':sw_name,'center_xz':[cx,cz],'flange_front_rest_y':-12.8,'flange_back_rest_y':-12.0,'stem_front_rest_y':-11.95,'rest_gap':.05,'mechanical_stop_travel':.3,'nominal_stem_compression_at_stop':.25})
retainer.append(box(37,1.6,2,-18.5,-7.25,36.5))
for x in (-17,16):
    boss=cyl(2.2,5.25,(x,-12.5,38)).cut(cyl(.85,5.5,(x,-12.6,38)))
    shell=shell.fuse(boss)
    ear=cyl(2.6,1.6,(x,-7.25,38)).cut(cyl(1.15,2,(x,-7.4,38)))
    retainer.append(ear)
retainer=union(retainer)
stage('Stage_04_Functional_Cap_Seats',shell)

# Fixed cosmetic shapes become embossed mint details with shallow paint outlines.
for name in ('Triangle_Cyan','Upper_Button_Blue','Small_Button_Green'):
    detail=move(original[name],layout['offsets'][name])
    # Discard former glue peg. Embed the face relief continuously into the wall.
    detail=detail.common(box(100,2,100,-50,-16,0))
    b=bounds(detail)
    face=detail.slice(V(0,1,0),-15.5)
    if face:
        wire=face[0]
        # Outer outline only; former parts have one planar profile.
        profile=Part.Face(wire)
        profile.translate(V(0,-15.6-profile.BoundBox.YMin,0))
        relief=profile.extrude(V(0,1.0,0))
        outer=Part.Face(wire.makeOffset2D(.45)); inner=Part.Face(wire.makeOffset2D(.05))
        groove=outer.cut(inner)
        groove.translate(V(0,-15.05-groove.BoundBox.YMin,0))
        shell=shell.cut(groove.extrude(V(0,.4,0))).fuse(relief)
    notes['integrated'].append(name)
stage('Stage_05_Integrated_Mint_Decorations',shell)

# Reuse the existing letter outlines, including B/D/O counters, as shallow cuts.
for name in [n for n in base_names if '_Letter_' in n]:
    s=original[name].copy(); side=-1 if name.startswith('BMO_') else 1
    b=s.BoundBox; cy=(b.YMin+b.YMax)/2; cz=(b.ZMin+b.ZMax)/2
    m=App.Matrix(); m.A22=P['text_scale']; m.A33=P['text_scale']
    s.translate(V(0,-cy,-cz)); s=s.transformGeometry(m)
    s.translate(V(-side*P['text_depth'],P['text_center_y'],cz))
    # Glyph thickness remains .65, cutting .6 into the 2.5 mm side wall.
    cut_volume=shell.common(s).Volume
    shell=shell.cut(s)
    notes['text'].append({'name':name,'bounds':bounds(s),'depth':P['text_depth'],'cut_volume':cut_volume,'outline_source':'original glyph, scaled in side plane only'})
stage('Stage_06_Engraved_BMO_DUT',shell)

# Integrate internal fixtures; leave elastics and foam as non-print hardware.
# Capacitor cradle and OLED supports already touch the floor/side walls.
for name,xyz in [('Capacitor_Cradle',(0,P['cap_shift_y'],0)),('OLED_PCB_Edge_Supports',(0,0,0)),('Charger_Edge_Bracket',(0,delta,0))]:
    s=move(original[name],xyz)
    if name=='Charger_Edge_Bracket': s=s.fuse(box(.3,27,20,-21.7,4.5+delta,32.5))
    shell=shell.fuse(s)
    notes['integrated'].append(name)
# ESP cradle leaves with the lid/battery; cap maintenance has no fixed cross shelf.
ey=4+P['esp_shift_y']
esp_mount=box(30,13.5,.8,-15,ey-2,28.1)
for x in (-15,14): esp_mount=esp_mount.fuse(box(1,3,30.6,x,ey,28.9))
esp_mount=esp_mount.fuse(box(1.2,rear-2.5-(ey-2),1.2,-15.7,ey-2,28.1))
esp_mount=esp_mount.fuse(box(1.2,rear-2.5-(ey-2),1.2,16.3,ey-2,28.1))
esp_mount=esp_mount.fuse(box(3.5,2,1.2,14,ey+9.5,28.1))
lid=lid.fuse(esp_mount)
notes['integrated'].append('ESP32_Edge_Cradle_No_PCB_Holes -> back cover')
# Vertical boost seats on an integrated floor with pad relief and elastic tie slots.
boost_seat=box(40,15.4,.9,-20,P['boost_min_y']-.3,9.4)
for x in (-20,18.8):
    boost_seat=boost_seat.fuse(box(1.2,3,8,x,P['boost_min_y']+12,9.5))
    boost_seat=boost_seat.cut(box(2,1.6,2.5,x-.4,P['boost_min_y']+12.7,12))
for x in (-21.7,20): boost_seat=boost_seat.fuse(box(1.7,4,1.2,x,P['boost_min_y']+10,9.3))
shell=shell.fuse(boost_seat)
notes['integrated'].append('Boost_Tray_Removable')
# Battery tray is integrated into the removable lid. It exits with that lid.
tray=move(original['Battery_Tray_Removable'],(0,rear-P['battery_rear_offset']-29.5,0))
for x in (-15.5,16.3):
    tray=tray.fuse(box(1.2,7,50,x,rear-P['battery_rear_offset']-.8,10.5))
for x in (-15.5,17): tray=tray.fuse(box(.5,2,45,x,rear-4.3,11))
lid=lid.fuse(tray)
notes['integrated'].append('Battery_Tray_Removable -> back cover')
# Open U-shaped elastic strap around the tray; no closed loop through its walls.
band=box(35,.4,2,-16.5,rear-10.9,40)
for x in (-16.5,18.1): band=band.fuse(box(.4,5.6 if x<0 else 7.7,2,x,rear-10.9,40))
doc.getObject('Battery_Soft_Retaining_Band').Shape=band.removeSplitter()
# Shorten and integrate the anti-tip skid with positive overlap into the floor.
skid=move(original['Rear_AntiTip_Skid'],(0,delta,0))
for x in (-18,15): skid=skid.fuse(box(3,12,1,x,rear-16,6.8))
shell=shell.fuse(skid).removeSplitter(); lid=lid.removeSplitter()
notes['integrated'].append('Rear_AntiTip_Skid')
stage('Stage_07_Integrated_Internal_Seats',shell)

# Update spatial reserves rather than retaining stale geometry from the old layout.
doc.getObject('ESP32_Antenna_Keepout').Shape=move(doc.getObject('ESP32_Antenna_Keepout').Shape,(0,P['esp_shift_y'],0))
doc.getObject('USB_Cable_Insert_Keepout').Shape=usb_access
doc.getObject('Power_Switch_Finger_Access').Shape=move(doc.getObject('Power_Switch_Finger_Access').Shape,(0,-7,0))
# Access to the boost potentiometer is from the front before the capacitor is installed.
trimmer=box(5,18,5,7,0,16)
doc.getObject('Boost_Trimmer_Access').Shape=trimmer

# Remove former schematic routes and replace with reserved, explicit corridors later.
for n in ('Battery_To_Boost','Boost_To_ESP32','OLED_I2C_Loom','Charger_Battery_Lead','Capacitor_Output_Lead'):
    doc.getObject(n).ViewObject.Visibility=False
    doc.getObject(n+'_Routing_Envelope').ViewObject.Visibility=False

# Keep originals and obsolete fixtures as hidden provenance, never as duplicate prints.
for n in base_names:
    if n not in ('ESP32_CAM_AI_Thinker','Capacitor_2200uF','Battery_LiPo_503048','Charger_Module_PLACEHOLDER','Power_Switch_PLACEHOLDER','Battery_Soft_Pad','Battery_Soft_Retaining_Band','Capacitor_Soft_Retaining_Strap','Power_Boost_MT3608',*cap_names,'Tactile_Switch_A_DPad','Tactile_Switch_B_Red','OLED_096_PCB','OLED_096_Glass','OLED_096_ActiveArea','OLED_096_Header'):
        doc.getObject(n).ViewObject.Visibility=False
for n in ('BMO_Front_Shell','BMO_Back_Cover'):
    history.addObject(doc.getObject(n)); doc.getObject(n).ViewObject.Visibility=False
mint=(.35,.76,.72)
prints={}
for name,s,color in [('BMO_MAIN_BODY',shell,mint),('BMO_BACK_COVER',lid,mint),('BMO_SWITCH_RETAINER',retainer,mint)]:
    o=doc.addObject('Part::Feature',name); o.Shape=s.removeSplitter()
    o.ViewObject.ShapeColor=color; o.ViewObject.DisplayMode='Flat Lines'
    o.ViewObject.Deviation=.05; o.ViewObject.AngularDeflection=10
    printing.addObject(o); prints[name]=o
    o.addProperty('App::PropertyString','Readiness','Review'); o.Readiness='DESIGN_REVIEW_REQUIRED'
    o.addProperty('App::PropertyString','Regeneration','Parameters')
    o.Regeneration='Edit cad/final_print/parameters.json; run scripts/optimize_bmo_final.py via FreeCAD MCP'
for n in cap_names: printing.addObject(doc.getObject(n))
sheet=doc.addObject('Spreadsheet::Sheet','Final_Print_Parameters')
for i,(key,value) in enumerate(P.items(),1):
    sheet.set('A'+str(i),key); sheet.set('B'+str(i),str(value))
    if isinstance(value,(int,float)): sheet.setAlias('B'+str(i),key)
doc.getObject('BMO_Enclosure_SectionCut').ViewObject.Visibility=False
doc.recompute()
(OUT/'modification-notes.json').write_text(json.dumps(notes,indent=2))
doc.saveAs(str(OUT/'BMO_FINAL_OPTIMIZED.FCStd'))
print(json.dumps({'prints':{n:{'valid':o.Shape.isValid(),'solids':len(o.Shape.Solids),'bounds':bounds(o.Shape)} for n,o in prints.items()},'notes':notes}))
