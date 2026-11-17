"""FreeCAD MCP renders of the saved reinforcement revision."""
from pathlib import Path
from FreeCAD import Vector as V

root = Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET')
out = root / 'cad/print_shop/reinforced'
doc = App.openDocument(str(out / 'BMO_PRINT_SHOP_REINFORCED.FCStd'))
names = ['BMO_MAIN_BODY', 'BMO_BACK_COVER', 'BMO_DPAD_YELLOW', 'BMO_BUTTON_RED',
         'BMO_DECOR_TRIANGLE_CYAN', 'BMO_DECOR_UPPER_BLUE', 'BMO_DECOR_SMALL_GREEN']
preview = App.newDocument('BMO_Reinforced_Review')
colors = {'BMO_MAIN_BODY': (.35, .76, .72), 'BMO_BACK_COVER': (.35, .76, .72),
          'BMO_DPAD_YELLOW': (.95, .78, .08), 'BMO_BUTTON_RED': (.85, .12, .1),
          'BMO_DECOR_TRIANGLE_CYAN': (0.0, .82, .84),
          'BMO_DECOR_UPPER_BLUE': (.14, .35, .87),
          'BMO_DECOR_SMALL_GREEN': (.33, .76, .24)}
for name in names:
    obj = preview.addObject('Part::Feature', name)
    obj.Shape = doc.getObject(name).Shape.copy()
    obj.ViewObject.ShapeColor = colors[name]
preview.recompute()
view = Gui.activeDocument().activeView()
view.setCameraType('Orthographic')

def shot(name, yaw, pitch):
    rot = App.Rotation(V(0, 0, 1), yaw).multiply(App.Rotation(V(1, 0, 0), pitch))
    view.setCameraOrientation(rot.Q)
    Gui.updateGui()
    view.fitAll()
    view.redraw()
    Gui.updateGui()
    view.saveImage(str(out / name), 1200, 1200, 'White')

shot('01-front-colored.png', -35, 78)
shot('02-front.png', 0, 90)
for name in names:
    preview.getObject(name).ViewObject.Visibility = name == 'BMO_BACK_COVER'
shot('03-reinforced-cover.png', -35, 78)
App.closeDocument(preview.Name)
print('Saved three reinforced CAD previews')
