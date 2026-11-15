"""FreeCAD MCP sampled removal paths for the four-part user revision."""
import Part
import json
import math
from pathlib import Path
from FreeCAD import Vector as V
ROOT=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET'); OUT=ROOT/'cad/print_shop'
doc=next(d for d in App.listDocuments().values() if d.FileName==str(OUT/'BMO_PRINT_SHOP.FCStd'))
audit=json.loads((OUT/'fit-validation.json').read_text()); parts={n:doc.getObject(n).Shape for n in audit['parts']}
def bb(s):
    b=s.BoundBox; return [b.XMin,b.YMin,b.ZMin,b.XMax,b.YMax,b.ZMax]
def potential(a,b): return all(min(a[i+3],b[i+3])-max(a[i],b[i])>1e-6 for i in range(3))
def moved(s,v):
    s=s.copy(); s.translate(V(*v)); return s
lid={'BMO_BACK_COVER','ESP32_CAM_AI_Thinker','Battery_LiPo_503048','Battery_Soft_Pad','Battery_Soft_Retaining_Band','Power_Switch_PLACEHOLDER'}
stages=[('lid_esp_battery_rear_switch',lid,[(0,50,0)]),
    ('charger',{'Charger_Module_PLACEHOLDER'},[(0,50,0)]),
    ('boost',{'Power_Boost_MT3608'},[(0,50,0)]),
    ('capacitor',{'Capacitor_2200uF'},[(0,0,4),(0,50,0)]),
    ('dpad_FR4_switch',{'FR4_DPAD_CARRIER_NOT_PRINTED','Tactile_Switch_A_DPad'},[(0,4,0),(0,0,3),(4,0,0),(0,50,0)]),
    ('red_FR4_switch',{'FR4_RED_CARRIER_NOT_PRINTED','Tactile_Switch_B_Red'},[(0,.2,0),(0,0,1.5),(0,4.8,0),(-2,0,0),(0,50,0)]),
    ('dpad_cap',{'BMO_DPAD_YELLOW'},[(0,6,0),(4,0,-2),(0,50,0)]),
    ('red_cap',{'BMO_BUTTON_RED'},[(0,56,0)])]
report={'status':'DESIGN_REVIEW_REQUIRED','maximum_sample_step_mm':.5,'method':'Exact BRep interference at sampled rigid translations, not a continuous motion proof. Disconnect wires/release straps/adhesives/remove screws before movement.','stages':[]}
stage_filter=globals().get('SERVICE_STAGE_FILTER')
prior=json.loads((OUT/'service-validation.json').read_text()) if stage_filter else None
if prior:
    assert all(abs(parts[n].Volume-audit['parts'][n]['volume_mm3'])<1e-6 for n in parts), 'Geometry changed; run full service audit'
removed={'Capacitor_Soft_Retaining_Strap'}
for label,moving,path in stages:
    if prior and label not in stage_filter:
        previous=next(s for s in prior['stages'] if s['stage']==label)
        assert not previous['conflicts'], 'Another stage also requires recheck'
        report['stages'].append(previous); removed |= moving
        continue
    current={n:parts[n].copy() for n in moving}; conflicts=[]
    for step,v in enumerate(path):
        count=max(1,math.ceil(V(*v).Length/.5))
        for name in moving:
            for sample in range(1,count+1):
                s=moved(current[name],tuple(x*sample/count for x in v))
                for other,t in parts.items():
                    if other in moving|removed or not potential(bb(s),bb(t)): continue
                    intersection=s.common(t); volume=0 if intersection.isNull() else intersection.Volume
                    if volume>.001:
                        conflicts.append({'moving':name,'obstacle':other,'step':step,'sample':sample,'overlap_mm3':volume}); break
                if conflicts and conflicts[-1]['moving']==name and conflicts[-1]['step']==step: break
            current[name]=moved(current[name],v)
    report['stages'].append({'stage':label,'moving':sorted(moving),'path_vectors_mm':path,'conflicts':conflicts})
    removed |= moving
    (OUT/'service-validation.json').write_text(json.dumps(report,indent=2))
(OUT/'service-validation.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
