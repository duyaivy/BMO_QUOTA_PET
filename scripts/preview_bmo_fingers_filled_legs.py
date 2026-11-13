from pathlib import Path
from FreeCAD import Vector as V
root=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET/cad')
doc=App.activeDocument()
assert doc.FileName==str(root/'BMO_FINGERS_FILLED_LEGS_CONCEPT.FCStd')
view=Gui.activeDocument().activeView()
view.setAnimationEnabled(False) if hasattr(view,'setAnimationEnabled') else None
view.setCameraType('Orthographic')
for name,yaw,pitch in [('bmo',-45,78),('dut',40,78),('side',-90,90),('front',0,90)]:
    view.setCameraOrientation(App.Rotation(V(0,0,1),yaw).multiply(App.Rotation(V(1,0,0),pitch)).Q)
    Gui.updateGui(); view.fitAll(); Gui.updateGui()
    view.saveImage(str(root/('fingers-filled-'+name+'.png')),1500,1500,'White')
# Close-up of the right hand, using the same actual CAD scene.
view.setCameraOrientation(App.Rotation(V(0,0,1),35).multiply(App.Rotation(V(1,0,0),30)).Q)
camera=view.getCameraOrientation()
position=V(29.8,9,1)+camera.multVec(V(0,0,35))
node=view.getCameraNode()
node.position.setValue(position.x,position.y,position.z)
node.focalDistance.setValue(35)
node.height.setValue(13)
Gui.updateGui()
view.saveImage(str(root/'fingers-filled-hand-detail.png'),1200,1200,'White')
view.setCameraOrientation(App.Rotation(V(0,0,1),-40).multiply(App.Rotation(V(1,0,0),78)).Q)
view.fitAll(); Gui.updateGui(); doc.save()
print('Saved overall, side comparison and hand detail previews.')
