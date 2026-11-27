"""Build and verify the round-switch retrofit in the local FreeCAD MCP."""

import json
from math import ceil
from pathlib import Path

import Mesh
import MeshPart
import Part
from FreeCAD import Vector as V
from PySide import QtCore

ROOT = Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET')
OUT = ROOT / 'cad/print_shop/round_switch'
SOURCE = ROOT / 'cad/print_shop/simple_back/BMO_SIMPLE_BACK.FCStd'
Y = V(0, 1, 0)
MOUNT_Y = -7.25
SEAT_Y = -6.90
HOLDER_THICKNESS = 1.8
CAP_BACK_Y = -12.0
CAP_REINFORCEMENT = 0.75
SWITCH_DIAMETER = 6.2
SWITCH_HEIGHT = 5.0
SWITCH_BODY_DEPTH = 3.6
PIN_PITCH = 5.0
SWITCH_TRAVEL = 0.25
CAP_TRAVEL = 0.37
STOP_Y = CAP_BACK_Y + CAP_REINFORCEMENT + CAP_TRAVEL
EPS = 0.0001


def box(x, y, z, width, depth, height):
    return Part.makeBox(width, depth, height, V(x, y, z))


def cylinder(x, y, z, radius, depth):
    return Part.makeCylinder(radius, depth, V(x, y, z), Y)


def moved(shape, x=0, y=0, z=0):
    copy = shape.copy()
    copy.translate(V(x, y, z))
    return copy


def overlap(first, second):
    return first.common(second).Volume


def check_removal(shape, path, obstacles):
    current = shape
    for x, y, z in path:
        count = max(1, ceil(V(x, y, z).Length / 0.5))
        for sample in range(1, count + 1):
            ratio = sample / count
            trial = moved(current, x * ratio, y * ratio, z * ratio)
            for name, obstacle in obstacles:
                if trial.BoundBox.intersect(obstacle.BoundBox):
                    assert overlap(trial, obstacle) < EPS, (name, (x, y, z), sample, count)
        current = moved(current, x, y, z)


def add(doc, name, label, shape, color, group=None):
    obj = doc.addObject('Part::Feature', name)
    obj.Label = label
    obj.Shape = shape
    obj.ViewObject.ShapeColor = color
    obj.ViewObject.LineColor = (0.14, 0.16, 0.19)
    obj.ViewObject.DisplayMode = 'Flat Lines'
    if group is not None:
        group.addObject(obj)
    return obj


def carrier(x, z, screw_z):
    back = MOUNT_Y + HOLDER_THICKNESS
    pads = [cylinder(x, MOUNT_Y, hole, 2.75, HOLDER_THICKNESS) for hole in screw_z]
    plate = box(x - 5.4, MOUNT_Y, screw_z[0] + 0.9, 10.8, HOLDER_THICKNESS,
                screw_z[1] - screw_z[0] - 1.8).multiFuse(pads)
    cradle = cylinder(x, STOP_Y, z, 4.85, back - STOP_Y)
    plate = plate.fuse(cradle)
    plate = plate.cut(cylinder(x, STOP_Y - 0.1, z, 3.35, SEAT_Y - STOP_Y + 0.1))
    plate = plate.cut(Part.makeCone(3.65, 3.35, 0.35, V(x, STOP_Y, z), Y))
    for hole in screw_z:
        plate = plate.cut(cylinder(x, MOUNT_Y - 0.1, hole, 1.2, HOLDER_THICKNESS + 0.2))
        plate = plate.cut(Part.makeCone(1.2, 2.05, 0.85, V(x, back - 0.85, hole), Y))
    for offset in (-PIN_PITCH / 2, PIN_PITCH / 2):
        plate = plate.cut(box(x + offset - 0.85, SEAT_Y - 0.02, z - 0.65, 1.70, back - SEAT_Y + 0.04, 1.30))
    seat = plate.removeSplitter()
    ribs = []
    for side in (-1, 1):
        center = V(x, -8.75, z + side * 3.36)
        lead = Part.makeCone(0.12, 0.37, 0.45, center, Y)
        rib = cylinder(center.x, center.y + 0.45, center.z, 0.37, SEAT_Y - center.y - 0.45)
        ribs.extend((lead, rib))
    return seat.multiFuse(ribs).removeSplitter(), seat


