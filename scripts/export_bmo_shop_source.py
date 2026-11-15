"""FreeCAD MCP exact fit audit, raw print meshes, STEP and actual previews."""
import Part
import MeshPart
import json
import itertools
from pathlib import Path
from FreeCAD import Vector as V
ROOT=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET'); OUT=ROOT/'cad/print_shop'
doc=next(d for d in App.listDocuments().values() if d.FileName==str(OUT/'BMO_PRINT_SHOP.FCStd'))
App.setActiveDocument(doc.Name); Gui.activateWorkbench('PartWorkbench'); Gui.updateGui()
printed=['BMO_MAIN_BODY','BMO_BACK_COVER','BMO_DPAD_YELLOW','BMO_BUTTON_RED']
hardware=['OLED_096_PCB','OLED_096_Glass','OLED_096_ActiveArea','OLED_096_Header','Tactile_Switch_A_DPad','Tactile_Switch_B_Red','ESP32_CAM_AI_Thinker','Battery_LiPo_503048','Power_Boost_MT3608','Capacitor_2200uF','Charger_Module_PLACEHOLDER','Power_Switch_PLACEHOLDER','Battery_Soft_Pad','Battery_Soft_Retaining_Band','Capacitor_Soft_Retaining_Strap','FR4_DPAD_CARRIER_NOT_PRINTED','FR4_RED_CARRIER_NOT_PRINTED']
parts={n:doc.getObject(n).Shape for n in printed+hardware}
def bb(s):
    b=s.BoundBox; return [b.XMin,b.YMin,b.ZMin,b.XMax,b.YMax,b.ZMax]
def potential(a,b): return all(min(a[i+3],b[i+3])-max(a[i],b[i])>1e-6 for i in range(3))
def move(s,v):
    s=s.copy(); s.translate(V(*v)); return s
audit={'status':'DESIGN_REVIEW_REQUIRED','printed_parts':printed,'parts':{n:{'valid':s.isValid(),'solids':len(s.Solids),'volume_mm3':s.Volume,'bounds':bb(s)} for n,s in parts.items()},'overlaps':[],'keepouts':[],'cap_travel':[]}
for a,b in itertools.combinations(parts,2):
    if not potential(bb(parts[a]),bb(parts[b])): continue
    intersection=parts[a].common(parts[b]); v=0 if intersection.isNull() else intersection.Volume
    if v>.001: audit['overlaps'].append({'a':a,'b':b,'volume_mm3':v,'expected':{a,b}=={'OLED_096_Glass','OLED_096_ActiveArea'}})
for ko,exempt in [('ESP32_Antenna_Keepout',{'ESP32_CAM_AI_Thinker'}),('USB_Cable_Insert_Keepout',{'Charger_Module_PLACEHOLDER'}),('Power_Switch_Finger_Access',{'Power_Switch_PLACEHOLDER'})]:
    s=doc.getObject(ko).Shape
    for n,t in parts.items():
        if n in exempt or not potential(bb(s),bb(t)): continue
        v=s.common(t).Volume
        if v>.001: audit['keepouts'].append({'reserve':ko,'part':n,'volume_mm3':v})
for cap,sw,board,cx,cz in [('BMO_DPAD_YELLOW','Tactile_Switch_A_DPad','FR4_DPAD_CARRIER_NOT_PRINTED',-12.5,27),('BMO_BUTTON_RED','Tactile_Switch_B_Red','FR4_RED_CARRIER_NOT_PRINTED',12.5,21.5)]:
    stem=Part.makeCylinder(1.7,1.2,V(cx,-11.95,cz),V(0,1,0))
    housing=parts[sw].cut(stem)
    for travel in (-.05,0,.05,.1,.2,.25,.3,.35):
        s=move(parts[cap],(0,travel,0)); compression=max(0,travel-.05)
        audit['cap_travel'].append({'cap':cap,'travel_mm':travel,'body_overlap':s.common(parts['BMO_MAIN_BODY']).Volume,'board_overlap':s.common(parts[board]).Volume,'housing_overlap':s.common(housing).Volume,'compressed_stem_overlap':s.common(move(stem,(0,compression,0))).Volume})
