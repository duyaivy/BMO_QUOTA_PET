"""FreeCAD MCP previews using a fresh, flat document for each view."""
from pathlib import Path
import json
import Part
from FreeCAD import Vector as V
from PySide import QtCore

out = Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET/cad/print_shop/simple_back')
source = App.openDocument(str(out / 'BMO_SIMPLE_BACK.FCStd'))
parts = ['BMO_MAIN_BODY', 'BMO_BACK_COVER', 'BMO_DPAD_YELLOW', 'BMO_BUTTON_RED',
         'BMO_DECOR_TRIANGLE_CYAN', 'BMO_DECOR_UPPER_BLUE', 'BMO_DECOR_SMALL_GREEN']
hardware = ['OLED_096_PCB', 'OLED_096_Glass', 'OLED_096_ActiveArea', 'OLED_096_Header',
            'Tactile_Switch_A_DPad', 'Tactile_Switch_B_Red', 'ESP32_CAM_AI_Thinker',
            'Battery_LiPo_503048', 'Power_Boost_MT3608', 'Capacitor_2200uF',
            'Charger_Module_PLACEHOLDER', 'Power_Switch_PLACEHOLDER',
            'FR4_DPAD_CARRIER_NOT_PRINTED', 'FR4_RED_CARRIER_NOT_PRINTED']
snapshots = {n: (source.getObject(n).Shape.copy(), source.getObject(n).ViewObject.ShapeColor) for n in parts + hardware}

def render(filename, selected, yaw=-35, pitch=78, section=False):
    preview = App.newDocument('BMO_View')
    for key in selected:
        shape, color = snapshots[key]
        obj = preview.addObject('Part::Feature', key)
        obj.Shape = shape.copy()
        if section and key in ('BMO_MAIN_BODY', 'BMO_BACK_COVER'):
            obj.Shape = obj.Shape.cut(Part.makeBox(100, 150, 150, V(-100, -50, -10)))
        obj.ViewObject.ShapeColor = color
        obj.ViewObject.Visibility = True
    preview.recompute()
    App.setActiveDocument(preview.Name)
    view = Gui.getDocument(preview.Name).activeView()
    view.setCameraType('Orthographic')
    view.setCameraOrientation(App.Rotation(V(0, 0, 1), yaw).multiply(App.Rotation(V(1, 0, 0), pitch)).Q)
    Gui.updateGui()
    view.fitAll()
    view.redraw()
    Gui.updateGui()
    def save_frame():
        view.fitAll()
        view.redraw()
        view.saveImage(str(out / filename), 1400, 1400, 'White')
    QtCore.QTimer.singleShot(1500, save_frame)
    # Leave this view alive until FreeCAD has finished rendering the frame.

mode = json.loads((out / 'preview-request.json').read_text())['mode']
if mode == 'assembly':
    render('01-assembly.png', parts + hardware)
elif mode == 'cover':
    render('02-inside-back-cover.png', ['BMO_BACK_COVER'])
else:
    render('03-component-layout.png', parts + hardware, section=True)
print('Saved preview:', mode)
