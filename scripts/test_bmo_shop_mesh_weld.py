"""FreeCAD MCP bounded vertex welding of tessellation noise, never CAD scaling."""
import Mesh
import MeshPart
import math
import json
from pathlib import Path
from FreeCAD import Vector as V
ROOT=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET'); OUT=ROOT/'cad/print_shop'
doc=App.activeDocument(); report=[]
for name in ('BMO_MAIN_BODY','BMO_BACK_COVER'):
    shape=doc.getObject(name).Shape.copy()
    if hasattr(shape,'cleaned'): shape=shape.cleaned()
    raw=MeshPart.meshFromShape(Shape=shape,LinearDeflection=.025,AngularDeflection=.10,Relative=False)
    points,facets=raw.Topology
    trials=[]
    for grid in (.002,.005,.01,.02):
        mapped=[tuple(round(float(c)/grid)*grid for c in p) for p in points]
        unique={}; removed=0
        for ids in facets:
            p=tuple(mapped[i] for i in ids)
            if len(set(p))<3:
                removed+=1; continue
            if (V(*p[1])-V(*p[0])).cross(V(*p[2])-V(*p[0])).Length<1e-10:
                removed+=1; continue
            key=tuple(sorted(p))
            if key in unique:
                old=unique[key]
                # Opposite coincident faces cancel; same-facing duplicates collapse.
                if (V(*p[1])-V(*p[0])).cross(V(*p[2])-V(*p[0])).dot((V(*old[1])-V(*old[0])).cross(V(*old[2])-V(*old[0])))<0:
                    del unique[key]
                removed+=1; continue
            unique[key]=p
        mesh=Mesh.Mesh(list(unique.values()))
        item={'grid_mm':grid,'max_vertex_displacement_bound_mm':math.sqrt(3)*grid/2,'removed_collapsed_facets':removed,'solid':mesh.isSolid(),'nonmanifold':mesh.hasNonManifolds(),'self_intersections':mesh.hasSelfIntersections(),'components':mesh.countComponents(),'facets':mesh.CountFacets,'relative_volume_error_to_cad':abs(mesh.Volume-shape.Volume)/shape.Volume}
        trials.append(item)
        if item['solid'] and not item['nonmanifold'] and not item['self_intersections'] and item['components']==1:
            mesh.write(str(OUT/(name+'-welded-trial.stl')))
            break
    report.append({'part':name,'trials':trials})
    (OUT/'mesh-weld-study.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
