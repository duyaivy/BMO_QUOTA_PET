"""FreeCAD MCP hardware integration; modifies the accepted model on a copy.

Edit cad/hardware_review/parameters.json and rerun to regenerate. Saved BReps
remain viewable without this script. All lengths mm; no electrical actuation.
"""
import Part
import MeshPart
import json
import math
import itertools
import hashlib
import sys
from pathlib import Path
from FreeCAD import Vector as V

ROOT=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET')
OUT=ROOT/'cad/hardware_review'; OUT.mkdir(exist_ok=True)
P=json.loads((OUT/'parameters.json').read_text())
source=OUT/'INSPECTED_BASELINE.FCStd'
for d in list(App.listDocuments().values()):
    if d.FileName==str(source): App.closeDocument(d.Name)
doc=App.openDocument(str(source)); doc.Label='BMO hardware integration — DESIGN_REVIEW_REQUIRED'
sheet=doc.addObject('Spreadsheet::Sheet','Hardware_Parameters')
for i,(key,value) in enumerate([(k,v) for k,v in P.items() if isinstance(v,(int,float))],1):
    sheet.set('A'+str(i),key); sheet.set('B'+str(i),str(value)); sheet.setAlias('B'+str(i),key)
groups={name:doc.addObject('App::DocumentObjectGroup',name) for name in ('Hardware_Integrated','Mounts_Removable','Keepouts_And_Service','Layout_Alternatives','Battery_Alternative')}
physical=[]; keepouts=[]
def box(w,d,h,x,y,z): return Part.makeBox(w,d,h,V(x,y,z))
def cylinder(r,h,p,d=(0,0,1)): return Part.makeCylinder(r,h,V(*p),V(*d))
def feature(name,shape,group='Hardware_Integrated',color=(.2,.3,.4),status='PLACEHOLDER — measure actual part'):
    o=doc.addObject('Part::Feature',name); o.Shape=shape.removeSplitter(); o.ViewObject.ShapeColor=color
    o.addProperty('App::PropertyString','DimensionEvidence','Review'); o.DimensionEvidence=status
    groups[group].addObject(o)
    if group not in ('Keepouts_And_Service','Layout_Alternatives','Battery_Alternative'): physical.append(o)
    else: o.ViewObject.Visibility=False
    return o
def reserve(name,shape,owners):
    o=feature(name,shape,'Keepouts_And_Service',(.9,.5,.1)); o.ViewObject.Transparency=80
    keepouts.append((o,set(owners))); return o
def bounds(s):
    b=s.BoundBox; return [b.XMin,b.YMin,b.ZMin,b.XMax,b.YMax,b.ZMax]
def rounded(w,d,h,r,x,y,z):
    s=box(w-2*r,d,h,x+r,y,z).fuse(box(w,d,h-2*r,x,y,z+r))
    for xx in (x+r,x+w-r):
        for zz in (z+r,z+h-r): s=s.fuse(cylinder(r,d,(xx,y,zz),(0,1,0)))
    return s.removeSplitter()
def vol_overlap(a,b):
    return max(0,min(a[3],b[3])-max(a[0],b[0]))*max(0,min(a[4],b[4])-max(a[1],b[1]))*max(0,min(a[5],b[5])-max(a[2],b[2]))

# Compare populated envelopes, not just PCBs. Values include modest routing allowances.
def envelopes(depth,esp_y=3,boost_y=9,cap_y=1,bottom_battery=False):
    rear=depth-15
    cr=P['capacitor_diameter']/2; cz=9.5+cr+1.25
    ch=P['capacitor_body_length']/2+P['capacitor_wire_clearance']+.5
    e={'ESP32':[-14.5,esp_y,28,14.5,esp_y+16,70],
       'MT3608':[-P['boost_length']/2-1.5,boost_y,10,P['boost_length']/2+1.5,boost_y+P['boost_width']+2,13+P['boost_height']],
       'Capacitor':[-ch,cap_y-cr-1,cz-cr-1,ch,cap_y+cr+1,cz+cr+1],
       'Charger':[-21,rear-34,32,-15.2,rear-6,53],
       'USBPort':[-20.5,rear-8,38,-17.3,rear+.5,47],
       'USBCable':[-21.8,rear-5,37,-15.8,rear+11,48],
       'Battery':[-15,rear-10.5,11,17,rear-3.5,71]}
    if bottom_battery: e['Battery']=[-16,-5,10,16,47,17]
    return e
