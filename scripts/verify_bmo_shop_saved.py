"""FreeCAD MCP reopen saved CAD, verify mount axes and preview final print meshes."""
import Part
import Mesh
import json
from pathlib import Path
from FreeCAD import Vector as V
ROOT=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET'); OUT=ROOT/'cad/print_shop'
audit=json.loads((OUT/'fit-validation.json').read_text())
model=App.openDocument(str(OUT/'BMO_PRINT_SHOP.FCStd'))
checks=[]
for name,r in audit['parts'].items():
    s=model.getObject(name).Shape
    assert s.isValid() and len(s.Solids)==1,name
    assert abs(s.Volume-r['volume_mm3'])<.001,name+' changed on save/reopen'
    checks.append(name)
expected=['BMO_MAIN_BODY','BMO_BACK_COVER','BMO_DPAD_YELLOW','BMO_BUTTON_RED']
assert sorted(o.Name for o in model.getObject('Final_Print_Parts').Group)==sorted(expected)
mechanism=json.loads((OUT/'four-part-mechanism.json').read_text())
axes=[]
for board in mechanism['nonprinted_carriers']:
    for x,z in board['mounts_xz']:
        # These are blind pilot holes; retain their front floor. Check the
        # 4.5 mm engagement needed behind the PCB, not through the front wall.
        line=Part.makeLine(V(x,-11.75,z),V(x,-5.5,z))
        obstruction=model.getObject('BMO_MAIN_BODY').Shape.common(line).Length+model.getObject(board['name']).Shape.common(line).Length
        axes.append({'board':board['name'],'xz':[x,z],'checked_pilot_engagement_mm':4.5,'obstruction_mm':obstruction})
(OUT/'mount-axis-check.json').write_text(json.dumps(axes,indent=2))
assert all(r['obstruction_mm']<1e-5 for r in axes),'FR4/body screw axes do not align: '+json.dumps(axes)
report={'saved_cad_reopened':True,'verified_objects':checks,'printed_part_count':4,'mount_axes':axes,'status':'DESIGN_REVIEW_REQUIRED'}
(OUT/'saved-file-verification.json').write_text(json.dumps(report,indent=2))
mesh_report=json.loads((OUT/'mesh-validation.json').read_text())
report['freecad_mesh_checks']=[]
preview=App.newDocument('BMO_Four_Print_Parts')
locations={'BMO_MAIN_BODY':(-45,15,0),'BMO_BACK_COVER':(45,15,0),'BMO_DPAD_YELLOW':(-10,-50,0),'BMO_BUTTON_RED':(20,-50,0)}
for i,item in enumerate(mesh_report['parts']):
    o=preview.addObject('Mesh::Feature',item['name']); o.Mesh=Mesh.Mesh(str(ROOT/item['file']))
    mesh=o.Mesh
    report['freecad_mesh_checks'].append({'name':item['name'],'solid':mesh.isSolid(),'nonmanifold':mesh.hasNonManifolds(),'components':mesh.countComponents(),'self_intersections':mesh.hasSelfIntersections()})
    assert mesh.isSolid() and not mesh.hasNonManifolds() and mesh.countComponents()==1
    o.ViewObject.ShapeColor=(.95,.78,.08) if item['color']=='yellow' else ((.85,.12,.1) if item['color']=='red' else (.35,.76,.72))
    pl=o.Placement; pl.Base=V(*locations[item['name']]); o.Placement=pl
preview.recompute()
view=Gui.activeDocument().activeView(); view.setCameraType('Orthographic')
if hasattr(view,'setAnimationEnabled'): view.setAnimationEnabled(False)
view.setCameraOrientation(App.Rotation(V(0,0,1),-15).multiply(App.Rotation(V(1,0,0),60)).Q)
Gui.updateGui(); view.fitAll(); view.redraw(); Gui.updateGui()
view.saveImage(str(OUT/'preview/07-four-print-parts.png'),1800,1600,'White')
preview.saveAs(str(OUT/'BMO_FOUR_PRINT_PARTS_PREVIEW.FCStd'))
(OUT/'saved-file-verification.json').write_text(json.dumps(report,indent=2))
App.setActiveDocument(model.Name); Gui.updateGui()
print(json.dumps(report))
