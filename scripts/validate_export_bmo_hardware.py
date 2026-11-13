"""FreeCAD MCP final mechanical checks, prototype meshes and eight CAD views."""
import Part
import MeshPart
import json
import math
from collections import Counter
from pathlib import Path
from FreeCAD import Vector as V

ROOT=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET'); OUT=ROOT/'cad/hardware_review'
P=json.loads((OUT/'parameters.json').read_text()); audit=json.loads((OUT/'integration-audit.json').read_text())
doc=App.activeDocument()
assert doc.FileName==str(OUT/'BMO_HARDWARE_INTEGRATED.FCStd')
shell=doc.getObject('BMO_Front_Shell').Shape; lid=doc.getObject('BMO_Back_Cover').Shape
depth=audit['new_body_mm'][1]; rear=depth-15
report={'status':'DESIGN_REVIEW_REQUIRED','wall_samples':{},'service_sweeps':[],'clearances_mm':[],'ears':{},'meshes':[]}
for name,a,b in [('front',(0,-17,35),(0,-8,35)),('left',(-26,-5,55),(-19,-5,55)),('right',(19,-5,55),(26,-5,55)),('bottom',(0,-10,5),(0,-10,12)),('top',(0,0,70),(0,0,77))]:
    report['wall_samples'][name]=shell.common(Part.makeLine(V(*a),V(*b))).Length
report['wall_samples']['rear']=lid.common(Part.makeLine(V(10,rear-4,55),V(10,rear+1,55))).Length
physical_names=list(audit['parts'])
parts=[doc.getObject(n) for n in physical_names]
core=['Battery_LiPo_503048','Power_Boost_MT3608','Capacitor_2200uF','ESP32_CAM_AI_Thinker','Charger_Module_PLACEHOLDER']
for i,a in enumerate(core):
    for b in core[i+1:]:
        report['clearances_mm'].append({'a':a,'b':b,'distance_mm':doc.getObject(a).Shape.distToShape(doc.getObject(b).Shape)[0]})
report['lid_overlap_mm3']=shell.common(lid).Volume
report['cap_to_lid_mm']=doc.getObject('Capacitor_2200uF').Shape.distToShape(lid)[0]
report['battery_to_lid_mm']=doc.getObject('Battery_LiPo_503048').Shape.distToShape(lid)[0]
cavity=Part.makeBox(43,depth-5.5,63,V(-21.5,-12.25,9.5)).cut(shell)
report['empty_cavity_after_shell_features_mm3']=cavity.Volume
mounts=list(doc.getObject('Mounts_Removable').Group)
report['empty_cavity_after_mounts_mm3']=cavity.cut(Part.makeCompound([o.Shape for o in mounts])).Volume
upright=doc.getObject('Capacitor_2200uF').Shape.copy()
cap_y=audit['selected_layout']['cap_y']
upright.rotate(V(0,cap_y,17),V(0,1,0),-90); upright.translate(V(0,0,6.25))
report['capacitor_orientation_comparison']={'horizontal':'selected below ESP32','upright_at_same_bay':[],'limitation':'Compared horizontal and upright at selected bay; arbitrary tilt/location global optimum not claimed'}
for name in ('ESP32_CAM_AI_Thinker','Power_Boost_MT3608','Charger_Module_PLACEHOLDER','BMO_Front_Shell','BMO_Back_Cover'):
    v=upright.common(doc.getObject(name).Shape).Volume
    if v>.001: report['capacitor_orientation_comparison']['upright_at_same_bay'].append({'part':name,'volume_mm3':v})
report['button_to_switch_rest_gap_mm']={}
for cap,sw in [('BMO_DPad_Yellow','Tactile_Switch_A_DPad'),('BMO_Action_Button_Red','Tactile_Switch_B_Red')]:
    report['button_to_switch_rest_gap_mm'][cap]=doc.getObject(cap).Shape.distToShape(doc.getObject(sw).Shape)[0]
report['pilot_axis_obstructions_mm']=[]
for x,z in [(-20,30),(20,30),(-21.5,69),(21.5,69)]:
    line=Part.makeLine(V(x,4.1,z),V(x,rear+1,z))
    report['pilot_axis_obstructions_mm'].append({'axis':[x,z],'solid_length_mm':shell.common(line).Length+lid.common(line).Length})