def assess(e,depth):
    cavity=[-21.5,-12.25,9.5,21.5,depth-17.75,72.5]
    failures=[]
    for n,b in e.items():
        if n in ('USBPort','USBCable'): continue # intentional rear portal, cut in actual shell/lid below
        if any(b[i]<cavity[i]-1e-6 for i in range(3)) or any(b[i]>cavity[i]+1e-6 for i in range(3,6)): failures.append(n+': outside cavity')
    for a,b in itertools.combinations(e,2):
        if {a,b}.issubset({'Charger','USBPort','USBCable'}): continue
        if vol_overlap(e[a],e[b])>.001: failures.append(a+' / '+b+': envelope overlap')
    # Reserve rear clearance from ESP antenna end; design allowance, not RF certification.
    antenna=[-18.5,e['ESP32'][1]-2,60,18.5,e['ESP32'][4]+P['antenna_clearance'],72.5]
    for n in ('Battery','Charger'):
        if vol_overlap(antenna,e[n])>.001: failures.append(n+': antenna keepout')
    return failures
layouts=[]
for name,btm in [('A_rear_battery',False),('B_lower_battery',True)]:
    e=envelopes(30,bottom_battery=btm); layouts.append({'name':name,'depth':30,'envelopes':e,'failures':assess(e,30)})
candidates=[]
for depth in P['depth_candidates']:
    for ey in (3,4,5):
        for by in (9,10,11):
            for cy in (0,1,2):
                e=envelopes(depth,ey,by,cy); failures=assess(e,depth)
                # Wire length proxy among geometric centers, not a measured loom length.
                centers={k:V(*[(v[i]+v[i+3])/2 for i in range(3)]) for k,v in e.items()}
                wire=sum((centers[a]-centers[b]).Length for a,b in [('Battery','MT3608'),('MT3608','ESP32'),('Charger','Battery'),('Capacitor','ESP32')])
                candidates.append({'depth':depth,'esp_y':ey,'boost_y':by,'cap_y':cy,'failures':failures,'wire_proxy_mm':wire,'envelopes':e})
feasible=[c for c in candidates if not c['failures']]
assert feasible,'No tested layout fits; do not force dimensions'
selected=min(feasible,key=lambda c:(c['depth'],c['wire_proxy_mm']))
depth=selected['depth']; rear=depth-15; delta=depth-P['old_depth']
layouts.append({'name':'C_grid_search','depth':depth,'envelopes':selected['envelopes'],'failures':[],'selected':True})
(OUT/'layout-search.json').write_text(json.dumps({'layouts':layouts,'candidates':candidates,'selected':selected,'objective':'lexicographic: no clashes/containment failures, smallest tested depth, shortest center-distance wiring proxy; grid search, not global optimum'},indent=2))
for l in layouts:
    shapes=[box(b[3]-b[0],b[4]-b[1],b[5]-b[2],*b[:3]) for b in l['envelopes'].values()]
    feature(l['name'],Part.makeCompound(shapes),'Layout_Alternatives')

# Preserve the entire accepted shell/front/ears/limbs. Remove only obsolete internal shelves.
shell=doc.getObject('BMO_Front_Shell').Shape.copy(); original_shell=shell.copy()
shell=shell.cut(box(43,6,1.2,-21.5,-6.5,14.3))
shell=shell.cut(box(43,2.2,1,-21.5,4.3,26))
shell=shell.cut(box(43,2.2,1,-21.5,4.3,9.5))
# Move upper screw axes outward, keeping metal and plastic out of the antenna reserve.
for x in (-20,20): shell=shell.cut(cylinder(2.51,8.1,(x,3.95,69),(0,1,0)))
wall_patch=rounded(48,8.2,68,4,-24,3.9,7).cut(rounded(43,9,63,2,-21.5,3.5,9.5))
shell=shell.fuse(wall_patch)
extension=rounded(48,delta+.3,68,4,-24,11.7,7).cut(rounded(43,delta+1,63,2,-21.5,11.5,9.5))
shell=shell.fuse(extension)
# Translate the original lid, including duyaivy and screw holes; adapt port below.
lid=doc.getObject('BMO_Back_Cover').Shape.copy(); lid.translate(V(0,delta,0))
old_port=box(10,2.75,4,-5,12.25+delta,13)
lid=lid.fuse(old_port)
# Reuse existing screw axes; extend bosses rearward, pilot bores throughout extension.
for x in (-20,20):
    for z in (30,69):
        axis_x=x if z==30 else (21.5 if x>0 else -21.5)
        radius=2.5 if z==30 else 2
        start=11.7 if z==30 else 4
        boss=cylinder(radius,rear-2.75-start-.25,(axis_x,start,z),(0,1,0)).cut(cylinder(.85,rear-start,(axis_x,start,z),(0,1,0)))
        # Upper left rear boss is near battery/antenna; envelope audit below governs fit.
        shell=shell.fuse(boss)
        shell=shell.cut(cylinder(.85,rear-start,(axis_x,start,z),(0,1,0)))
        if z==69:
            lid=lid.fuse(cylinder(1.15,2.75,(x,rear-2.75,z),(0,1,0))).fuse(cylinder(2.1,1,(x,rear-1,z),(0,1,0)))
            lid=lid.cut(cylinder(1.15,4,(axis_x,rear-3,z),(0,1,0))).cut(cylinder(2.1,1,(axis_x,rear-1,z),(0,1,0)))

