"""FreeCAD MCP: measured button alternatives and conservative populated-depth search."""
import Part
import json
import itertools
from pathlib import Path
from FreeCAD import Vector as V

ROOT = Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET')
OUT = ROOT/'cad/final_print'
source = ROOT/'cad/hardware_review/BMO_HARDWARE_INTEGRATED.FCStd'
live = next((d for d in App.listDocuments().values() if d.FileName == str(source)), None)
if live and not (OUT/'LIVE_STATE_BEFORE.FCStd').exists():
    live.saveAs(str(OUT/'LIVE_STATE_BEFORE.FCStd'))
doc = App.openDocument(str(source))
doc.Label = 'BMO final optimization — alternatives'
def bb(s):
    b=s.BoundBox
    return [b.XMin,b.YMin,b.ZMin,b.XMax,b.YMax,b.ZMax]
def box(b): return Part.makeBox(b[3]-b[0],b[4]-b[1],b[5]-b[2],V(*b[:3]))
def moved(name, delta):
    s=doc.getObject(name).Shape.copy(); s.translate(V(*delta)); return s
slab=Part.makeBox(100,1.2,100,V(-50,-16.6,0))
layouts=[]
for name,offsets in [
    ('A_left_dpad_raised_triangle', {'BMO_DPad_Yellow':(-2,0,0), 'BMO_Action_Button_Red':(1,0,1), 'Triangle_Cyan':(1,0,5), 'Upper_Button_Blue':(0,0,-5), 'Small_Button_Green':(1,0,2)}),
    ('B_balanced_functional_row', {'BMO_DPad_Yellow':(-2,0,-.5), 'BMO_Action_Button_Red':(2,0,6), 'Triangle_Cyan':(0,0,12), 'Upper_Button_Blue':(3,0,-7), 'Small_Button_Green':(3,0,3)})]:
    shapes={n:moved(n,d) for n,d in offsets.items()}
    distances=[{'a':a,'b':b,'gap_mm':shapes[a].common(slab).distToShape(shapes[b].common(slab))[0]} for a,b in itertools.combinations(shapes,2)]
    layouts.append({'name':name,'offsets':offsets,'bounds':{n:bb(s) for n,s in shapes.items()},'front_gaps':distances})

# The old populated models are rigidly transformed, never scaled.
esp0=doc.getObject('ESP32_CAM_AI_Thinker').Shape
boost0=doc.getObject('Power_Boost_MT3608').Shape
cap0=doc.getObject('Capacitor_2200uF').Shape
bat0=doc.getObject('Battery_LiPo_503048').Shape
ch0=doc.getObject('Charger_Module_PLACEHOLDER').Shape
sw0=doc.getObject('Power_Switch_PLACEHOLDER').Shape
candidates=[]
def overlaps(a,b):
    return all(min(a[i+3],b[i+3])-max(a[i],b[i])>1e-5 for i in range(3))
for family in ('A_flat_boost', 'B_boost_vertical'):
    for depth in range(36,55):
        rear=depth-15
        for eshift in (-5.4,-4,-2,0):
            for by in (3,4,5,6,7,8,9):
                esp=esp0.copy(); esp.translate(V(0,eshift,0))
                boost=boost0.copy()
                if family=='B_boost_vertical':
                    boost.rotate(V(0,10,10.5),V(1,0,0),90)
                b=bb(boost); boost.translate(V(0,by-b[1],10.5-b[2]))
                cap=cap0.copy(); cap.translate(V(0,-5,0))
                bat=bat0.copy(); bat.translate(V(0,rear-10-29.5,0))
                ch=ch0.copy(); ch.translate(V(0,depth-54,0))
                sw=sw0.copy(); sw.translate(V(0,-7,0))
                shapes={'ESP32':esp,'Boost':boost,'Capacitor':cap,'Battery':bat,'Charger':ch,'Switch':sw}
                boxes={n:bb(s) for n,s in shapes.items()}
                # Full original antenna reserve, moved rigidly with the ESP.
                antenna=[-18.5,1+eshift,60,18.5,24+eshift,72.5]
                cavity=[-21.5,-12.25,9.5,21.5,rear-2.75,72.5]
                failures=[]
                for n,b in boxes.items():
                    if n not in ('Charger','Switch') and any(b[i]<cavity[i]+.3 or b[i+3]>cavity[i+3]-.3 for i in range(3)):
                        failures.append(n+': cavity allowance <0.3')
                for a,b in itertools.combinations(boxes,2):
                    # Broad-phase boxes conservative: actual Booleans in validation.
                    if overlaps(boxes[a],boxes[b]): failures.append(a+'/'+b+': populated boxes overlap')
                for n in ('Battery','Charger','Boost','Capacitor','Switch'):
                    if overlaps(antenna,boxes[n]): failures.append(n+': antenna reserve')
                if boxes['ESP32'][1] < -4.4: failures.append('ESP/OLED rear routing gap <0.6')
                # Battery rear padding, removable cover and 1 mm support floor.
                if boxes['Battery'][4] > rear-4.0: failures.append('Battery rear soft clearance <1.25')
                candidates.append({'family':family,'depth':depth,'esp_shift_y':eshift,'boost_min_y':by,
                    'failures':failures,'bounds':boxes,'antenna':antenna})
feasible=[c for c in candidates if not c['failures']]
best={f:min([c for c in feasible if c['family']==f],key=lambda c:(c['depth'],c['esp_shift_y'],c['boost_min_y'])) for f in ('A_flat_boost','B_boost_vertical') if any(c['family']==f for c in feasible)}
report={'button_layouts':layouts,'depth_search':{'count':len(candidates),'feasible':len(feasible),'best_by_family':best,'candidates':candidates},
    'limitations':'1 mm grid depth; populated AABB screen, then exact BRep and mounting/wiring checks required. No claim of global minimum.'}
(OUT/'alternatives.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'buttons':layouts,'best_depths':best,'candidates':len(candidates),'feasible':len(feasible)}))
