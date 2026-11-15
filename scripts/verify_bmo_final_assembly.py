"""FreeCAD MCP sampled service paths, fit, ears, walls and design comparisons."""
import Part
import json
import itertools
import math
from pathlib import Path
from FreeCAD import Vector as V
ROOT=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET'); OUT=ROOT/'cad/final_print'
doc=App.activeDocument(); assert doc.getObject('BMO_DPAD_YELLOW')
P=json.loads((OUT/'parameters.json').read_text()); rear=P['body_depth']-15
prints=['BMO_MAIN_BODY','BMO_BACK_COVER','BMO_DPAD_YELLOW','BMO_BUTTON_RED','BMO_SWITCH_RETAINER']
hardware=['OLED_096_PCB','OLED_096_Glass','OLED_096_ActiveArea','OLED_096_Header','Tactile_Switch_A_DPad','Tactile_Switch_B_Red','ESP32_CAM_AI_Thinker','Battery_LiPo_503048','Power_Boost_MT3608','Capacitor_2200uF','Charger_Module_PLACEHOLDER','Power_Switch_PLACEHOLDER','Battery_Soft_Pad','Battery_Soft_Retaining_Band','Capacitor_Soft_Retaining_Strap']
parts={n:doc.getObject(n).Shape for n in prints+hardware}
def bb(s):
    b=s.BoundBox; return [b.XMin,b.YMin,b.ZMin,b.XMax,b.YMax,b.ZMax]
def potential(a,b): return all(min(a[i+3],b[i+3])-max(a[i],b[i])>1e-6 for i in range(3))
def moved(s,v):
    s=s.copy(); s.translate(V(*v)); return s
report={'status':'DESIGN_REVIEW_REQUIRED','parts':{},'overlaps':[],'keepout_conflicts':[], 'service':[], 'button_sweeps':[], 'ears':[], 'walls':{}, 'comparisons':[]}
service_filter=globals().get('SERVICE_LABELS')
prior=json.loads((OUT/'assembly-validation.json').read_text()) if service_filter else None
for n,s in parts.items():
    report['parts'][n]={'valid':s.isValid(),'solids':len(s.Solids),'bounds':bb(s),'volume_mm3':s.Volume}
    if prior:
        old=prior['parts'][n]
        unchanged=abs(old['volume_mm3']-s.Volume)<1e-6 and all(abs(a-b)<1e-6 for a,b in zip(old['bounds'],bb(s)))
        if not unchanged and n=='Battery_Soft_Retaining_Band' and '01_lid_battery_esp' in service_filter:
            report['elastic_strap_path_rechecked']=True
        elif not unchanged and n=='BMO_BACK_COVER' and '01_lid_battery_esp' in service_filter:
            before=doc.getObject('Before_Tray_Reinforcement')
            assert before and abs(before.Shape.Volume-old['volume_mm3'])<1e-6
            report['reinforced_lid_path_rechecked']=True
        elif not unchanged and n=='BMO_MAIN_BODY':
            before=doc.getObject('Before_Switch_Seat_Clearance')
            assert before and abs(before.Shape.Volume-old['volume_mm3'])<1e-6
            assert s.cut(before.Shape).Volume<1e-6, 'New material invalidates prior clear paths'
            report['material_removal_preserves_prior_clear_paths']=before.Shape.Volume-s.Volume
        else:
            assert unchanged, 'Geometry changed: run full validation'
for a,b in itertools.combinations(parts,2):
    if not potential(bb(parts[a]),bb(parts[b])): continue
    v=parts[a].common(parts[b]).Volume
    if v>.001: report['overlaps'].append({'a':a,'b':b,'volume_mm3':v,'expected':{a,b}=={'OLED_096_Glass','OLED_096_ActiveArea'}})
shell=parts['BMO_MAIN_BODY']; lid=parts['BMO_BACK_COVER']; retainer=parts['BMO_SWITCH_RETAINER']
for ko,exempt in [('ESP32_Antenna_Keepout',{'ESP32_CAM_AI_Thinker'}),('USB_Cable_Insert_Keepout',{'Charger_Module_PLACEHOLDER'}),('Power_Switch_Finger_Access',{'Power_Switch_PLACEHOLDER'})]:
    s=doc.getObject(ko).Shape
    for n,t in parts.items():
        if n in exempt or not potential(bb(s),bb(t)): continue
        v=s.common(t).Volume
        if v>.001: report['keepout_conflicts'].append({'reserve':ko,'part':n,'volume_mm3':v})