def export_stl(name, shape, cap):
    oriented = shape.copy()
    oriented.rotate(V(), V(1, 0, 0), 90 if cap else -90)
    bounds = oriented.BoundBox
    oriented.translate(V(-(bounds.XMin + bounds.XMax) / 2,
                         -(bounds.YMin + bounds.YMax) / 2, -bounds.ZMin))
    mesh = MeshPart.meshFromShape(Shape=oriented, LinearDeflection=0.015, AngularDeflection=0.10,
                                  Relative=False)
    path = OUT / (name + '.stl')
    mesh.write(str(path))
    saved = Mesh.Mesh(str(path))
    assert saved.isSolid() and saved.countComponents() == 1 and not saved.hasNonManifolds(), name
    return {'triangles': saved.CountFacets, 'closed': True, 'components': 1,
            'size_mm': [round(n, 3) for n in (bounds.XLength, bounds.YLength, bounds.ZLength)]}


OUT.mkdir(exist_ok=True)
source = App.openDocument(str(SOURCE))
references = {'BMO_MAIN_BODY', 'BMO_BACK_COVER'}
references.update(n for n in json.loads((SOURCE.parent / 'revision-report.json').read_text())['component_checks']
                  if not n.startswith(('Tactile_', 'FR4_')))
reference_names = sorted(references | {n for n in ('BMO_DECOR_TRIANGLE_CYAN', 'BMO_DECOR_UPPER_BLUE',
                                                   'BMO_DECOR_SMALL_GREEN')})
reference_shapes = {n: (source.getObject(n).Shape.copy(), source.getObject(n).ViewObject.ShapeColor)
                    for n in reference_names}
shell = reference_shapes['BMO_MAIN_BODY'][0]
rear = reference_shapes['BMO_BACK_COVER'][0]

doc = App.newDocument('BMO_Round_Switch_Retrofit')
doc.Label = 'BMO - Round switch retrofit'
ref_group = doc.addObject('App::DocumentObjectGroup', 'Original_Assembly')
ref_group.Label = 'Original printed shell and hardware references'
for name, (shape, color) in reference_shapes.items():
    obj = add(doc, name, source.getObject(name).Label, shape, color, ref_group)
    obj.ViewObject.Visibility = name == 'BMO_MAIN_BODY' or name.startswith('BMO_DECOR')

rest_group = doc.addObject('App::DocumentObjectGroup', 'Rest')
rest_group.Label = 'Rest - both buttons released'
pressed_group = doc.addObject('App::DocumentObjectGroup', 'Pressed')
pressed_group.Label = 'Pressed - both buttons at the mechanical stops'
hardware_group = doc.addObject('App::DocumentObjectGroup', 'Fixed_Button_Hardware')
hardware_group.Label = 'Fixed switch bodies, holders, pins and screws'
cap_and_holder = {}
pushups = {}
fasteners = {}
report = {
    'status': 'CAD_CHECKED_PHYSICAL_FIT_UNVERIFIED',
    'source': str(SOURCE.relative_to(ROOT)),
    'switch_reference': {'body_diameter_mm': SWITCH_DIAMETER, 'height_without_pins_mm': SWITCH_HEIGHT,
                         'body_depth_mm': SWITCH_BODY_DEPTH, 'pin_pitch_mm': PIN_PITCH,
                         'nominal_travel_mm': SWITCH_TRAVEL, 'modeled_pin_length_mm': 2.3},
    'buttons': {},
}