for name in ('LiPo_Battery_503040','ESP32_CAM_AI_Thinker','Power_Charger_Module'):
    if doc.getObject(name): doc.removeObject(name)
# All hardware below is explicitly approximate, with separate placement objects.
e=selected['envelopes']; esp_y=selected['esp_y']+1
esp_z=29
esp=box(27,1.2,40.5,-13.5,esp_y,esp_z)
esp=esp.fuse(box(15.5,2.4,12,-7.75,esp_y-2.4,esp_z+24))
esp=esp.fuse(box(14.5,1.6,15,-7.25,esp_y+1.2,esp_z+4))
for x in (-12,12):
    esp=esp.fuse(box(2.54,2.54,20.32,x-1.27,esp_y+1.2,esp_z+5))
    for j in range(8): esp=esp.fuse(box(.64,P['esp_header_projection'],.64,x-.32,esp_y+1.2,esp_z+5+j*2.54))
esp_obj=feature('ESP32_CAM_AI_Thinker',esp,color=(.12,.12,.12),status='27 x 40.5 board nominal; camera removed; populated/header geometry provisional')
reserve('ESP32_Antenna_Keepout',box(37,selected['esp_y']+16+5-(selected['esp_y']-2),12.5,-18.5,selected['esp_y']-2,60),{'ESP32_CAM_AI_Thinker'})

battery_y=rear-9.5; battery_z=12
def battery(length):
    cell=box(30,5,length,-14,battery_y,battery_z)
    pcm=box(28,4,2,-13,battery_y+.5,battery_z+length)
    wires=[]
    for x in (2,5): wires.append(cylinder(.7,6,(x,battery_y+2.5,battery_z+length+1)))
    conn=box(7,4,4,0,battery_y+.5,battery_z+length+6)
    return cell.fuse(pcm).fuse(Part.makeCompound(wires)).fuse(conn)
bat=feature('Battery_LiPo_503048',battery(P['battery_cell_length']),color=(.75,.76,.79),status='Cell 5 x 30 x 48 nominal; pack/PCM 50 plus wire/JST placeholders; discharge UNKNOWN')
fallback=feature('Battery_LiPo_503040',battery(40),'Battery_Alternative',(.7,.7,.75),'Cell 5 x 30 x 40 nominal; alternative hidden, not installed simultaneously')

by=selected['boost_y']+1; bz=11
boost=box(P['boost_length'],P['boost_width'],1.6,-P['boost_length']/2,by,bz)
boost=boost.fuse(box(10,10,7,-12,by+3,bz+1.6))
boost=boost.fuse(box(9,10,P['boost_height']-1.6,5,by+3,bz+1.6))
boost=boost.fuse(box(4,3,1.5,-1,by+2,bz+1.6))
for x in (-17.2,17.2):
    for yy in (by+2,by+15.2): boost=boost.fuse(cylinder(.7,2,(x,yy,bz-.5)))
bo=feature('Power_Boost_MT3608',boost,color=(.12,.3,.8),status='User reference 37.2 x 17.2; height 14 is maximum placeholder; pad/trimmer positions unverified')
bo.addProperty('App::PropertyString','Pad_Locations_PLACEHOLDER','Review')
bo.Pad_Locations_PLACEHOLDER=json.dumps({'IN+':[17.2,by+15.2,bz+1.6],'IN-':[17.2,by+2,bz+1.6],'OUT+':[-17.2,by+2,bz+1.6],'OUT-':[-17.2,by+15.2,bz+1.6],'warning':'Geometric placeholders, not verified physical pin mapping'})
for name,val in [('PCB_Length',P['boost_length']),('PCB_Width',P['boost_width']),('Total_Height',P['boost_height'])]: bo.addProperty('App::PropertyLength',name,'Dimensions'); setattr(bo,name,val)
reserve('Boost_Trimmer_Access',cylinder(2.2,25,(9.5,by+8,25)),{'Power_Boost_MT3608'})