# Conservative continuous rear extraction boxes, with wires disconnected first.
stages=[('battery_tray',(-15.5,28,10.5,17.5,rear+45,70),{'Battery_LiPo_503048','Battery_Tray_Removable','Battery_Soft_Pad','Battery_Soft_Retaining_Band'}),
        ('esp_after_battery',(-15,2,27.5,15,rear+45,69.5),{'ESP32_CAM_AI_Thinker','ESP32_Edge_Cradle_No_PCB_Holes','Battery_LiPo_503048','Battery_Tray_Removable','Battery_Soft_Pad','Battery_Soft_Retaining_Band'}),
        ('boost_after_esp_battery',(-19.5,9,9.6,19.5,rear+45,25.1),{'Power_Boost_MT3608','Boost_Tray_Removable','Battery_LiPo_503048','Battery_Tray_Removable','Battery_Soft_Pad','Battery_Soft_Retaining_Band','ESP32_CAM_AI_Thinker','ESP32_Edge_Cradle_No_PCB_Holes'})]
wire_names={'Battery_To_Boost','Boost_To_ESP32','OLED_I2C_Loom','Charger_Battery_Lead','Capacitor_Output_Lead'}
for label,b,removed in stages:
    sweep=Part.makeBox(b[3]-b[0],b[4]-b[1],b[5]-b[2],V(*b[:3]))
    conflicts=[]
    for o in parts:
        if o.Name in removed|wire_names|{'BMO_Back_Cover'}: continue
        vol=sweep.common(o.Shape).Volume
        if vol>.001: conflicts.append({'part':o.Name,'volume_mm3':vol})
    report['service_sweeps'].append({'stage':label,'conservative_swept_bounds':b,'conflicts':conflicts,'sequence':'Remove lid and disconnect looms; remove listed modules in order'})

# Sample hollow-ear wall ligaments and roof-root sections; no strength simulation.
ligaments=[]
for f in shell.Faces:
    b=f.BoundBox
    if b.ZMax>80 and b.YLength<1e-5 and len(f.Wires)>1:
        outer=f.OuterWire
        for w in f.Wires:
            if not w.isSame(outer): ligaments.append(outer.distToShape(w)[0])
report['ears']={'difference_from_source_mm3':audit['ears_symmetric_difference_mm3'],'sampled_min_ligament_mm':min(ligaments) if ligaments else None,'strength':'NOT TESTED; layer adhesion and keyring pull test required'}

# Static mass model with the actual planar support patches, including the rear skid.
mass_map={'OLED_096_PCB':3,'OLED_096_Glass':1.5,'OLED_096_ActiveArea':0,'OLED_096_Header':.5,'Tactile_Switch_A_DPad':.3,'Tactile_Switch_B_Red':.3,'Battery_LiPo_503048':14,'ESP32_CAM_AI_Thinker':10,'Power_Boost_MT3608':4,'Capacitor_2200uF':5,'Charger_Module_PLACEHOLDER':3,'Power_Switch_PLACEHOLDER':1}
mass=0; weighted=V(0,0,0); contact_points=[]
for o in parts:
    m=mass_map.get(o.Name,o.Shape.Volume*.00124)
    if o.Shape.Volume>0:
        center=V(0,0,0)
        for s in o.Shape.Solids: center+=s.CenterOfMass*s.Volume/o.Shape.Volume
        weighted+=center*m; mass+=m
    if o.Name.startswith('BMO_Sitting_') or o.Name=='Rear_AntiTip_Skid':
        for f in o.Shape.Faces:
            b=f.BoundBox
            if abs(b.ZMin)<1e-5 and abs(b.ZMax)<1e-5:
                for e in f.Edges: contact_points.extend([(p.x,p.y) for p in e.discretize(Number=20)])
def cross(o,a,b): return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
def hull(points):
    points=sorted(set(points)); a=[]; b=[]
    for p in points:
        while len(a)>1 and cross(a[-2],a[-1],p)<=0: a.pop()
        a.append(p)
    for p in reversed(points):
        while len(b)>1 and cross(b[-2],b[-1],p)<=0: b.pop()
        b.append(p)
    return a[:-1]+b[:-1]
polygon=hull(contact_points); com=weighted/mass
margin=min(cross(p,polygon[(i+1)%len(polygon)],(com.x,com.y))/math.dist(p,polygon[(i+1)%len(polygon)]) for i,p in enumerate(polygon))
report['static_estimate']={'mass_g':mass,'com_xyz_mm':[com.x,com.y,com.z],'support_margin_mm':margin,'mass_assumptions_g':mass_map,'plastic_density_g_mm3':.00124,'limitation':'Uniform solid plastic volume, unmeasured electronics masses; no dynamic, friction or flex test'}

