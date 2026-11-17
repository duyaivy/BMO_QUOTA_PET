"""FreeCAD MCP: shop revision with stronger internal ribs and colored decor."""
import json
import shutil
from pathlib import Path

import MeshPart
import Part
from FreeCAD import Vector as V

ROOT = Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET')
SOURCE = ROOT / 'cad/print_shop/BMO_PRINT_SHOP.FCStd'
OUT = ROOT / 'cad/print_shop/reinforced'
OUT.mkdir(exist_ok=True)
shutil.copy2(SOURCE, OUT / 'BMO_PRINT_SHOP_BEFORE_REINFORCEMENT.FCStd')
doc = App.openDocument(str(SOURCE))
body = doc.getObject('BMO_MAIN_BODY')
cover = doc.getObject('BMO_BACK_COVER')
shell = body.Shape.copy()
lid = cover.Shape.copy()
old_body_volume = shell.Volume
old_lid_volume = lid.Volume

def box(w, d, h, x, y, z):
    return Part.makeBox(w, d, h, V(x, y, z))

# This is the added rear anti-tip foot, beneath the 7 mm bottom of the case.
# The two original seated feet are forward of this cutting region.
shell = shell.cut(box(36.2, 22.2, 7.01, -18.1, 13.9, -0.01)).removeSplitter()

# The seated feet are already 7 mm wide. Increase their fused necks from
# 5.2 mm to 6.2 mm without changing the established seated pose.
for x in (-10, 10):
    shell = shell.fuse(Part.makeCylinder(3.1, 3.5, V(x, -7, 6.7), V(0, 0, 1)))

# Reinforce the exposed arm shafts from 3.6 mm to 4.6 mm diameter. The three
# inherited 1.4 mm fingers are buried in one rounded 6.8 mm-wide palm.
for side in (-1, 1):
    points = [V(side * 24.8, 0, 29), V(side * 28, 1, 22),
              V(side * 31.5, 4, 9), V(side * 32, 7, 2.2)]
    curve = Part.BezierCurve()
    curve.setPoles(points)
    path = Part.Wire(curve.toShape())
    profile = Part.Wire([Part.makeCircle(2.3, points[0], points[1] - points[0])])
    sleeve = path.makePipeShell([profile], True, False)
    sleeve = sleeve.common(box(100, 100, 100, -50, -50, 0))
    palm = box(6.8, 5.1, 3.0, side * 29.8 - 3.4, 7.6, 0)
    palm = palm.makeFillet(0.8, palm.Edges)
    shell = shell.fuse(sleeve).fuse(palm)

# The two tall ESP guides are required to locate the board. Add a broad rear
# web along each guide, keeping the board's inside edge and its clearance.
# Y thickness is 3 mm rather than the inherited 1 mm cross-section.
for x in (-15.0, 14.0):
    lid = lid.fuse(box(1.0, 3.0, 30.6, x, -1.4, 28.9))
for x in (-16.2, 13.8):
    lid = lid.fuse(box(2.4, 3.0, 3.0, x, -1.4, 28.1))

# The rear battery guide's inherited 0.5 mm fin becomes a 2.4 mm wall.
# It grows away from the battery envelope (X -14..16, Y 23.6..28.6).
# A 20 mm stretch of the left inherited fin sits beside the charger and
# cannot be enlarged safely. The right wall and soft retaining band hold the
# battery there, so remove that fragile stretch.
lid = lid.cut(box(0.52, 2.02, 20, -15.51, 28.69, 32.5))
left_battery_rail = box(2.4, 2.4, 45, -17.9, 28.7, 11.0)
# Charger occupies X -21..-15.2, Z 33..52. Do not intrude into it.
left_battery_rail = left_battery_rail.cut(box(3.1, 2.6, 20, -18.0, 28.6, 32.5))
lid = lid.fuse(left_battery_rail)
lid = lid.fuse(box(2.4, 2.4, 45, 17.5, 28.7, 11.0))
# Tie the battery rails into the tray floor at their lower ends.
for x in (-17.9, 17.5):
    lid = lid.fuse(box(2.4, 7.5, 2.4, x, 22.8, 10.5))
