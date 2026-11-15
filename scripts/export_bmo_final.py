"""FreeCAD MCP export five print parts, STEP and actual assembly views."""
import Part
import Mesh
import MeshPart
import json
import math
from collections import Counter
from pathlib import Path
from FreeCAD import Vector as V
ROOT=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET'); OUT=ROOT/'cad/final_print'
doc=App.activeDocument(); assert doc.getObject('BMO_DPAD_YELLOW')
audit=json.loads((OUT/'assembly-validation.json').read_text())
assert all(r['valid'] and r['solids']==1 for r in audit['parts'].values())
assert not [r for r in audit['overlaps'] if not r['expected']]
assert not audit['keepout_conflicts']
assert not any(r['conflicts'] for r in audit['service'])
names=['BMO_MAIN_BODY','BMO_BACK_COVER','BMO_DPAD_YELLOW','BMO_BUTTON_RED','BMO_SWITCH_RETAINER']
hardware=[n for n in audit['parts'] if n not in names]
objects=[doc.getObject(n) for n in names+hardware]
for o in objects:
    assert abs(o.Shape.Volume-audit['parts'][o.Name]['volume_mm3'])<1e-6, 'Audit is stale: '+o.Name
wire_audit=json.loads((OUT/'wiring-corridors.json').read_text())
assert not any(r['conflicts'] for r in wire_audit['corridors'])
doc.getObject('Final_Print_Parts').Group=[doc.getObject(n) for n in names]
for o in doc.Objects:
    if hasattr(o,'Shape') and hasattr(o,'ViewObject'): o.ViewObject.Visibility=o.Name in names+hardware
STL=OUT/'stl'; STEP=OUT/'step'; IMAGES=OUT/'renders'
for p in (STL,STEP,IMAGES): p.mkdir(exist_ok=True)
report={'status':'DESIGN_REVIEW_REQUIRED','meshes':[],'renders':[],'parts':names,'stl_units':'mm','stl_coordinates':'Each part centered in XY and placed on Z=0 in suggested trial print orientation; see print_transform.'}
def bb(s):
    b=s.BoundBox; return [b.XMin,b.YMin,b.ZMin,b.XMax,b.YMax,b.ZMax]
oriented={}
for name in names:
    o=doc.getObject(name); s=o.Shape.copy()
    rotation=0 if name=='BMO_MAIN_BODY' else -90
    s.rotate(V(0,0,0),V(1,0,0),rotation)
    b=s.BoundBox; translation=V(-(b.XMin+b.XMax)/2,-(b.YMin+b.YMax)/2,-b.ZMin)
    s.translate(translation); oriented[name]=s
    mesh=MeshPart.meshFromShape(Shape=s,LinearDeflection=.05,AngularDeflection=.12,Relative=False)
    file=STL/(name+'.stl'); mesh.write(str(file))
    imported=Mesh.Mesh(str(file))
    edges=Counter()
    for facet in imported.Facets:
        points=[tuple(round(float(c),5) for c in p) for p in facet.Points]
        for a,b in zip(points,points[1:]+points[:1]): edges[tuple(sorted((a,b)))]+=1
    checks={}
    for method in ('isSolid','hasNonManifolds','hasNonUniformOrientedFacets','hasSelfIntersections','hasDegenerations','countComponents'):
        checks[method]=getattr(imported,method)() if hasattr(imported,method) else None
    record={'part':name,'file':str(file.relative_to(ROOT)),'facets':imported.CountFacets,'volume_mm3':imported.Volume,
        'edge_counts_not_two':sum(v!=2 for v in edges.values()),'checks':checks,
        'assembly_bounds':bb(o.Shape),'print_bounds':bb(s),
        'print_transform':{'rotate_x_degrees':rotation,'translation_xyz_mm':[translation.x,translation.y,translation.z]},
        'material':'yellow' if 'DPAD' in name else ('red' if name=='BMO_BUTTON_RED' else 'mint')}
    # Compare candidate support-facing areas for the main body; this is a geometric proxy.
    if name=='BMO_MAIN_BODY':
        metrics=[]
        for label,k in [('upright',V(0,0,1)),('front_down',V(0,1,0)),('back_down',V(0,-1,0))]:
            low=min(V(*p).dot(k) for f in mesh.Facets for p in f.Points)
            area=0
            for f in mesh.Facets:
                pts=[V(*p) for p in f.Points]
                center=(pts[0]+pts[1]+pts[2])/3
                normal=V(*f.Normal)
                if center.dot(k)>low+.3 and normal.dot(k)<-math.sqrt(.5):
                    area+=(pts[1]-pts[0]).cross(pts[2]-pts[0]).Length/2
            metrics.append({'orientation':label,'downward_surface_area_over_45deg_mm2':area})
        report['body_support_proxy']=metrics
    report['meshes'].append(record)
    Part.export([o],str(STEP/(name+'.step')))
    (OUT/'export-validation.json').write_text(json.dumps(report,indent=2))