for identifier, old_name, x, z, screw_z in (
    ('DPAD', 'BMO_DPAD_YELLOW', -12.5, 27, (18, 36)),
    ('RED', 'BMO_BUTTON_RED', 12.5, 21.5, (14.5, 29.5)),
):
    cap_name = 'BMO_ROUND_' + identifier + '_CAP'
    carrier_name = 'BMO_ROUND_' + identifier + '_HOLDER'
    old_cap = source.getObject(old_name).Shape
    cap_color = source.getObject(old_name).ViewObject.ShapeColor
    holder_color = (0.20, 0.47, 0.77)
    cap = old_cap.cut(box(x - 20, CAP_BACK_Y, z - 20, 40, 6, 40))
    ring_radius = 5.2 if identifier == 'DPAD' else 4.35
    ring = cylinder(x, CAP_BACK_Y - 0.01, z, ring_radius, CAP_REINFORCEMENT + 0.01).cut(
        cylinder(x, CAP_BACK_Y - 0.02, z, 2.4, CAP_REINFORCEMENT + 0.04)
    )
    cap = cap.fuse(ring).removeSplitter()
    holder, free_seat = carrier(x, z, screw_z)
    switch_base = cylinder(x, SEAT_Y - SWITCH_BODY_DEPTH, z, SWITCH_DIAMETER / 2, SWITCH_BODY_DEPTH)
    plunger_y = SEAT_Y - SWITCH_HEIGHT
    plunger = cylinder(x, plunger_y, z, 1.70, SWITCH_HEIGHT - SWITCH_BODY_DEPTH)
    switch_pins = Part.makeCompound([cylinder(x + dx, SEAT_Y, z, 0.25, 2.3)
                                    for dx in (-PIN_PITCH / 2, PIN_PITCH / 2)])
    fixed_switch = Part.makeCompound([switch_base, switch_pins])
    screw_back = MOUNT_Y + HOLDER_THICKNESS
    screws = Part.makeCompound([
        cylinder(x, screw_back - 5, hole, 1.0, 4.0).fuse(
            Part.makeCone(1.0, 2.0, 1.0, V(x, screw_back - 1.0, hole), Y))
        for hole in screw_z
    ])
    gap = plunger_y - CAP_BACK_Y
    compression = CAP_TRAVEL - gap
    assert gap > 0 and SWITCH_TRAVEL <= compression <= SWITCH_TRAVEL + 0.03
    for name, shape in ((cap_name, cap), (carrier_name, holder)):
        assert shape.isValid() and len(shape.Solids) == 1, name
    assert abs(cap.BoundBox.YMax - (CAP_BACK_Y + CAP_REINFORCEMENT)) < EPS
    assert overlap(free_seat, fixed_switch) < EPS, identifier
    assert overlap(holder, switch_pins) < EPS, identifier
    assert 0 < overlap(holder, switch_base) < 1, identifier
    for approach in (0, 0.25, 0.5, 1, 2, 3):
        assert overlap(free_seat, moved(fixed_switch, y=-approach)) < EPS, (identifier, approach)
    for offset in (0, 0.05, gap, gap + SWITCH_TRAVEL, CAP_TRAVEL):
        shifted_cap = moved(cap, y=offset)
        shifted_plunger = moved(plunger, y=max(0, offset - gap))
        assert max(overlap(shifted_cap, other) for other in (shell, holder, switch_base, shifted_plunger)) < EPS, (
            identifier, offset)
    beyond_stop = moved(cap, y=CAP_TRAVEL + 0.05)
    stop_area = overlap(beyond_stop, holder) / 0.05
    assert stop_area > 15, (identifier, stop_area)
    assert overlap(holder, screws) < EPS and overlap(fixed_switch, screws) < EPS, identifier
    for name, (obstacle, _) in reference_shapes.items():
        results = [overlap(shape, obstacle) for shape in (holder, fixed_switch, plunger)]
        if name != 'BMO_MAIN_BODY':
            results.append(overlap(screws, obstacle))
        assert max(results) < EPS, (identifier, name, results)

    cap_and_holder[identifier] = [(cap_name, cap, cap_color), (carrier_name, holder, holder_color)]
    pushups[identifier] = [(identifier + '_Switch', switch_base, (0.12, 0.14, 0.17)),
                           (identifier + '_Plunger', plunger, (0.91, 0.88, 0.80)),
                           (identifier + '_Pins', switch_pins, (0.67, 0.69, 0.70))]
    fasteners[identifier] = (identifier + '_Screws', screws, (0.55, 0.58, 0.64))
    add(doc, cap_name, cap_name.replace('_', ' '), cap, cap_color, rest_group)
    for name, shape, color in [cap_and_holder[identifier][1], pushups[identifier][0],
                               pushups[identifier][2], fasteners[identifier]]:
        add(doc, name, name.replace('_', ' '), shape, color, hardware_group)
    add(doc, identifier + '_Plunger', identifier + ' plunger released', plunger, pushups[identifier][1][2], rest_group)
    add(doc, identifier + '_Cap_Pressed', identifier + ' cap at stop', moved(cap, y=CAP_TRAVEL), cap_color, pressed_group)
    add(doc, identifier + '_Plunger_Pressed', identifier + ' plunger compressed',
        moved(plunger, y=compression), pushups[identifier][1][2], pressed_group)
    report['buttons'][identifier] = {
        'screw_spacing_mm': screw_z[1] - screw_z[0], 'screw_clearance_diameter_mm': 2.4,
        'plunger_gap_at_rest_mm': round(gap, 3), 'cap_travel_to_stop_mm': CAP_TRAVEL,
        'plunger_compression_at_stop_mm': round(compression, 3),
        'nominal_reach_of_switch_at_click_mm': round(gap + SWITCH_TRAVEL, 3),
        'estimated_mechanical_stop_contact_area_mm2': round(stop_area, 2),
        'cap_reinforcement_depth_mm': CAP_REINFORCEMENT,
        'holder_nominal_wall_mm': 1.5,
        'holder_base_thickness_mm': HOLDER_THICKNESS,
        'fixed_part_and_travel_intersections_mm3': 0,
        'intentional_rib_contact_mm3': round(overlap(holder, switch_base), 4),
        'files': {cap_name + '.stl': export_stl(cap_name, cap, True),
                  carrier_name + '.stl': export_stl(carrier_name, holder, False)},
    }