cy=selected['cap_y']; cz=9.5+P['capacitor_diameter']/2+1.25
cap=cylinder(P['capacitor_diameter']/2,P['capacitor_body_length'],(-P['capacitor_body_length']/2,cy,cz),(1,0,0))
for z in (-P['capacitor_lead_spacing']/2,P['capacitor_lead_spacing']/2): cap=cap.fuse(cylinder(.45,P['capacitor_wire_clearance'],(P['capacitor_body_length']/2,cy,cz+z),(1,0,0)))
co=feature('Capacitor_2200uF',cap,color=(.12,.13,.15),status='ELECTRICAL_VALIDATION_REQUIRED — Ø12.5 x 25 placeholder; voltage/polarity/actual size unknown')
for key in ('capacitor_diameter','capacitor_body_length','capacitor_lead_spacing','capacitor_wire_clearance'):
    co.addProperty('App::PropertyLength',key,'Capacitor dimensions'); setattr(co,key,P[key]); co.setExpression(key,'Hardware_Parameters.'+key)

# Unknown charger on side: PCB plane YZ. USB inlet faces rear, away from battery.
charger=box(1.6,P['charger_length'],P['charger_width'],-21,rear-34,33)
charger=charger.fuse(box(4.2,12,10,-19.4,rear-31,37))
usb=box(3.2,8.5,9,-20.5,rear-8,38)
charger=charger.fuse(usb)
ch=feature('Charger_Module_PLACEHOLDER',charger,color=(.15,.3,.7),status='Unknown module; TP4056-like 26 x 19 x 5.8 envelope only; no verified power-path')
lid=lid.cut(box(5,6,10,-21.4,rear-3,37.5))
usb_access=box(6,16,11,-21.8,rear-5,37)
shell=shell.cut(usb_access); lid=lid.cut(usb_access)
reserve('USB_Cable_Insert_Keepout',usb_access,{'Charger_Module_PLACEHOLDER'})
# Source wire/switch positions are schematic; labels prevent mistaken electrical sign-off.
sw=box(5,8,6,18,20,35).fuse(box(3,3,3,22,22.5,36.5))
switch=feature('Power_Switch_PLACEHOLDER',sw,color=(.1,.1,.1),status='Unknown SPDT slide switch; body/actuator dimensions unverified')
shell=shell.cut(box(6.5,8.6,6.6,17.7,19.7,34.7))
reserve('Power_Switch_Finger_Access',box(10,8,8,24,20,34),{'Power_Switch_PLACEHOLDER'})

# Removable trays with rounded edges; tie/foam retention needs physical prototyping.
def bracket(name,s): return feature(name,s,'Mounts_Removable',(.5,.7,.65),'Prototype fixture; fastener/foam/strap fit requires print coupon')
tray=box(33,7,1,-15.5,battery_y-.8,10.5)
tray=tray.fuse(box(.5,7,50,-15.5,battery_y-.8,10.5)).fuse(box(.5,7,50,17,battery_y-.8,10.5))
tray=tray.cut(box(2,4,12,-16,27,49.5))
tray=tray.cut(box(4,8,14,-18,25,48))
for yy in (battery_y-.8,battery_y+5.7): tray=tray.fuse(box(33,.5,4,-15.5,yy,11.5))
bracket('Battery_Tray_Removable',tray)
band=box(32,6.2,2,-15,battery_y-.6,40).cut(box(30.6,5.6,3,-14.3,battery_y-.3,39.5))
feature('Battery_Soft_Retaining_Band',band,color=(.2,.2,.25),status='Elastic band placeholder, not rigid PLA; verify stretch/adhesion/pack pressure')
foam=box(30,5,.5,-14,battery_y,11.5)
feature('Battery_Soft_Pad',foam,color=(.3,.3,.3),status='0.5 mm foam placeholder; no sharp rigid clamp on pouch')
boost_tray=box(39,19,.9,-19.5,by-.9,9.6)
for x in (-18,18): boost_tray=boost_tray.fuse(box(2,17.2,.5,x-1,by,10.5))
for x in (-17.2,17.2):
    for yy in (by+2,by+15.2): boost_tray=boost_tray.cut(cylinder(2.1,3,(x,yy,9)))
