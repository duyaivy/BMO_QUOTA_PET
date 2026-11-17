"""FreeCAD MCP nominal replacement battery envelope checks; no design edits."""
import json
from pathlib import Path
import Part
from FreeCAD import Vector as V
out=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET/cad/print_shop/simple_back')
doc=App.openDocument(str(out/'BMO_SIMPLE_BACK.FCStd'))
names=['BMO_MAIN_BODY','BMO_BACK_COVER','ESP32_CAM_AI_Thinker','Power_Boost_MT3608','Capacitor_2200uF','Charger_Module_PLACEHOLDER','Power_Switch_PLACEHOLDER']
rows=[]
for model,t,w,h in [('603040',6,30,40),('303450',3,34,50),('403450',4,34,50),('503450',5,34,50),('603040_pack_example',6.2,30.5,42.5)]:
    # Keep original battery centre X=1, front Y=23.6 and bottom Z=12.
    # Nominal sizes include a separate conservative 10 mm top PCM/wire reserve.
    height=h if model.endswith('example') else h+10
    shape=Part.makeBox(w,t,height,V(1-w/2,23.6,12))
    checks={}
    for n in names:
        s=doc.getObject(n).Shape
        checks[n]={'overlap_mm3':round(shape.common(s).Volume,4),'clearance_mm':round(shape.distToShape(s)[0],3)}
    rows.append({'model':model,'envelope_mm':[w,t,height],'checks':checks})
(out/'battery-options-check.json').write_text(json.dumps(rows,indent=2))
print(json.dumps(rows))
