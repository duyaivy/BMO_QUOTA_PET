"""FreeCAD MCP locate tessellation defects without altering CAD."""
import Mesh
import json
from pathlib import Path
from collections import Counter
ROOT=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET'); OUT=ROOT/'cad/final_print'
result={}
for name in ('BMO_MAIN_BODY','BMO_BACK_COVER'):
    mesh=Mesh.Mesh(str(OUT/'stl'/(name+'.stl')))
    methods=[x for x in dir(mesh) if any(k in x.lower() for k in ('intersect','manifold','degenera','repair','duplic','remove','bound','solid','fix'))]
    edges=Counter()
    for f in mesh.Facets:
        p=[tuple(round(float(v),5) for v in p) for p in f.Points]
        for a,b in zip(p,p[1:]+p[:1]): edges[tuple(sorted((a,b)))]+=1
    item={'methods':methods,'bad_edges':[{'edge':e,'count':c} for e,c in edges.items() if c!=2]}
    if hasattr(mesh,'getSelfIntersections'): item['self_intersections']=mesh.getSelfIntersections()
    if hasattr(mesh,'getNonManifolds'): item['nonmanifolds']=mesh.getNonManifolds()
    if hasattr(mesh,'getSeparateComponents'): item['component_count']=len(mesh.getSeparateComponents())
    result[name]=item
(OUT/'mesh-diagnostics.json').write_text(json.dumps(result,indent=2,default=str))
print(json.dumps(result,default=str))