(OUT/'fit-validation.json').write_text(json.dumps(audit,indent=2))
assert all(r['valid'] and r['solids']==1 for r in audit['parts'].values()),'Invalid/disconnected assembly member'
assert not [r for r in audit['overlaps'] if not r['expected']], 'Actual assembly interference'
assert not audit['keepouts'],'Keepout obstruction'
assert all(max(r[k] for k in ('body_overlap','board_overlap','housing_overlap','compressed_stem_overlap'))<.001 for r in audit['cap_travel'] if 0<=r['travel_mm']<=.3),'Cap travel jam'
RAW=OUT/'_mesh_source'; STEP=OUT/'step'; IMG=OUT/'preview'
for p in (RAW,STEP,IMG): p.mkdir(exist_ok=True)
manifest={'status':'DESIGN_REVIEW_REQUIRED','printed_parts':[],'assembly_objects':printed+hardware}
for name in printed:
    s=doc.getObject(name).Shape.copy(); rotation=0 if name=='BMO_MAIN_BODY' else (90 if name in ('BMO_DPAD_YELLOW','BMO_BUTTON_RED') else -90)
    if rotation: s.rotate(V(0,0,0),V(1,0,0),rotation)
    if hasattr(s,'cleaned'): s=s.cleaned()
    mesh=MeshPart.meshFromShape(Shape=s,LinearDeflection=.025,AngularDeflection=.10,Relative=False)
    b=mesh.BoundBox; translation=V(-(b.XMin+b.XMax)/2,-(b.YMin+b.YMax)/2,-b.ZMin)
    mesh.translate(translation.x,translation.y,translation.z)
    file=RAW/(name+'.stl'); mesh.write(str(file))
    manifest['printed_parts'].append({'name':name,'source':str(file.relative_to(ROOT)),'color':'yellow' if 'DPAD' in name else ('red' if name=='BMO_BUTTON_RED' else 'mint'),'cad_volume_mm3':parts[name].Volume,'rotate_x_degrees':rotation,'translation_mm':[translation.x,translation.y,translation.z]})
    Part.export([doc.getObject(name)],str(STEP/(name+'.step')))
Part.export([doc.getObject(n) for n in parts],str(STEP/'BMO_ASSEMBLY.step'))
(OUT/'source-export.json').write_text(json.dumps(manifest,indent=2))
doc.getObject('Final_Print_Parts').Group=[doc.getObject(n) for n in printed]
for o in doc.Objects:
    if o.TypeId in ('App::DocumentObjectGroup','App::Part'): o.ViewObject.Visibility=True
for o in doc.Objects:
    if hasattr(o,'Shape') and hasattr(o,'ViewObject'): o.ViewObject.Visibility=o.Name in parts
view=Gui.activeDocument().activeView(); view.setCameraType('Orthographic')
if hasattr(view,'setAnimationEnabled'): view.setAnimationEnabled(False)
def orientation(yaw=0,pitch=90): return App.Rotation(V(0,0,1),yaw).multiply(App.Rotation(V(1,0,0),pitch))
def save(name,rot):
    view.setCameraOrientation(rot.Q); Gui.updateGui(); view.fitAll(); view.redraw(); Gui.updateGui()
    view.saveImage(str(IMG/(name+'.png')),1600,1600,'White')
save('01-assembly',orientation(-35,78)); save('02-front',orientation()); save('03-side-BMO',orientation(-90)); save('04-back-switch',orientation(180))
objects=[doc.getObject(n) for n in parts]; placements={o.Name:o.Placement for o in objects}; temp=[]
try:
    for o in objects:
        if o.Name in {'BMO_BACK_COVER','ESP32_CAM_AI_Thinker','Battery_LiPo_503048','Battery_Soft_Pad','Battery_Soft_Retaining_Band','Power_Switch_PLACEHOLDER'}:
            pl=o.Placement; pl.Base=pl.Base+V(0,36,6); o.Placement=pl
        elif o.Name in ('BMO_DPAD_YELLOW','BMO_BUTTON_RED'):
            pl=o.Placement; pl.Base=pl.Base+V(0,-12,0); o.Placement=pl
    save('05-exploded',orientation(-45,72))
    for o in objects: o.Placement=placements[o.Name]
    cut=Part.makeBox(100,150,150,V(-100,-50,-10))
    for name in ('BMO_MAIN_BODY','BMO_BACK_COVER'):
        o=doc.addObject('Part::Feature','Print_Shop_Section_'+name); o.Shape=parts[name].cut(cut)
        o.ViewObject.ShapeColor=(.35,.76,.72); temp.append(o); doc.getObject(name).ViewObject.Visibility=False
    save('06-section',orientation(-35,75))
finally:
    for o in objects: o.Placement=placements[o.Name]; o.ViewObject.Visibility=True
    for o in temp: doc.removeObject(o.Name)
    view.setCameraOrientation(orientation(-35,78).Q); Gui.updateGui(); view.fitAll(); view.redraw(); Gui.updateGui()
doc.recompute(); doc.save()
print(json.dumps({'fit':'passed','parts':manifest['printed_parts'],'render_path':str(IMG.relative_to(ROOT)),'visible':{n:doc.getObject(n).ViewObject.Visibility for n in printed}}))
