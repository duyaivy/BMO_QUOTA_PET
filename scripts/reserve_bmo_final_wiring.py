"""FreeCAD MCP verify allocated wire corridors; endpoints/pin maps remain unverified."""
import Part
import json
from pathlib import Path
from FreeCAD import Vector as V
ROOT=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET'); OUT=ROOT/'cad/final_print'
doc=App.activeDocument(); audit=json.loads((OUT/'assembly-validation.json').read_text())
group=doc.getObject('Final_Wire_Corridors') or doc.addObject('App::DocumentObjectGroup','Final_Wire_Corridors')
paths={
    'Right_ESP_Corridor':[(16.5,10,31),(16.5,10,58)],
    'OLED_Front_Side_Corridor':[(19.5,-7.5,45),(19.5,-7.5,70)],
    'Rear_Battery_Corridor':[(16.5,10,45),(19.2,10,45),(19.2,26.1,45),(19.2,26.1,63.5)],
    'Capacitor_Side_Corridor':[(16.2,1,32),(16.2,6,36)]}
report={'diameter_mm':2.2,'corridors':[],'limitations':'Allocated free corridors only, not complete wiring harnesses. No verified endpoints/pin maps, bundle wire counts, bend radius, connector insertion or strain relief. Individual lead terminations require physical measurement.'}
def bb(s):
    b=s.BoundBox; return [b.XMin,b.YMin,b.ZMin,b.XMax,b.YMax,b.ZMax]
def potential(a,b): return all(min(a[i+3],b[i+3])-max(a[i],b[i])>1e-6 for i in range(3))
for name,points in paths.items():
    shapes=[]
    for a,b in zip(points,points[1:]):
        a=V(*a); b=V(*b)
        shapes.append(Part.makeCylinder(1.1,(b-a).Length,a,b-a))
        shapes.append(Part.makeSphere(1.1,a)); shapes.append(Part.makeSphere(1.1,b))
    s=shapes[0].multiFuse(shapes[1:]).removeSplitter(); conflicts=[]
    for n in list(audit['parts'])+['ESP32_Antenna_Keepout']:
        t=doc.getObject(n).Shape
        if not potential(bb(s),bb(t)): continue
        v=s.common(t).Volume
        if v>.001: conflicts.append({'part':n,'volume_mm3':v})
    o=doc.getObject(name) or doc.addObject('Part::Feature',name); o.Shape=s
    o.ViewObject.ShapeColor=(.9,.5,.1); o.ViewObject.Transparency=60; group.addObject(o); o.ViewObject.Visibility=False
    report['corridors'].append({'name':name,'path_xyz_mm':points,'conflicts':conflicts})
(OUT/'wiring-corridors.json').write_text(json.dumps(report,indent=2))
doc.recompute(); doc.save()
print(json.dumps(report))