Part.export(objects,str(STEP/'BMO_FINAL_ASSEMBLY.step'))
view=Gui.activeDocument().activeView(); view.setCameraType('Orthographic')
view.setAnimationEnabled(False) if hasattr(view,'setAnimationEnabled') else None
def orientation(yaw=0,pitch=90): return App.Rotation(V(0,0,1),yaw).multiply(App.Rotation(V(1,0,0),pitch))
def save(name,rotation):
    view.setCameraOrientation(rotation.Q); Gui.updateGui(); view.fitAll(); Gui.updateGui()
    file=IMAGES/(name+'.png'); view.saveImage(str(file),1800,1600,'White')
    report['renders'].append(str(file.relative_to(ROOT)))
placements={o.Name:o.Placement for o in objects}
temporary=[]
try:
    save('01-assembly',orientation(-35,78))
    save('02-front',orientation())
    save('03-left-side',orientation(-90))
    save('04-right-side',orientation(90))
    save('05-back',orientation(180))
    lid_set={'BMO_BACK_COVER','ESP32_CAM_AI_Thinker','Battery_LiPo_503048','Battery_Soft_Pad','Battery_Soft_Retaining_Band'}
    for o in objects:
        offset=V(0,36,6) if o.Name in lid_set else (V(0,-11,0) if o.Name in ('BMO_DPAD_YELLOW','BMO_BUTTON_RED') else (V(0,8,0) if o.Name in ('BMO_SWITCH_RETAINER','Tactile_Switch_A_DPad','Tactile_Switch_B_Red') else V(0,0,0)))
        placement=o.Placement; placement.Base=placement.Base+offset; o.Placement=placement
    save('06-exploded',orientation(-45,72))
    for o in objects: o.Placement=placements[o.Name]
    # Actual half-section of the enclosure; hardware remains in its assembled positions.
    cut=Part.makeBox(100,150,150,V(-100,-50,-10))
    for name in ('BMO_MAIN_BODY','BMO_BACK_COVER'):
        o=doc.addObject('Part::Feature','Review_Section_'+name)
        o.Shape=doc.getObject(name).Shape.cut(cut); o.ViewObject.ShapeColor=(.35,.76,.72)
        doc.getObject(name).ViewObject.Visibility=False; temporary.append(o)
    save('07-section',orientation(-35,75))
    for o in temporary: o.ViewObject.Visibility=False
    for o in objects: o.ViewObject.Visibility=o.Name in hardware
    save('08-internal-hardware',orientation(145,75))
    for o in objects: o.ViewObject.Visibility=False
    for i,name in enumerate(names):
        o=doc.addObject('Part::Feature','Review_Print_'+name); o.Shape=oriented[name]
        o.ViewObject.ShapeColor=doc.getObject(name).ViewObject.ShapeColor
        pl=o.Placement; pl.Base=pl.Base+V((i%3)*75,(i//3)*100,0); o.Placement=pl
        temporary.append(o)
    save('09-separated-print-parts',orientation(-15,30))
finally:
    for o in objects:
        o.Placement=placements[o.Name]; o.ViewObject.Visibility=True
    for o in temporary: doc.removeObject(o.Name)
    view.setCameraOrientation(orientation(-35,78).Q); view.fitAll(); Gui.updateGui()
doc.recompute(); doc.save()
(OUT/'export-validation.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'meshes':report['meshes'],'renders':report['renders'],'support_proxy':report.get('body_support_proxy')}))
