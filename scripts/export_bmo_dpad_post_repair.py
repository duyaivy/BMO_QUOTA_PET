"""Export the glue-on upper D-pad screw post and check it in FreeCAD MCP."""

import json
from pathlib import Path

import Mesh
import MeshPart
import Part
from FreeCAD import Vector as V
from PySide import QtCore

ROOT = Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET')
OUT = ROOT / 'cad/print_shop/round_switch/dpad_repair'
SOURCE = OUT.parent / 'BMO_ROUND_SWITCH_ASSEMBLY.FCStd'
X, Z = -12.5, 36.0
GLUE_Y = -12.15
MOUNT_Y = -7.25
Y = V(0, 1, 0)


def cylinder(x, y, z, radius, length):
    return Part.makeCylinder(radius, length, V(x, y, z), Y)


def overlap(first, second):
    return first.common(second).Volume


def add(doc, name, shape, color):
    obj = doc.addObject('Part::Feature', name)
    obj.Shape = shape
    obj.ViewObject.ShapeColor = color
    obj.ViewObject.DisplayMode = 'Flat Lines'
    return obj


OUT.mkdir(exist_ok=True)
source = App.openDocument(str(SOURCE))
body = source.getObject('BMO_MAIN_BODY').Shape.copy()
cap = source.getObject('BMO_ROUND_DPAD_CAP').Shape.copy()
holder = source.getObject('BMO_ROUND_DPAD_HOLDER').Shape.copy()
screws = source.getObject('DPAD_Screws').Shape.copy()

# The 4.6-mm recess goes over a low remnant of the original Ø3.6-mm post.
foot = Part.makeBox(4.8, 1.65, 5.2, V(X - 2.4, GLUE_Y, Z - 1.95))
for offset in (-2.4, 2.4):
    foot = foot.fuse(cylinder(X + offset, GLUE_Y, Z + 0.65, 2.6, 1.65))
stem_y = GLUE_Y + 1.0
stem = Part.makeCone(2.95, 2.35, MOUNT_Y - stem_y, V(X, stem_y, Z), Y)
post = foot.fuse(stem)
post = post.cut(cylinder(X, GLUE_Y - 0.05, Z, 2.3, 0.65))
post = post.cut(Part.makeCone(2.3, 0.85, 1.45, V(X, GLUE_Y + 0.6, Z), Y))
post = post.cut(cylinder(X, GLUE_Y + 2.0, Z, 0.85, MOUNT_Y - GLUE_Y - 1.95)).removeSplitter()
assert post.isValid() and len(post.Solids) == 1

# Keep a modeled 1.0-mm stump above the nominal inside wall.
damaged_body = body.cut(cylinder(X, -11.25, Z, 2.3, 4.2))
assert body.Volume > damaged_body.Volume, (body.Volume, damaged_body.Volume)
assert overlap(post, damaged_body) < 0.001
assert overlap(post, holder) < 0.001
for depth in (0, 0.1, 0.2, 0.3, 0.37):
    moving = cap.copy()
    moving.translate(V(0, depth, 0))
    assert overlap(post, moving) < 0.001
assert all(overlap(post, source.getObject(n).Shape) < 0.001 for n in (
    'OLED_096_PCB', 'OLED_096_Header', 'Capacitor_2200uF', 'Charger_Module_PLACEHOLDER',
))
assert abs(post.BoundBox.YMax - MOUNT_Y) < 0.0001
upper_hole_axis = Part.makeLine(V(X, GLUE_Y + 2.1, Z), V(X, MOUNT_Y + 1.8, Z))
assert not upper_hole_axis.common(post).Edges and not upper_hole_axis.common(holder).Edges
assert screws.common(upper_hole_axis).Edges
approach_stop = holder.copy()
approach_stop.translate(V(0, -0.05, 0))
assert overlap(approach_stop, post) > 0.2

printed = post.copy()
printed.rotate(V(), V(1, 0, 0), 90)
printed.translate(V(-X, Z + 0.65, -GLUE_Y))
file = OUT / 'BMO_DPAD_UPPER_POST_REPAIR.stl'
MeshPart.meshFromShape(Shape=printed, LinearDeflection=0.015, AngularDeflection=0.10, Relative=False).write(str(file))
mesh = Mesh.Mesh(str(file))
assert mesh.isSolid() and mesh.countComponents() == 1 and not mesh.hasNonManifolds()
(OUT / 'KIEM_TRA_TRU.json').write_text(json.dumps({
    'scope': 'Nominal CAD with a simulated 1.0 mm stump; the photographed fracture is not measured.',
    'size_mm': [10.0, 5.2, 4.9],
    'stump_relief_diameter_mm': 4.6,
    'fastener': 'M2 x 5 mm, countersunk',
    'hole_center_spacing_to_existing_lower_post_mm': 18,
    'boss_surface_contact_test_mm3': round(overlap(approach_stop, post), 4),
    'cap_and_hardware_overlap_mm3': 0,
    'mesh_faces': mesh.CountFacets,
}, indent=2) + '\n')

doc = App.newDocument('BMO_DPad_Repair_Preview')
crop = Part.makeBox(36, 32, 36, V(-33, -23, 11))
add(doc, 'Existing_shell', damaged_body.common(crop), (0.34, 0.68, 0.64))
add(doc, 'Replacement_upper_post', post, (0.96, 0.47, 0.15))
add(doc, 'DPad_cap', cap, (0.96, 0.75, 0.19))
view = Gui.getDocument(doc.Name).activeView()
view.setCameraType('Orthographic')
view.setCameraOrientation(App.Rotation(V(0, 0, 1), 187).multiply(App.Rotation(V(1, 0, 0), 88)).Q)
doc.recompute()
view.fitAll()


def render():
    view.fitAll()
    view.redraw()
    view.saveImage(str(OUT / '01_VI_TRI_DAN_TRU.png'), 1100, 900, 'White')


QtCore.QTimer.singleShot(1300, render)
print('Verified repair post and exported', file)