for cap,sw,cx,cz in [('BMO_DPAD_YELLOW','Tactile_Switch_A_DPad',-12.5,27),('BMO_BUTTON_RED','Tactile_Switch_B_Red',10.5,21.5)]:
    stem=Part.makeCylinder(1.7,1.2,V(cx,-11.95,cz),V(0,1,0))
    housing=parts[sw].cut(stem)
    for travel in (-.05,0,.05,.1,.2,.25,.3,.35):
        s=moved(parts[cap],(0,travel,0))
        compression=max(0,travel-.05)
        adjusted_stem=moved(stem,(0,compression,0))
        report['button_sweeps'].append({'cap':cap,'travel_mm':travel,'body_overlap_mm3':s.common(shell).Volume,'retainer_overlap_mm3':s.common(retainer).Volume,'housing_overlap_mm3':s.common(housing).Volume,'compressed_stem_overlap_mm3':s.common(adjusted_stem).Volume,'stem_compression_mm':compression})
    report.setdefault('rest_gaps_mm',{})[cap]=parts[cap].distToShape(parts[sw])[0]
# Boundary-face prisms plus the initial solid cover every point during translation.
# A compound suffices for zero/nonzero collision detection; overlap volume can
# double-count prisms and is used only as an interference witness.
def sweep(s,vector):
    faces=[]; failed=[]
    for i,f in enumerate(s.Faces):
        try:
            pr=f.extrude(V(*vector))
            if abs(pr.Volume)>1e-7:
                if not pr.isValid(): failed.append(i)
                faces.append(pr)
        except Exception as e:
            failed.append({'face':i,'error':str(e)})
    return Part.makeCompound([s,*faces]),failed
lid_set={'BMO_BACK_COVER','ESP32_CAM_AI_Thinker','Battery_LiPo_503048','Battery_Soft_Pad','Battery_Soft_Retaining_Band'}
removed=set()
stages=[('01_lid_battery_esp',lid_set,[(0,50,0)]),
    ('02_power_switch',{'Power_Switch_PLACEHOLDER'},[(-10,0,0),(0,50,0)]),
    ('03_charger',{'Charger_Module_PLACEHOLDER'},[(0,50,0)]),
    ('04_boost',{'Power_Boost_MT3608'},[(0,50,0)]),
    ('05_capacitor',{'Capacitor_2200uF'},[(0,0,4),(0,50,0)]),
    ('06_retainer_and_switches',{'BMO_SWITCH_RETAINER','Tactile_Switch_A_DPad','Tactile_Switch_B_Red'},[(0,0,1.5),(0,50,0)]),
    ('07_caps',{'BMO_DPAD_YELLOW','BMO_BUTTON_RED'},[(0,5,0),(3,0,-2),(0,50,0)])]
# Foam/elastics are released first; they do not follow rigid-solid extraction.
released={'Capacitor_Soft_Retaining_Strap'}
for label,moving,path in stages:
    if prior and label not in service_filter:
        report['service'].append(next(s for s in prior['service'] if s['stage']==label))
        removed |= moving
        continue
    checked=globals().get('SERVICE_MOVING_OVERRIDE',{}).get(label,moving)
    if checked!=moving:
        assert prior and not next(s for s in prior['service'] if s['stage']==label)['conflicts']
    pos={n:parts[n].copy() for n in checked}; conflicts=[]; failures=[]
    for step,vector in enumerate(path):
        for n in checked:
            count=max(1,math.ceil(V(*vector).Length/.25))
            for sample in range(1,count+1):
                s=moved(pos[n],tuple(x*sample/count for x in vector))
                for other,t in parts.items():
                    if other in moving|removed|released or not potential(bb(s),bb(t)): continue
                    intersection=s.common(t)
                    v=0 if intersection.isNull() else intersection.Volume
                    if v>.001:
                        conflicts.append({'moving':n,'obstacle':other,'step':step,'sample':sample,'overlap_mm3':v})
                        break
                if conflicts and conflicts[-1].get('moving')==n and conflicts[-1].get('step')==step: break
            pos[n]=moved(pos[n],vector)
    report['service'].append({'stage':label,'moving':sorted(moving),'rechecked_members':sorted(checked),'path_vectors_mm':path,'conflicts':conflicts,'max_sample_step_mm':.25,'limitation':'Sampled rigid translation, not a continuous motion certificate; wires/adhesives/straps released first.','precondition':'Disconnect wires, release elastics/adhesives, remove screws and all preceding stages.'})
    removed |= moving
    (OUT/'assembly-validation-progress.json').write_text(json.dumps(report,indent=2))
for name,a,b in [('front',(0,-17,35),(0,-8,35)),('side_unengraved',(-26,-5,55),(-19,-5,55)),('bottom',(0,-10,5),(0,-10,12)),('roof',(0,10,70),(0,10,77))]:
    report['walls'][name]=shell.common(Part.makeLine(V(*a),V(*b))).Length
