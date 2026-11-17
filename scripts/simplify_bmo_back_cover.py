"""FreeCAD MCP: remove rear electronics trays; preserve component placements."""
import json
from pathlib import Path
import Part
import MeshPart
from FreeCAD import Vector as V

root = Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET')
out = root / 'cad/print_shop/simple_back'
out.mkdir(exist_ok=True)
source = App.openDocument(str(root / 'cad/print_shop/reinforced/BMO_PRINT_SHOP_REINFORCED.FCStd'))
parts = ['BMO_MAIN_BODY', 'BMO_BACK_COVER', 'BMO_DPAD_YELLOW', 'BMO_BUTTON_RED',
         'BMO_DECOR_TRIANGLE_CYAN', 'BMO_DECOR_UPPER_BLUE', 'BMO_DECOR_SMALL_GREEN']
hardware = ['OLED_096_PCB', 'OLED_096_Glass', 'OLED_096_ActiveArea', 'OLED_096_Header',
            'Tactile_Switch_A_DPad', 'Tactile_Switch_B_Red', 'ESP32_CAM_AI_Thinker',
            'Battery_LiPo_503048', 'Power_Boost_MT3608', 'Capacitor_2200uF',
            'Charger_Module_PLACEHOLDER', 'Power_Switch_PLACEHOLDER',
            'FR4_DPAD_CARRIER_NOT_PRINTED', 'FR4_RED_CARRIER_NOT_PRINTED']
doc = App.newDocument('BMO_SIMPLE_BACK')
report = {'status': 'PROTOTYPE_FIT_NOT_PHYSICALLY_VERIFIED', 'parts': {}, 'component_checks': {}}
for name in parts + hardware:
    original = source.getObject(name)
    obj = doc.addObject('Part::Feature', name)
    obj.Shape = original.Shape.copy()
    obj.ViewObject.ShapeColor = original.ViewObject.ShapeColor
    obj.ViewObject.Visibility = True
    if name in hardware:
        a, b = original.Shape, obj.Shape
        assert a.distToShape(b)[0] < 1e-8
        assert a.cut(b).Volume < 1e-6 and b.cut(a).Volume < 1e-6
        report['component_checks'][name] = {'shape_and_position_unchanged': True}

cover = doc.getObject('BMO_BACK_COVER')
old = cover.Shape.copy()
# All ESP32 and battery tray members are inside this central envelope.
# Stop at the cover's inner plane; preserve its skin, perimeter, screw holes,
# upper power switch seat and side charging opening.
cut = Part.makeBox(100.0, 50.25, 71.0, V(-50.0, -20.0, -10.0))
cover.Shape = old.cut(cut).removeSplitter()
assert cover.Shape.isValid() and len(cover.Shape.Solids) == 1
assert cover.Shape.common(cut).Volume < 1e-6
report['rear_trays_removed_mm3'] = old.Volume - cover.Shape.Volume
report['remaining_internal_tray_volume_mm3'] = cover.Shape.common(cut).Volume
doc.recompute()
doc.saveAs(str(out / 'BMO_SIMPLE_BACK.FCStd'))
for name in parts:
    obj = doc.getObject(name)
    s = obj.Shape
    assert s.isValid() and len(s.Solids) == 1, name
    mesh = MeshPart.meshFromShape(Shape=s, LinearDeflection=.08, AngularDeflection=.18, Relative=False)
    mesh.write(str(out / (name + '.stl')))
    Part.export([obj], str(out / (name + '.step')))
    report['parts'][name] = {'valid': True, 'solids': 1, 'volume_mm3': s.Volume}
Part.export([doc.getObject(n) for n in parts], str(out / 'BMO_PRINT_ASSEMBLY.step'))
(out / 'revision-report.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report))