mesh_dir=OUT/'prototype_stl'; mesh_dir.mkdir(exist_ok=True)
changed=['BMO_Front_Shell','BMO_Back_Cover','Battery_Tray_Removable','Boost_Tray_Removable','Capacitor_Cradle','ESP32_Edge_Cradle_No_PCB_Holes','Charger_Edge_Bracket','OLED_PCB_Edge_Supports','Rear_AntiTip_Skid']
for name in changed:
    obj=doc.getObject(name)
    if not obj.Shape.isValid():
        report['meshes'].append({'part':name,'exported':False,'error':'Invalid BRep'}); continue
    mesh=MeshPart.meshFromShape(Shape=obj.Shape,LinearDeflection=.08,AngularDeflection=.15,Relative=False)
    edges=Counter()
    for facet in mesh.Facets:
        pts=[tuple(round(float(c),5) for c in p) for p in facet.Points]
        for a,b in zip(pts,pts[1:]+pts[:1]): edges[tuple(sorted((a,b)))]+=1
    non_two=sum(1 for c in edges.values() if c!=2)
    path=mesh_dir/(name+'_DESIGN_REVIEW_REQUIRED.stl'); mesh.write(str(path))
    report['meshes'].append({'part':name,'exported':True,'file':str(path.relative_to(ROOT)),'triangles':mesh.CountFacets,'non_two_face_edges_rounded_1e5':non_two,'closed_edge_check':non_two==0,'brep_valid':True})
for name in ('Battery_LiPo_503048','Battery_LiPo_503040','Power_Boost_MT3608','Capacitor_2200uF'):
    Part.export([doc.getObject(name)],str(OUT/(name+'.step')))

# Eight requested scene views; transient visibility/placement restored before save.
view=Gui.activeDocument().activeView(); view.setCameraType('Orthographic')
view.setAnimationEnabled(False) if hasattr(view,'setAnimationEnabled') else None
visible={o.Name:o.ViewObject.Visibility for o in doc.Objects if hasattr(o,'ViewObject')}
placements={o.Name:o.Placement for o in parts}
def orientation(yaw=35,pitch=75): return App.Rotation(V(0,0,1),yaw).multiply(App.Rotation(V(1,0,0),pitch))
def save(name,rot):
    view.setCameraOrientation(rot.Q); Gui.updateGui(); view.fitAll(); Gui.updateGui()
    view.saveImage(str(OUT/(name+'.png')),1600,1400,'White')
for o in doc.Objects:
    if hasattr(o,'ViewObject') and o.TypeId=='Part::Feature': o.ViewObject.Visibility=o in parts
save('01-front',orientation(0,90)); save('02-side',orientation(90,90)); save('03-back',orientation(155,80))
for name,delta in [('BMO_Back_Cover',V(0,38,0)),('Battery_LiPo_503048',V(0,16,8)),('Battery_Tray_Removable',V(0,16,8)),('ESP32_CAM_AI_Thinker',V(0,8,18)),('Power_Boost_MT3608',V(0,7,-4))]:
    obj=doc.getObject(name); pl=obj.Placement; pl.Base=pl.Base+delta; obj.Placement=pl
save('04-exploded',orientation(40,70))
for o in parts: o.Placement=placements[o.Name]
doc.getObject('BMO_Front_Shell').ViewObject.Visibility=False
doc.getObject('BMO_Back_Cover').ViewObject.Visibility=False
doc.getObject('BMO_Enclosure_SectionCut').ViewObject.Visibility=True
save('05-cross-section',orientation(35,75))
doc.getObject('BMO_Enclosure_SectionCut').ViewObject.Visibility=False
for o in parts:
    if o.Name.startswith('BMO_') or '_Letter_' in o.Name or o.Name in ('Triangle_Cyan','Upper_Button_Blue','Small_Button_Green'): o.ViewObject.Visibility=False
save('06-internal-hardware',orientation(155,70))
for o in parts: o.ViewObject.Visibility=o.Name in ('Battery_LiPo_503048','Battery_Tray_Removable','Battery_Soft_Pad','Battery_Soft_Retaining_Band','Charger_Battery_Lead')
save('07-battery-compartment',orientation(145,70))
for o in parts: o.ViewObject.Visibility=o.Name in ('Power_Boost_MT3608','Capacitor_2200uF','Capacitor_Cradle','Capacitor_Soft_Retaining_Strap','Boost_Tray_Removable','Capacitor_Output_Lead')
save('08-power-and-capacitor',orientation(35,65))
for name,vis in visible.items():
    obj=doc.getObject(name)
    if obj: obj.ViewObject.Visibility=vis
save('09-overall',orientation(-35,78))
doc.recompute(); doc.save()
(OUT/'mechanical-validation.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'walls':report['wall_samples'],'service':report['service_sweeps'],'pilot_axes':report['pilot_axis_obstructions_mm'],'ears':report['ears'],'static':report['static_estimate'],'meshes':report['meshes']},indent=2))