boost_tray=boost_tray.cut(cylinder(2.1,3,(-16,by+2,9)))
bracket('Boost_Tray_Removable',boost_tray)
# Capacitor cradle rests on the floor; semicircular relief leaves room for a soft strap.
cradle=box(P['capacitor_body_length']+2,P['capacitor_diameter']+2,2,-P['capacitor_body_length']/2-1,cy-P['capacitor_diameter']/2-1,9.5)
cradle=cradle.cut(cylinder(P['capacitor_diameter']/2+.3,P['capacitor_body_length']+3,(-P['capacitor_body_length']/2-1.5,cy,cz),(1,0,0)))
cradle=cradle.cut(cylinder(P['capacitor_diameter']/2+1,4,(-2,cy,cz),(1,0,0)))
for x in (-10,10): cradle=cradle.cut(cylinder(2.1,3,(x,-7,9)))
bracket('Capacitor_Cradle',cradle)
strap=cylinder(P['capacitor_diameter']/2+1,4,(-2,cy,cz),(1,0,0)).cut(cylinder(P['capacitor_diameter']/2+.3,4.2,(-2.1,cy,cz),(1,0,0)))
feature('Capacitor_Soft_Retaining_Strap',strap,color=(.2,.2,.25),status='Elastic strap placeholder; supports can, not leads; material and fit unverified')
esp_tray=box(30,13.5,1,-15,esp_y-2,27.5)
for x in (-15,14): esp_tray=esp_tray.fuse(box(1,3,31,x,esp_y,28.5))
bracket('ESP32_Edge_Cradle_No_PCB_Holes',esp_tray)
charger_clip=box(.5,27,20,-21.5,rear-34.5,32.5).fuse(box(6,27,.5,-21.5,rear-34.5,32.5))
bracket('Charger_Edge_Bracket',charger_clip)
# OLED side tabs support PCB edges only; clear glass and retain pin access.
oled_mount=box(8,2,1,-21.5,-10.8,43.5).fuse(box(8,2,1,13.5,-10.8,43.5))
bracket('OLED_PCB_Edge_Supports',oled_mount)

# Route explicit flexible leads through free side/rear corridors. They are not current-rated.
routes=[('Battery_To_Boost',[V(4,battery_y+2.5,70),V(4,26.5,70),V(4,26.5,28),V(17,by+15,26),V(17,by+15,12.6)]),
        ('Boost_To_ESP32',[V(-16,by+2,12.6),V(-16,by+2,26),V(-16,24,26),V(-10,24,27),V(-10,24,42),V(-12,esp_y+12,42)]),
        ('OLED_I2C_Loom',[V(0,-5,70),V(0,-1,70),V(19.5,-1,70),V(19.5,-1,53),V(19.5,20,53),V(12,esp_y+12,50)]),
        ('Charger_Battery_Lead',[V(-16,29,50),V(-16,26,62),V(-10,battery_y+2.5,65)]),
        ('Capacitor_Output_Lead',[V(17.5,cy,19.5),V(18,8,24),V(-19,8,24),V(-19,by+15,21),V(-17,by+15,12.6)])]
route_owners={'Battery_To_Boost':{'Battery_LiPo_503048','Power_Boost_MT3608'},'Boost_To_ESP32':{'Power_Boost_MT3608','ESP32_CAM_AI_Thinker'},'OLED_I2C_Loom':{'OLED_096_Header','ESP32_CAM_AI_Thinker'},'Charger_Battery_Lead':{'Charger_Module_PLACEHOLDER','Battery_LiPo_503048'},'Capacitor_Output_Lead':{'Capacitor_2200uF','Power_Boost_MT3608'}}
for name,pts in routes:
    shape=None
    for a,b in zip(pts,pts[1:]):
        seg=Part.makeCylinder(P['wire_diameter']/2,(b-a).Length,a,b-a)
        seg=seg.fuse(Part.makeSphere(P['wire_diameter']/2,b))
        shape=seg if shape is None else shape.fuse(seg)
    feature(name,shape,color=(.65,.15,.12),status='Schematic centerline/Ø1.4 routing placeholder; bend radius and conductor rating NOT verified')
    enlarged=[]
    for a,b in zip(pts,pts[1:]):
        enlarged.append(Part.makeCylinder(P['wire_route_radius'],(b-a).Length,a,b-a))
        enlarged.append(Part.makeSphere(P['wire_route_radius'],b))
    reserve(name+'_Routing_Envelope',Part.makeCompound(enlarged),route_owners[name]|{name})

