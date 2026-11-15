"""FreeCAD MCP: constrained depth comparison after switch/fixture fit failures."""
import Part
import json
from collections import Counter
from pathlib import Path
from FreeCAD import Vector as V
ROOT=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET'); OUT=ROOT/'cad/final_print'
target=App.activeDocument()
src=App.openDocument(str(ROOT/'cad/hardware_review/BMO_HARDWARE_INTEGRATED.FCStd'))
def bb(s):
    b=s.BoundBox; return [b.XMin,b.YMin,b.ZMin,b.XMax,b.YMax,b.ZMax]
def shift(b,v): return [b[i]+v[i%3] for i in range(6)]
templates={n:src.getObject(n).Shape.copy() for n in ('ESP32_CAM_AI_Thinker','Power_Boost_MT3608','Capacitor_2200uF','Battery_LiPo_503048','Charger_Module_PLACEHOLDER')}
App.closeDocument(src.Name); App.setActiveDocument(target.Name); doc=target
controls={n:bb(doc.getObject(n).Shape) for n in ('Tactile_Switch_A_DPad','Tactile_Switch_B_Red','BMO_SWITCH_RETAINER')}
def close(a,b,gap=.0):
    return all(min(a[i+3],b[i+3])-max(a[i],b[i])>-gap+1e-6 for i in range(3))
best={}; reasons=Counter(); counts=Counter(); feasible=Counter()
for family in ('A_flat_boost','B_vertical_boost'):
    boost=templates['Power_Boost_MT3608'].copy()
    if family.startswith('B'): boost.rotate(V(0,10,10.5),V(1,0,0),90)
    b=bb(boost); norm=shift(b,(0,-b[1],0))
    for depth in range(38,55):
        rear=depth-15
        for by in range(3,11):
            for cap_shift in (-5,-2,0,2):
                counts[family]+=1
                e={'ESP':shift(bb(templates['ESP32_CAM_AI_Thinker']),(0,-5.4,0)),
                   'Boost':shift(norm,(0,by,0)),
                   'Capacitor':shift(bb(templates['Capacitor_2200uF']),(0,cap_shift,0)),
                   'Battery':shift(bb(templates['Battery_LiPo_503048']),(0,rear-9.4-29.5,0)),
                   'Charger':shift(bb(templates['Charger_Module_PLACEHOLDER']),(0,depth-54,0))}
                failures=[]
                for a in ('Boost','Capacitor','Battery'):
                    b=e[a]
                    if b[1]<-11.95 or b[4]>rear-3.05: failures.append(a+': cavity clearance')
                for a in e:
                    for n,c in controls.items():
                        if close(e[a],c,.3): failures.append(a+'/'+n+': control clearance')
                for a,b in [('Boost','Capacitor'),('Boost','Battery'),('ESP','Capacitor'),('ESP','Battery')]:
                    if close(e[a],e[b],.3): failures.append(a+'/'+b+': allowance')
                # Whole antenna reserve plus battery/charger bounds.
                antenna=[-18.5,-4.4,60,18.5,18.6,72.5]
                for n in ('Battery','Charger'):
                    if close(antenna,e[n]): failures.append(n+': antenna')
                # Tray side rails extend .8 mm ahead of the cell and overlap boost pins in X/Z.
                if e['Battery'][1]-.8-e['Boost'][4]<.25: failures.append('Boost solder pins / integrated battery tray: <0.25 mm')
                if rear-2.75-e['Battery'][4]<1.25: failures.append('Battery / lid: <1.25 mm')
                if failures: reasons.update(failures)
                else:
                    feasible[family]+=1
                    candidate={'family':family,'depth':depth,'boost_min_y':by,'cap_shift_y':cap_shift,'bounds':e}
                    if family not in best or (depth,by,abs(cap_shift))<(best[family]['depth'],best[family]['boost_min_y'],abs(best[family]['cap_shift_y'])): best[family]=candidate
lower=templates['Battery_LiPo_503048'].copy(); b=lower.BoundBox
lower.rotate(V((b.XMin+b.XMax)/2,(b.YMin+b.YMax)/2,(b.ZMin+b.ZMax)/2),V(1,0,0),90)
report={'method':'Populated rigid BRep bounds plus final control/tray constraints, 1 mm grid for body/boost; final selected model separately checked by exact BRep.',
    'tested_depths':list(range(38,55)),'tested_counts':dict(counts),'feasible_counts':dict(feasible),'best_by_family':best,'rejection_counts':dict(reasons),
    'battery_lower_orientation_bounds':bb(lower),'battery_lower_orientation_depth':lower.BoundBox.YLength,
    'selected':'B_vertical_boost','not_a_global_minimum':True,
    'why_initial_44mm_rejected':'Front-shifted capacitor intersects tactile switches and retainer; initial search omitted controls and fixtures.'}
(OUT/'depth-comparison-final.json').write_text(json.dumps(report,indent=2))
group=doc.addObject('App::DocumentObjectGroup','Final_Button_Alternatives')
alts=json.loads((OUT/'alternatives.json').read_text())['button_layouts']
for layout in alts:
    shapes=[]
    for name,offset in layout['offsets'].items():
        s=doc.getObject(name).Shape.copy()
        if name=='BMO_DPad_Yellow': s.translate(V(2,.2,0))
        if name=='BMO_Action_Button_Red': s.translate(V(-1,.2,-1))
        s.translate(V(*offset)); shapes.append(s)
    o=doc.addObject('Part::Feature','Button_Layout_'+layout['name'][0]); o.Shape=Part.makeCompound(shapes)
    o.addProperty('App::PropertyString','Decision','Comparison'); o.Decision='SELECTED: balanced gaps' if layout['name'].startswith('A') else 'REJECTED: red to small button gap 1.43 mm'
    group.addObject(o); o.ViewObject.Visibility=False
doc.recompute(); doc.save()
print(json.dumps(report))