stationary = [('body', shell)] + [(n, shape) for n, (shape, _) in reference_shapes.items()
                                 if n.startswith('OLED_')]
for key, other in (('DPAD', 'RED'), ('RED', 'DPAD')):
    cap, holder = cap_and_holder[key]
    other_cap, other_holder = cap_and_holder[other]
    cap_path = [(0, 6, 0), (4, 0, -2), (0, 50, 0)] if key == 'DPAD' else [(0, 56, 0)]
    holder_path = ([(0, 2.5, 0), (0, 0, 1.5), (4, 0, 0), (0, 50, 0)] if key == 'DPAD'
                   else [(0, 50, 0)])
    check_removal(cap[1], cap_path, stationary + [(other_cap[0], other_cap[1])])
    check_removal(Part.makeCompound([holder[1], *(item[1] for item in pushups[key])]), holder_path,
                  stationary + [(part[0], part[1]) for part in (cap, other_cap, other_holder)])
    report['buttons'][key]['removal_path_from_installed_xyz_mm'] = {'cap': cap_path, 'holder': holder_path}

pressed_group.ViewObject.Visibility = False
doc.recompute()
App.closeDocument(source.Name)
Gui.getDocument(doc.Name).activeView().viewFront()
Gui.getDocument(doc.Name).activeView().fitAll()
doc.saveAs(str(OUT / 'BMO_ROUND_SWITCH_ASSEMBLY.FCStd'))
(OUT / 'KIEM_TRA_CAD.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))


def render(items, file, yaw, pitch):
    preview = App.newDocument('BMO_Round_Switch_View')
    for name, shape, color in items:
        add(preview, name, name, shape, color)
    preview.recompute()
    view = Gui.getDocument(preview.Name).activeView()
    view.setCameraType('Orthographic')
    view.setCameraOrientation(App.Rotation(V(0, 0, 1), yaw).multiply(App.Rotation(V(1, 0, 0), pitch)).Q)
    view.fitAll()
    view.redraw()

    def save():
        view.fitAll()
        view.redraw()
        view.saveImage(str(OUT / file), 1500, 950, 'White')
        App.closeDocument(preview.Name)

    return save


front = [(name, shape, color) for name, (shape, color) in reference_shapes.items()
         if name == 'BMO_MAIN_BODY' or name.startswith('BMO_DECOR') or name == 'OLED_096_Glass']
inside = front.copy()
exploded = []
motion = []
for key in ('DPAD', 'RED'):
    cap, holder = cap_and_holder[key]
    front.append(cap)
    inside.extend(cap_and_holder[key] + pushups[key] + [fasteners[key]])
    for index, (name, shape, color) in enumerate([cap, *pushups[key], holder, fasteners[key]]):
        offsets = (-11, 0, 0, 0, 11, 18)
        exploded.append((name, moved(shape, y=offsets[index]), color))
    if key != 'RED':
        continue
    cx, cz = 12.5, 21.5
    cut = box(cx - 12, -30, cz - 12, 12, 40, 24)
    for pressed in (False, True):
        shift = 12 if pressed else -12
        cap_shift = CAP_TRAVEL if pressed else 0
        plunger_shift = CAP_TRAVEL - 0.10 if pressed else 0
        pieces = [cap, holder, *pushups[key][:2]]
        for index, (name, shape, color) in enumerate(pieces):
            depth = (cap_shift, 0, 0, plunger_shift)[index]
            sectioned = moved(shape, y=depth).common(cut)
            motion.append((name + ('Pressed' if pressed else 'Rest'),
                           moved(sectioned, y=shift), color))

jobs = [(front, '01_MAT_TRUOC.png', -17, 83),
        (inside, '02_BEN_TRONG.png', 180, 88),
        (exploded, '03_THU_TU_LAP.png', 63, 70),
        (motion, '04_NHA_VA_NHAN.png', 90, 90)]


def render_next(index=0):
    if index == len(jobs):
        return
    save = render(*jobs[index])

    def finish():
        save()
        QtCore.QTimer.singleShot(250, lambda: render_next(index + 1))

    QtCore.QTimer.singleShot(1300, finish)


render_next()
