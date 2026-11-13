from pathlib import Path
from FreeCAD import Vector as V
root=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET/cad')
doc=App.activeDocument()
assert doc.FileName==str(root/'BMO_SOFT_LIMBS_COLOR_CONCEPT.FCStd')
view=Gui.activeDocument().activeView()
view.setAnimationEnabled(False) if hasattr(view,'setAnimationEnabled') else None
view.setCameraType('Orthographic')
views=[('front',App.Rotation(V(1,0,0),90)),('dut',App.Rotation(V(0,0,1),35).multiply(App.Rotation(V(1,0,0),77))),('side',App.Rotation(V(0,0,1),90).multiply(App.Rotation(V(1,0,0),90)))]
for name,rotation in views:
    view.setCameraOrientation(rotation.Q); Gui.updateGui(); view.fitAll(); Gui.updateGui()
    view.saveImage(str(root/('soft-color-'+name+'.png')),1600,1600,'White')
view.setCameraOrientation(views[1][1].Q); view.fitAll(); Gui.updateGui(); doc.save()
print('Saved three previews and smooth shading settings.')
