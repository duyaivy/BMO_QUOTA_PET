"""FreeCAD MCP comparison of new and old cover contact with component envelopes."""
import json
from pathlib import Path

root = Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET/cad/print_shop')
old = App.openDocument(str(root / 'BMO_PRINT_SHOP.FCStd'))
new = App.openDocument(str(root / 'reinforced/BMO_PRINT_SHOP_REINFORCED.FCStd'))
names = ['Battery_LiPo_503048', 'ESP32_CAM_AI_Thinker', 'Charger_Module_PLACEHOLDER',
         'Power_Boost_MT3608', 'Capacitor_2200uF', 'OLED_096_PCB', 'Power_Switch_PLACEHOLDER']
rows = {}
for name in names:
    component = old.getObject(name).Shape
    a = old.getObject('BMO_BACK_COVER').Shape.common(component).Volume
    b = new.getObject('BMO_BACK_COVER').Shape.common(component).Volume
    rows[name] = {'old_overlap_mm3': round(a, 3), 'new_overlap_mm3': round(b, 3),
                  'added_overlap_mm3': round(b - a, 3)}
(root / 'reinforced/fit-check.json').write_text(json.dumps(rows, indent=2))
assert all(row['added_overlap_mm3'] <= 0 for row in rows.values())
print(json.dumps(rows))
