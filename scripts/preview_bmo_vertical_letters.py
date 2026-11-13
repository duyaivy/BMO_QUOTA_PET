from pathlib import Path
from FreeCAD import Vector as V
root=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET/cad')
doc=App.activeDocument()
assert doc.FileName==str(root/'BMO_VERTICAL_LETTERS_SIMPLE_ARMS.FCStd')
view=Gui.activeDocument().activeView()
view.setAnimationEnabled(False) if hasattr(view,'setAnimationEnabled') else None
view.setCameraType('Orthographic')
views=[('front',0,90),('dut',40,78),('bmo',-45,78),('bmo-side',-90,90),('dut-side',90,90)]
for name,yaw,pitch in views:
    view.setCameraOrientation(App.Rotation(V(0,0,1),yaw).multiply(App.Rotation(V(1,0,0),pitch)).Q)
    Gui.updateGui(); view.fitAll(); Gui.updateGui()
    view.saveImage(str(root/('vertical-'+name+'.png')),1500,1500,'White')
view.setCameraOrientation(App.Rotation(V(0,0,1),-40).multiply(App.Rotation(V(1,0,0),78)).Q)
view.fitAll(); Gui.updateGui(); doc.save()
print('Saved front, BMO, DUT and both side elevations.')
