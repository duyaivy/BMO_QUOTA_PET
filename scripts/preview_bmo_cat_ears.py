from pathlib import Path
from FreeCAD import Vector as V
root=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET/cad')
doc=App.activeDocument()
for o in list(doc.Objects):
    if o.TypeId=='Part::Part2DObjectPython' and o.Name.startswith('ShapeString'):
        doc.removeObject(o.Name)
doc.recompute()
Gui.activateWorkbench('PartWorkbench')
Gui.updateGui()
view=Gui.activeDocument().activeView()
view.setAnimationEnabled(False) if hasattr(view,'setAnimationEnabled') else None
view.setCameraType('Orthographic')
for name,rotation in [('front',App.Rotation(V(1,0,0),90)),('dut',App.Rotation(V(0,0,1),40).multiply(App.Rotation(V(1,0,0),72))),('bmo',App.Rotation(V(0,0,1),-40).multiply(App.Rotation(V(1,0,0),72)))]:
    view.setCameraOrientation(rotation.Q)
    Gui.updateGui(); view.fitAll(); Gui.updateGui()
    view.saveImage(str(root/('cat-ears-'+name+'.png')),1400,1400,'White')
doc.recompute(); doc.save()
print('Cleaned temporary lettering and regenerated previews',view.getCameraOrientation())
