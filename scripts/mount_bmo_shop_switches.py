"""FreeCAD MCP four printed parts: replace the fifth print with FR4 carriers.

FR4 pieces are passive mounting hardware, not additional functional buttons.
Their mounting/lead details remain provisional pending actual tactile dimensions.
"""
import Part
import json
from pathlib import Path
from FreeCAD import Vector as V
ROOT=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET'); OUT=ROOT/'cad/print_shop'
doc=App.activeDocument(); body=doc.getObject('BMO_MAIN_BODY')
def box(w,d,h,x,y,z): return Part.makeBox(w,d,h,V(x,y,z))
def cyl(r,h,p): return Part.makeCylinder(r,h,V(*p),V(0,1,0))
shell=body.Shape.copy(); boards=[]; stops=[]
parts=['BMO_MAIN_BODY','BMO_BACK_COVER','BMO_DPAD_YELLOW','BMO_BUTTON_RED']
# Delete only obsolete front carrier bosses. The source/history stay in the CAD.
for x in (-17,16):
    shell=shell.cut(cyl(2.25,5.1,(x,-12.25,38)))
    shell=shell.fuse(cyl(2.2,.4,(x,-12.6,38)))
shell=shell.cut(cyl(1.85,5.1,(12.5,-12.25,13.5)))
shell=shell.fuse(cyl(1.8,.4,(12.5,-12.6,13.5)))
for cap_name,sw_name,cx,cz,width,half,spacing in [
    ('BMO_DPAD_YELLOW','Tactile_Switch_A_DPad',-12.5,27,13.5,7,9),
    ('BMO_BUTTON_RED','Tactile_Switch_B_Red',12.5,21.5,11.5,6,8)]:
    board=box(width,1.6,2*half,cx-width/2,-7.25,cz-half)
    mounts=[]
    for z in (cz-spacing+(1 if cap_name=='BMO_BUTTON_RED' else 0),cz+spacing):
        board=board.fuse(cyl(2.5,1.6,(cx,-7.25,z)))
        board=board.cut(cyl(1.15,2,(cx,-7.4,z)))
        boss=cyl(1.8,5.25,(cx,-12.5,z)).cut(cyl(.85,5.5,(cx,-12.6,z)))
        shell=shell.fuse(boss); mounts.append([cx,z])
    cap=doc.getObject(cap_name); s=cap.Shape.copy()
    if cap_name=='BMO_DPAD_YELLOW':
        for sign in (-1,1):
            x=cx+sign*5-.6
            s=s.fuse(box(1.2,4.45,1.2,x,-12,cz-.6))
    else:
        for sign in (-1,1):
            x=cx+(3.3 if sign>0 else -4.1)
            s=s.fuse(box(.8,4.45,1.2,x,-12,cz-.6))
    cap.Shape=s.removeSplitter()
    name='FR4_DPAD_CARRIER_NOT_PRINTED' if cap_name=='BMO_DPAD_YELLOW' else 'FR4_RED_CARRIER_NOT_PRINTED'
    o=doc.getObject(name) or doc.addObject('Part::Feature',name); o.Shape=board.removeSplitter()
    o.ViewObject.ShapeColor=(.2,.45,.2)
    if 'AssemblyNote' not in o.PropertiesList: o.addProperty('App::PropertyString','AssemblyNote','Review')
    o.AssemblyNote='1.6 mm FR4/perfboard mechanical carrier, cut and drilled; actual tactile footprint/attachment must be measured. NOT a 3D printed part.'
    boards.append({'name':name,'thickness':1.6,'mounts_xz':mounts,'outline_width':width,'center_xz':[cx,cz],'switch':sw_name,'attachment':'Solder/retention method and lead form require actual-switch coupon; no PCB routing claimed.'})
    stops.append({'cap':cap_name,'integrated_posts':2,'post_end_rest_y':-7.55,'carrier_front_y':-7.25,'hard_stop_travel_mm':.3,'stem_gap_mm':.05})
body.Shape=shell.removeSplitter()
assert body.Shape.isValid() and len(body.Shape.Solids)==1
doc.getObject('BMO_SWITCH_RETAINER').ViewObject.Visibility=False
doc.getObject('Final_Print_Parts').Group=[doc.getObject(n) for n in parts]
hardware=['OLED_096_PCB','OLED_096_Glass','OLED_096_ActiveArea','OLED_096_Header','Tactile_Switch_A_DPad','Tactile_Switch_B_Red','ESP32_CAM_AI_Thinker','Battery_LiPo_503048','Power_Boost_MT3608','Capacitor_2200uF','Charger_Module_PLACEHOLDER','Power_Switch_PLACEHOLDER','Battery_Soft_Pad','Battery_Soft_Retaining_Band','Capacitor_Soft_Retaining_Strap',*[b['name'] for b in boards]]
for o in doc.Objects:
    if hasattr(o,'Shape') and hasattr(o,'ViewObject'): o.ViewObject.Visibility=o.Name in parts+hardware
doc.recompute(); doc.save()
report={'printed_parts':parts,'nonprinted_carriers':boards,'cap_stops':stops,'additional_hardware':'Two FR4/perfboard pieces cut from stock, four M2 fasteners; switch attachment/lead form to be measured.','status':'DESIGN_REVIEW_REQUIRED','decision':'Default mechanical proposal for four printed parts; no extra electronic functions.'}
(OUT/'four-part-mechanism.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
