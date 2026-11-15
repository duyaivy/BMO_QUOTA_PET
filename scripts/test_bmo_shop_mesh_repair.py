"""FreeCAD MCP bounded mesh-only repair experiment, retaining the editable BRep."""
import MeshPart
import json
from pathlib import Path
ROOT=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET'); OUT=ROOT/'cad/print_shop'
doc=App.activeDocument(); result=[]
for name in ('BMO_MAIN_BODY','BMO_BACK_COVER'):
    shape=doc.getObject(name).Shape.copy()
    if hasattr(shape,'cleaned'): shape=shape.cleaned()
    mesh=MeshPart.meshFromShape(Shape=shape,LinearDeflection=.025,AngularDeflection=.10,Relative=False)
    def checks(m): return {'solid':m.isSolid(),'nonmanifold':m.hasNonManifolds(),'self_intersections':m.hasSelfIntersections(),'facets':m.CountFacets,'volume':m.Volume}
    before=checks(mesh)
    mesh.fixSelfIntersections()
    after=checks(mesh)
    result.append({'part':name,'before':before,'after':after,'relative_volume_delta':abs(after['volume']-before['volume'])/before['volume']})
    mesh.write(str(OUT/(name+'-mesh-trial.stl')))
(OUT/'mesh-repair-study.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result))
