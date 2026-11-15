"""FreeCAD MCP repair tiny surface intersections and close only local holes."""
import MeshPart
import json
from pathlib import Path
ROOT=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET'); OUT=ROOT/'cad/print_shop'
doc=App.activeDocument(); report=[]
for name in ('BMO_MAIN_BODY','BMO_BACK_COVER'):
    s=doc.getObject(name).Shape.copy()
    if hasattr(s,'cleaned'): s=s.cleaned()
    mesh=MeshPart.meshFromShape(Shape=s,LinearDeflection=.025,AngularDeflection=.10,Relative=False)
    def check(m): return {'solid':m.isSolid(),'nonmanifold':m.hasNonManifolds(),'self_intersections':m.hasSelfIntersections(),'facets':m.CountFacets,'components':m.countComponents(),'volume':m.Volume}
    before=check(mesh); stages=[]
    mesh.removeDuplicatedFacets(); mesh.removeDuplicatedPoints(); mesh.fixDegenerations()
    if mesh.hasPointsOnEdge(): mesh.removePointsOnEdge(True)
    stages.append({'clean':check(mesh)})
    for attempt in range(3):
        if mesh.hasSelfIntersections(): mesh.fixSelfIntersections()
        mesh.fillupHoles(100)
        stages.append({'attempt':attempt,'check':check(mesh)})
        if mesh.isSolid() and not mesh.hasNonManifolds() and not mesh.hasSelfIntersections(): break
    mesh.write(str(OUT/(name+'-filled-trial.stl')))
    report.append({'part':name,'before':before,'stages':stages,'cad_volume':s.Volume,'relative_volume_error':abs(mesh.Volume-s.Volume)/s.Volume})
    (OUT/'mesh-fill-study.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