# Add low rear anti-tip support inside the deeper body's footprint, if needed.
skid=box(36,14,2,-18,rear-17,0)
skid=skid.fuse(box(3,12,5,-18,rear-16,2)).fuse(box(3,12,5,15,rear-16,2))
bracket('Rear_AntiTip_Skid',skid)
doc.getObject('BMO_Front_Shell').Shape=shell.removeSplitter()
doc.getObject('BMO_Back_Cover').Shape=lid.removeSplitter()
doc.getObject('BMO_Enclosure_SectionCut').Shape=shell.fuse(lid).cut(box(100,150,150,-100,-50,-30))
doc.getObject('BMO_Enclosure_SectionCut').ViewObject.Visibility=False

# Validate actual geometry. Report unresolved clashes rather than pretending fit.
excluded={'BMO_Enclosure_SectionCut'}
parts=[o for o in doc.Objects if o.TypeId=='Part::Feature' and o.Name not in excluded and o not in groups['Keepouts_And_Service'].Group and o not in groups['Layout_Alternatives'].Group and o not in groups['Battery_Alternative'].Group]
report={'status':'DESIGN_REVIEW_REQUIRED','selected_layout':selected,'old_body_mm':[48,30,68],'new_body_mm':[48,depth,68],'cavity_nominal_mm':[43,depth-5.5,63],'parts':{},'overlaps':[],'keepout_conflicts':[],'button_sweep':[]}
for o in parts:
    report['parts'][o.Name]={'valid':o.Shape.isValid(),'solids':len(o.Shape.Solids),'bounds':bounds(o.Shape),'volume_mm3':o.Shape.Volume}
for a,b in itertools.combinations(parts,2):
    ba=bounds(a.Shape); bb=bounds(b.Shape)
    if vol_overlap(ba,bb)<.0001: continue
    v=a.Shape.common(b.Shape).Volume
    if v>.001:
        connection_pairs=[{route,owner} for route,owners in route_owners.items() for owner in owners]
        classification='display overlay' if {a.Name,b.Name}=={'OLED_096_Glass','OLED_096_ActiveArea'} else ('terminal connection — intended' if {a.Name,b.Name} in connection_pairs else 'REVIEW_REQUIRED')
        report['overlaps'].append({'a':a.Name,'b':b.Name,'volume_mm3':v,'classification':classification})
for ko,owners in keepouts:
    for o in parts:
        if o.Name in owners: continue
        if vol_overlap(bounds(ko.Shape),bounds(o.Shape))<.0001: continue
        v=ko.Shape.common(o.Shape).Volume
        if v>.001: report['keepout_conflicts'].append({'keepout':ko.Name,'part':o.Name,'volume_mm3':v})
for name in ('BMO_DPad_Yellow','BMO_Action_Button_Red'):
    for travel in (0,.1,.2,P['button_travel']):
        cap=doc.getObject(name).Shape.copy(); cap.translate(V(0,travel,0))
        report['button_sweep'].append({'cap':name,'inward_travel_mm':travel,'shell_overlap_mm3':cap.common(shell).Volume})
# Direct exterior preservation evidence: all accepted material above roof unchanged.
ear_region=box(100,60,30,-50,-25,75)
ear_before=original_shell.common(ear_region); ear_after=shell.common(ear_region)
report['ears_symmetric_difference_mm3']=ear_before.cut(ear_after).Volume+ear_after.cut(ear_before).Volume
report['nominal_cavity_volume_mm3']=43*(depth-5.5)*63
cavity=rounded(43,depth-5.5,63,2,-21.5,-12.25,9.5)
occupied=0
for o in parts:
    if o.Name not in ('BMO_Front_Shell','BMO_Back_Cover'): occupied+=o.Shape.common(cavity).Volume
report['occupied_volume_sum_mm3']=occupied
report['cavity_minus_occupied_upper_estimate_mm3']=cavity.Volume-occupied
(OUT/'integration-audit.json').write_text(json.dumps(report,indent=2))
doc.recompute(); Gui.activateWorkbench('PartWorkbench'); Gui.updateGui()
doc.saveAs(str(OUT/'BMO_HARDWARE_INTEGRATED.FCStd'))
print(json.dumps({'depth':depth,'candidates':len(candidates),'feasible':len(feasible),'overlaps':report['overlaps'],'keepout_conflicts':report['keepout_conflicts'],'ears_difference':report['ears_symmetric_difference_mm3'],'button_sweep':report['button_sweep']},indent=2))