report['walls']['back']=lid.common(Part.makeLine(V(10,rear-4,55),V(10,rear+1,55))).Length
# Side text depth is measured directly at three original-glyph cut samples.
notes=json.loads((OUT/'modification-notes.json').read_text())
for item in notes['text']:
    n=item['name']; side=-1 if n.startswith('BMO') else 1
    s=doc.getObject(n).Shape.copy(); b=s.BoundBox
    cy=(b.YMin+b.YMax)/2; cz=(b.ZMin+b.ZMax)/2
    s.translate(V(0,-cy,-cz)); mat=App.Matrix(); mat.A22=.85; mat.A33=.85
    s=s.transformGeometry(mat); s.translate(V(-side*.6,4,cz+(7 if side==-1 else 0)))
    # Quantify representative stroke sections, not a global stroke minimum.
    widths=[]
    for frac in (.35,.5,.65):
        z=s.BoundBox.ZMin+s.BoundBox.ZLength*frac
        x=side*23.7
        line=Part.makeLine(V(x,-10,z),V(x,18,z)); section=s.common(line)
        widths.extend(e.Length for e in section.Edges if e.Length>.01)
    item['sampled_stroke_widths_mm']=widths
    report.setdefault('lettering',[]).append(item)
for side in (-1,1):
    gauge=Part.makeCylinder(1.5,12,V(side*15+side*.5,-7,79.2),V(0,1,0))
    ligaments=[]
    for f in shell.Faces:
        b=f.BoundBox
        if b.ZMax>80 and b.YLength<1e-6 and len(f.Wires)>1 and f.CenterOfMass.x*side>0:
            ligaments += [f.OuterWire.distToShape(w)[0] for w in f.Wires if not w.isSame(f.OuterWire)]
    report['ears'].append({'side':side,'gauge_3mm_obstruction_mm3':gauge.common(shell).Volume,'minimum_planar_ligament_sample_mm':min(ligaments) if ligaments else None})
for a,b in itertools.combinations(['ESP32_CAM_AI_Thinker','Battery_LiPo_503048','Power_Boost_MT3608','Capacitor_2200uF','Charger_Module_PLACEHOLDER'],2):
    report.setdefault('hardware_distances_mm',[]).append({'a':a,'b':b,'distance':parts[a].distToShape(parts[b])[0]})
for n in ('Battery_LiPo_503048','Capacitor_2200uF'):
    # Distance to the lid plane itself, excluding integrated fixtures.
    plane=Part.makeBox(43,2.75,63,V(-21.5,rear-2.75,9.5))
    report.setdefault('lid_plane_clearance_mm',{})[n]=parts[n].distToShape(plane)[0]
for x,z in [(-20,30),(20,30),(-21.5,69),(21.5,69)]:
    line=Part.makeLine(V(x,4.1,z),V(x,rear+1,z))
    report.setdefault('lid_screw_axes',[]).append({'xz':[x,z],'obstruction_length_mm':shell.common(line).Length+lid.common(line).Length})
# Actual alternative rotations; all populated dimensions retained.
for name,axis,degrees in [('esp_landscape',V(0,1,0),90),('esp_headers_forward',V(0,0,1),180),('cap_upright',V(0,1,0),-90),('boost_flat',V(1,0,0),-90)]:
    key='ESP32_CAM_AI_Thinker' if name.startswith('esp') else ('Capacitor_2200uF' if name.startswith('cap') else 'Power_Boost_MT3608')
    s=parts[key].copy(); b=s.BoundBox; center=V((b.XMin+b.XMax)/2,(b.YMin+b.YMax)/2,(b.ZMin+b.ZMax)/2)
    s.rotate(center,axis,degrees)
    if name=='cap_upright':
        s.translate(V(0,0,10.75-s.BoundBox.ZMin))
    collisions=[]
    for other,t in parts.items():
        if other==key or (key=='Capacitor_2200uF' and other=='Capacitor_Soft_Retaining_Strap') or not potential(bb(s),bb(t)): continue
        v=s.common(t).Volume
        if v>.001: collisions.append({'part':other,'volume_mm3':v})
    report['comparisons'].append({'name':name,'bounds':bb(s),'collisions_at_same_bay':collisions,'scope':'rotation at current populated bay; not a global packing search'})
(OUT/'assembly-validation.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'overlaps':report['overlaps'],'keepouts':report['keepout_conflicts'],'service':report['service'],'ears':report['ears'],'walls':report['walls'],'screw_axes':report['lid_screw_axes']}))