lid = lid.removeSplitter()

# Decorative buttons are printed in three colors. Their outline comes from
# the existing FreeCAD features, preserving the user's chosen front layout.
decor = [
    ('BMO_DECOR_TRIANGLE_CYAN', 'Triangle_Cyan', (3, 0, 5), (.0, .82, .84)),
    ('BMO_DECOR_UPPER_BLUE', 'Upper_Button_Blue', (2, 0, -5), (.14, .35, .87)),
    ('BMO_DECOR_SMALL_GREEN', 'Small_Button_Green', (3, 0, 2), (.33, .76, .24)),
]
colored = []
for new_name, source_name, shift, color in decor:
    source_shape = doc.getObject(source_name).Shape.copy()
    source_shape.translate(V(*shift))
    section = source_shape.slice(V(0, 1, 0), -15.5)
    assert len(section) == 1, (source_name, len(section))
    face = Part.Face(section[0])
    face.translate(V(0, -16.0 - face.BoundBox.YMin, 0))
    inlay = face.extrude(V(0, 1.5, 0))
    assert inlay.isValid() and len(inlay.Solids) == 1, source_name
    shell = shell.cut(inlay)
    obj = doc.getObject(new_name) or doc.addObject('Part::Feature', new_name)
    obj.Shape = inlay
    obj.ViewObject.ShapeColor = color
    colored.append(obj)

assert shell.isValid() and len(shell.Solids) == 1, ('body', shell.isValid(), len(shell.Solids), [s.Volume for s in shell.Solids])
assert lid.isValid() and len(lid.Solids) == 1
body.Shape = shell
cover.Shape = lid

part_names = ['BMO_MAIN_BODY', 'BMO_BACK_COVER', 'BMO_DPAD_YELLOW', 'BMO_BUTTON_RED'] + [o.Name for o in colored]
for obj in doc.Objects:
    if hasattr(obj, 'Shape') and hasattr(obj, 'ViewObject'):
        obj.ViewObject.Visibility = obj.Name in part_names
doc.recompute()
doc.Label = 'BMO print shop - reinforced and colored'
doc.saveAs(str(OUT / 'BMO_PRINT_SHOP_REINFORCED.FCStd'))

report = {
    'source': str(SOURCE.relative_to(ROOT)),
    'status': 'DESIGN_REVIEW_REQUIRED',
    'changes': {
        'removed_rear_anti_tip_skid': True,
        'arm_shaft_diameter_mm': 4.6,
        'palm_width_mm': 6.8,
        'leg_neck_diameter_mm': 6.2,
        'esp_guide_rear_web_mm': 3.0,
        'battery_rear_rail_wall_mm': 2.4,
        'removed_thin_left_battery_fin_segment_mm': 20.0,
        'decorative_colors': {name: list(color) for name, _, _, color in decor},
    },
    'volume_before_mm3': {'body': old_body_volume, 'cover': old_lid_volume},
    'volume_after_mm3': {'body': shell.Volume, 'cover': lid.Volume},
    'parts': {},
}
for name in part_names:
    obj = doc.getObject(name)
    shape = obj.Shape
    mesh = MeshPart.meshFromShape(Shape=shape, LinearDeflection=0.08, AngularDeflection=0.18, Relative=False)
    path = OUT / (name + '.stl')
    mesh.write(str(path))
    report['parts'][name] = {
        'valid': shape.isValid(), 'solids': len(shape.Solids),
        'mesh_solid': mesh.isSolid(), 'mesh_components': mesh.countComponents(),
        'mesh_nonmanifold': mesh.hasNonManifolds(),
        'volume_mm3': shape.Volume,
    }

view = Gui.activeDocument().activeView()
view.setCameraType('Orthographic')
view.viewAxonometric()
Gui.updateGui()
view.fitAll()
Gui.updateGui()
view.saveImage(str(OUT / 'assembly-preview.png'), 1400, 1400, 'White')
(OUT / 'revision-report.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report))
