"""FreeCAD MCP compare fresh, finer tessellations before replacing delivered STL."""
import MeshPart
import json
from pathlib import Path
ROOT=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET'); OUT=ROOT/'cad/final_print'
doc=App.activeDocument(); results=[]
for name in ('BMO_MAIN_BODY','BMO_BACK_COVER'):
    for accuracy in (.025,.01):
        s=doc.getObject(name).Shape.copy()
        if hasattr(s,'cleaned'): s=s.cleaned()
        mesh=MeshPart.meshFromShape(Shape=s,LinearDeflection=accuracy,AngularDeflection=.08,Relative=False)
        before={'solid':mesh.isSolid(),'nonmanifold':mesh.hasNonManifolds(),'self_intersections':mesh.hasSelfIntersections(),'facets':mesh.CountFacets}
        results.append({'part':name,'accuracy':accuracy,'before':before,'fix_doc':mesh.fixSelfIntersections.__doc__})
        if before['solid'] and not before['nonmanifold'] and not before['self_intersections']: break
(OUT/'tessellation-study.json').write_text(json.dumps(results,indent=2))
print(json.dumps(results))
