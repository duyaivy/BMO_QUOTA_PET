"""FreeCAD MCP exact geometry audit; report failures before releasing any mesh."""
import Part
import json
import itertools
from pathlib import Path
from FreeCAD import Vector as V

ROOT=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET'); OUT=ROOT/'cad/final_print'
doc=App.activeDocument()
if not doc.getObject('BMO_MAIN_BODY'):
    doc=App.openDocument(str(OUT/'BMO_FINAL_OPTIMIZED.FCStd'))
P=json.loads((OUT/'parameters.json').read_text())
def bb(s):
    b=s.BoundBox; return [b.XMin,b.YMin,b.ZMin,b.XMax,b.YMax,b.ZMax]
def moved(s,d):
    s=s.copy(); s.translate(V(*d)); return s
print_names=['BMO_MAIN_BODY','BMO_BACK_COVER','BMO_DPad_Yellow','BMO_Action_Button_Red','BMO_SWITCH_RETAINER']
hardware=['OLED_096_PCB','OLED_096_Glass','OLED_096_ActiveArea','OLED_096_Header','Tactile_Switch_A_DPad','Tactile_Switch_B_Red','ESP32_CAM_AI_Thinker','Battery_LiPo_503048','Power_Boost_MT3608','Capacitor_2200uF','Charger_Module_PLACEHOLDER','Power_Switch_PLACEHOLDER','Battery_Soft_Pad','Battery_Soft_Retaining_Band','Capacitor_Soft_Retaining_Strap']
names=print_names+hardware
parts={n:doc.getObject(n).Shape for n in names}
report={'status':'DESIGN_REVIEW_REQUIRED','parts':{},'overlaps':[],'button_sweeps':[], 'keepouts':[], 'service':[]}
def potential(a,b):
    return all(min(a[i+3],b[i+3])-max(a[i],b[i])>1e-6 for i in range(3))
for n,s in parts.items():
    report['parts'][n]={'valid':s.isValid(),'bounds':bb(s),'solids':len(s.Solids),'volume':s.Volume}
    if len(s.Solids)>1: report['parts'][n]['solid_details']=[{'volume':t.Volume,'bounds':bb(t)} for t in s.Solids]
for a,b in itertools.combinations(parts,2):
    if not potential(bb(parts[a]),bb(parts[b])): continue
    v=parts[a].common(parts[b]).Volume
    if v>.001: report['overlaps'].append({'a':a,'b':b,'volume':v,'expected':{a,b}=={'OLED_096_Glass','OLED_096_ActiveArea'}})
shell=parts['BMO_MAIN_BODY']; lid=parts['BMO_BACK_COVER']; retainer=parts['BMO_SWITCH_RETAINER']
for cap in ('BMO_DPad_Yellow','BMO_Action_Button_Red'):
    for travel in (-.05,0,.05,.1,.2,.25,.3,.35):
        s=moved(parts[cap],(0,travel,0))
        report['button_sweeps'].append({'cap':cap,'travel':travel,'body_overlap':s.common(shell).Volume,'retainer_overlap':s.common(retainer).Volume})
for ko,exempt in [('ESP32_Antenna_Keepout',{'ESP32_CAM_AI_Thinker'}),('USB_Cable_Insert_Keepout',{'Charger_Module_PLACEHOLDER'}),('Power_Switch_Finger_Access',{'Power_Switch_PLACEHOLDER'})]:
    s=doc.getObject(ko).Shape
    for n,t in parts.items():
        if n in exempt or not potential(bb(s),bb(t)): continue
        v=s.common(t).Volume
        if v>.001: report['keepouts'].append({'reserve':ko,'part':n,'volume':v})
for a,b in [('Battery_LiPo_503048','BMO_BACK_COVER'),('Capacitor_2200uF','BMO_BACK_COVER'),('Power_Boost_MT3608','Battery_LiPo_503048'),('ESP32_CAM_AI_Thinker','OLED_096_PCB')]:
    report.setdefault('clearances',[]).append({'a':a,'b':b,'mm':parts[a].distToShape(parts[b])[0]})
# Continuous prismatic swept volumes, source hardware geometry retained.
def sweep(shape,distance):
    # Solid sweep as union of every boundary-face prism and the starting solid.
    out=shape.copy()
    for f in shape.Faces:
        try:
            pr=f.extrude(V(0,distance,0))
            if pr.Volume>1e-5: out=out.fuse(pr)
        except Part.OCCError: pass
    return out.removeSplitter()
# Coarse translation samples first; full continuous sweeps are added after fit converges.
lid_set={'BMO_BACK_COVER','Battery_LiPo_503048','Battery_Soft_Pad','Battery_Soft_Retaining_Band','ESP32_CAM_AI_Thinker'}
stages=[('lid_with_battery_and_esp',sorted(lid_set),set()),
    ('charger',['Charger_Module_PLACEHOLDER'],lid_set),
    ('boost',['Power_Boost_MT3608'],lid_set|{'Charger_Module_PLACEHOLDER'}),
    ('capacitor',['Capacitor_2200uF','Capacitor_Soft_Retaining_Strap'],lid_set|{'Charger_Module_PLACEHOLDER','Power_Boost_MT3608'}),
    ('retainer_with_switches',['BMO_SWITCH_RETAINER','Tactile_Switch_A_DPad','Tactile_Switch_B_Red'],lid_set|{'Charger_Module_PLACEHOLDER','Power_Boost_MT3608','Capacitor_2200uF','Capacitor_Soft_Retaining_Strap','Power_Switch_PLACEHOLDER'}),
    ('caps',['BMO_DPad_Yellow','BMO_Action_Button_Red'],lid_set|{'Charger_Module_PLACEHOLDER','Power_Boost_MT3608','Capacitor_2200uF','Capacitor_Soft_Retaining_Strap','Power_Switch_PLACEHOLDER','BMO_SWITCH_RETAINER','Tactile_Switch_A_DPad','Tactile_Switch_B_Red'})]
for label,moving,removed in stages:
    conflicts=[]
    for travel in (.25,1,3,6,12,24,40):
        for a in moving:
            s=moved(parts[a],(0,travel,0))
            for b,t in parts.items():
                if b in removed or b in moving or not potential(bb(s),bb(t)): continue
                v=s.common(t).Volume
                if v>.001: conflicts.append({'moving':a,'obstacle':b,'travel':travel,'volume':v})
    report['service'].append({'stage':label,'sampled_translation_conflicts':conflicts})
(OUT/'geometry-validation.json').write_text(json.dumps(report,indent=2))
view=Gui.activeDocument().activeView(); view.setCameraType('Orthographic')
for o in doc.Objects:
    if hasattr(o,'Shape') and hasattr(o,'ViewObject'): o.ViewObject.Visibility=o.Name in names
view.setCameraOrientation(App.Rotation(V(0,0,1),-35).multiply(App.Rotation(V(1,0,0),78)).Q)
Gui.updateGui(); view.fitAll(); Gui.updateGui()
view.saveImage(str(OUT/'working-preview.png'),1400,1400,'White')
print(json.dumps({'multi_solids':{n:r for n,r in report['parts'].items() if r['solids']!=1},'overlaps':report['overlaps'],'keepouts':report['keepouts'],'service':report['service'],'buttons':report['button_sweeps']}))
