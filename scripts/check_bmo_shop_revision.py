"""FreeCAD MCP fit check for user changes, independent of the carrier choice."""
import Part
import json
import itertools
from pathlib import Path
from FreeCAD import Vector as V
ROOT=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET'); OUT=ROOT/'cad/print_shop'
doc=App.activeDocument()
# Replace only the just-added switch ledges to clear the original PCM/JST model.
cover=doc.getObject('BMO_BACK_COVER'); s=cover.Shape.copy()
s=s.cut(Part.makeBox(1.3,3.1,7.6,V(6.5,27.4,62.2)))
s=s.cut(Part.makeBox(12,3.1,.1,V(6.1,27.4,62.0)))
s=s.fuse(Part.makeBox(1.2,2.1,7.4,V(6.5,28.4,62.3)))
s=s.fuse(Part.makeBox(1.2,3,7.4,V(16.3,27.5,62.3)))
s=s.fuse(Part.makeBox(11.8,3,.8,V(6.2,27.5,62.1)))
cover.Shape=s.removeSplitter()
names=['BMO_MAIN_BODY','BMO_BACK_COVER','BMO_DPAD_YELLOW','BMO_BUTTON_RED','OLED_096_PCB','OLED_096_Glass','OLED_096_ActiveArea','OLED_096_Header','Tactile_Switch_A_DPad','Tactile_Switch_B_Red','ESP32_CAM_AI_Thinker','Battery_LiPo_503048','Power_Boost_MT3608','Capacitor_2200uF','Charger_Module_PLACEHOLDER','Power_Switch_PLACEHOLDER','Battery_Soft_Pad','Battery_Soft_Retaining_Band','Capacitor_Soft_Retaining_Strap']
parts={n:doc.getObject(n).Shape for n in names}
def bb(s):
    b=s.BoundBox; return [b.XMin,b.YMin,b.ZMin,b.XMax,b.YMax,b.ZMax]
def potential(a,b): return all(min(a[i+3],b[i+3])-max(a[i],b[i])>1e-6 for i in range(3))
report={'parts':{n:{'valid':s.isValid(),'solids':len(s.Solids),'bounds':bb(s),'volume':s.Volume} for n,s in parts.items()},'overlaps':[],'keepouts':[]}
for a,b in itertools.combinations(parts,2):
    if not potential(bb(parts[a]),bb(parts[b])): continue
    v=parts[a].common(parts[b]).Volume
    if v>.001: report['overlaps'].append({'a':a,'b':b,'volume':v,'expected':{a,b}=={'OLED_096_Glass','OLED_096_ActiveArea'}})
for ko,exempt in [('ESP32_Antenna_Keepout',{'ESP32_CAM_AI_Thinker'}),('USB_Cable_Insert_Keepout',{'Charger_Module_PLACEHOLDER'}),('Power_Switch_Finger_Access',{'Power_Switch_PLACEHOLDER'})]:
    s=doc.getObject(ko).Shape
    for n,t in parts.items():
        if n in exempt or not potential(bb(s),bb(t)): continue
        v=s.common(t).Volume
        if v>.001: report['keepouts'].append({'reserve':ko,'part':n,'volume':v})
(OUT/'revision-fit.json').write_text(json.dumps(report,indent=2))
doc.recompute(); doc.save()
print(json.dumps({'invalid':{n:r for n,r in report['parts'].items() if not r['valid'] or r['solids']!=1},'overlaps':report['overlaps'],'keepouts':report['keepouts']}))
