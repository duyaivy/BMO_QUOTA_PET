"""FreeCAD MCP concept variant: BMO/DUT side labels and hollow cat ears.

Preserves the previous concept. No print mesh is released.
"""
import Part
import Draft
import json
import itertools
from pathlib import Path
from FreeCAD import Vector as V

root=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET/cad')
source=root/'BMO_REVISED_CONCEPT.FCStd'
doc=App.openDocument(str(source))
doc.Label='BMO + DUT — hollow cat ears concept'
shell=doc.getObject('BMO_Front_Shell').Shape.copy()
# Remove only the old embossed lettering outside the nominal 48 mm body.
for x in (-30,24):
    shell=shell.cut(Part.makeBox(6,25,12,V(x,-12,25)))

font='/System/Library/Fonts/Supplemental/Arial Bold.ttf'
labels=[]
for side,text in [(-1,'BMO'),(1,'DUT')]:
    lettering=Draft.make_shapestring(String=text,FontFile=font,Size=6.5,Tracking=0)
    doc.recompute()
    shape=lettering.Shape.copy()
    bounds=shape.BoundBox
    shape.translate(V(-(bounds.XMin+bounds.XMax)/2,-bounds.YMin,0))
    # Local text X follows the side face, local Y points up, normal points out.
    rotation=App.Rotation(V(0,side,0),V(0,0,1),V(side,0,0),'ZXY')
    shape.Placement=App.Placement(V(0,0,0),rotation).multiply(shape.Placement)
    # ShapeString faces preserve enclosed counters in B, D and O.
    raised=shape.extrude(V(side*.9,0,0))
    raised.translate(V(side*23.8,0,29))
    shell=shell.fuse(raised)
    labels.append({'side':'left' if side==-1 else 'right','text':text,'height_mm':6.5,'projection_mm':.7})
    doc.removeObject(lettering.Name)

def triangle(points,depth,y):
    vertices=[V(x,y,z) for x,z in points]
    return Part.Face(Part.makePolygon(vertices+[vertices[0]])).extrude(V(0,depth,0))

ears=[]
for side in (-1,1):
    cx=side*15
    # Base embeds 1.2 mm into the roof. Front-to-back bore leaves the lid accessible.
    outer=triangle([(cx-7,66.8),(cx+7,66.8),(cx+side*3,80)],5,-4)
    along_y=[e for e in outer.Edges if e.BoundBox.YLength>4.99 and e.BoundBox.XLength<1e-5 and e.BoundBox.ZLength<1e-5]
    outer=outer.makeFillet(.9,along_y)
    inner=triangle([(cx-3,70.5),(cx+3,70.5),(cx+side*1.5,76)],7,-5)
    edges=[e for e in inner.Edges if e.BoundBox.YLength>6.99 and e.BoundBox.XLength<1e-5 and e.BoundBox.ZLength<1e-5]
    inner=inner.makeFillet(.5,edges)
    ear=outer.cut(inner).removeSplitter()
    assert ear.isValid() and len(ear.Solids)==1
    assert ear.common(shell).Volume>1, 'Ear must embed in roof'
    # A 3 mm cylindrical gauge demonstrates a useful through opening.
    gauge=Part.makeCylinder(1.5,9,V(cx+side*.5,-6,72.2),V(0,1,0))
    assert gauge.common(ear).Volume<.001, 'Opening obstructs the 3 mm gauge'
    shell=shell.fuse(ear)
    ears.append({'center_x_mm':cx,'width_mm':14,'depth_mm':5,'tip_z_nominal_mm':80,'through_gauge_mm':3})

shell=shell.removeSplitter()
assert shell.isValid() and len(shell.Solids)==1,'Shell, labels and ears must be connected'
doc.getObject('BMO_Front_Shell').Shape=shell
lid=doc.getObject('BMO_Back_Cover').Shape
doc.getObject('BMO_Enclosure_SectionCut').Shape=shell.fuse(lid).cut(Part.makeBox(100,100,150,V(-100,-50,-30)))
doc.recompute()
parts=[o for o in doc.Objects if o.TypeId=='Part::Feature' and 'SectionCut' not in o.Name]
overlaps=[]
for a,b in itertools.combinations(parts,2):
    volume=a.Shape.common(b.Shape).Volume
    if volume>.001:
        overlay={a.Name,b.Name}=={'OLED_096_Glass','OLED_096_ActiveArea'}
        overlaps.append({'a':a.Name,'b':b.Name,'volume_mm3':volume,'display_overlay':overlay})
assert all(o.Shape.isValid() and len(o.Shape.Solids)==1 for o in parts)
assert all(p['display_overlay'] for p in overlaps),'Unexpected collision'
report={'status':'CONCEPT ONLY; keyring fit and strength unverified','labels':labels,'ears':ears,'parts':len(parts),'pairs_checked':len(parts)*(len(parts)-1)//2,'overlaps':overlaps,'shell_single_solid':True}
(root/'cat-ears-audit.json').write_text(json.dumps(report,indent=2))
for o in list(doc.Objects):
    if o.TypeId=='Part::Part2DObjectPython' and o.Name.startswith('ShapeString'):
        doc.removeObject(o.Name)
doc.recompute()
Gui.activateWorkbench('PartWorkbench')
Gui.updateGui()
view=Gui.activeDocument().activeView()
view.setAnimationEnabled(False) if hasattr(view,'setAnimationEnabled') else None
view.setCameraType('Orthographic')
for name,rotation in [
    ('front',App.Rotation(V(1,0,0),90)),
    ('dut',App.Rotation(V(0,0,1),40).multiply(App.Rotation(V(1,0,0),72))),
    ('bmo',App.Rotation(V(0,0,1),-40).multiply(App.Rotation(V(1,0,0),72)))]:
    view.setCameraOrientation(rotation.Q)
    view.fitAll(); Gui.updateGui()
    view.saveImage(str(root/('cat-ears-'+name+'.png')),1400,1400,'White')
view.setCameraOrientation(App.Rotation(V(0,0,1),30).multiply(App.Rotation(V(1,0,0),72)).Q)
view.fitAll(); Gui.updateGui()
doc.recompute()
doc.saveAs(str(root/'BMO_DUT_CAT_EARS_CONCEPT.FCStd'))
print(json.dumps(report,indent=2))
print('Saved cat ears concept and three previews; no STL exported.')
