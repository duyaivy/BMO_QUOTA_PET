"""Repair local tessellation noise and independently validate the four shop STLs.

Run using an isolated environment with numpy, trimesh, pymeshlab, manifold3d.
Editable CAD is never modified by this script. Output is gated on mesh checks.
"""
import json
import hashlib
import importlib.metadata
from pathlib import Path
import numpy as np
import trimesh
import pymeshlab as p
import manifold3d as m

ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'cad/print_shop'
source=json.loads((OUT/'source-export.json').read_text())
DEST=OUT/'SEND_TO_PRINT'; DEST.mkdir(exist_ok=True)
report={'status':'DESIGN_REVIEW_REQUIRED','tools':{n:importlib.metadata.version(n) for n in ('numpy','trimesh','pymeshlab','manifold3d')},'parts':[]}
def as_mesh(ms):
    q=ms.current_mesh()
    return trimesh.Trimesh(vertices=q.vertex_matrix(),faces=q.face_matrix(),process=False)
def load_set(mesh):
    ms=p.MeshSet(); ms.add_mesh(p.Mesh(vertex_matrix=np.asarray(mesh.vertices),face_matrix=np.asarray(mesh.faces,dtype=np.int32)))
    return ms
def checks(ms):
    mesh=as_mesh(ms); ms.compute_selection_by_self_intersections_per_face()
    return {'watertight':bool(mesh.is_watertight),'winding_consistent':bool(mesh.is_winding_consistent),'positive_volume':bool(mesh.volume>0),'components':len(mesh.split(only_watertight=False)),'self_intersecting_faces':int(ms.current_mesh().selected_face_number()),'faces':len(mesh.faces),'vertices':len(mesh.vertices),'volume_mm3':float(mesh.volume)}
def passed(r): return r['watertight'] and r['winding_consistent'] and r['positive_volume'] and r['components']==1 and r['self_intersecting_faces']==0
for item in source['printed_parts']:
    name=item['name']; raw=trimesh.load_mesh(ROOT/item['source'],process=True)
    ms=load_set(raw); before=checks(ms); stages=[]
    for attempt in range(4):
        r=checks(ms)
        if passed(r): break
        if r['self_intersecting_faces']:
            assert r['self_intersecting_faces']<500,'Widespread mesh error; regenerate CAD tessellation'
            ms.meshing_remove_selected_faces()
        ms.meshing_remove_duplicate_vertices(); ms.meshing_remove_duplicate_faces(); ms.meshing_remove_null_faces()
        ms.meshing_repair_non_manifold_edges(method=0)
        ms.meshing_close_holes(maxholesize=100,selfintersection=True)
        ms.meshing_remove_unreferenced_vertices()
        stages.append(checks(ms))
    r=checks(ms)
    if passed(r):
        current=as_mesh(ms)
        solid=m.Manifold(m.Mesh(vert_properties=np.asarray(current.vertices,dtype=np.float32),tri_verts=np.asarray(current.faces,dtype=np.uint32)))
        if not solid.is_empty():
            cleanup_tolerance=.01 if name=='BMO_MAIN_BODY' else .005
            q=solid.simplify(cleanup_tolerance).to_mesh()
            candidate=trimesh.Trimesh(vertices=np.asarray(q.vert_properties)[:,:3],faces=np.asarray(q.tri_verts),process=True)
            trial=load_set(candidate); result=checks(trial)
            stages.append({'manifold_cleanup_tolerance_mm':cleanup_tolerance,'checks':result})
            if passed(result): ms=trial; r=result
    if not passed(r) and raw.is_watertight and raw.is_winding_consistent:
        solid=m.Manifold(m.Mesh(vert_properties=np.asarray(raw.vertices,dtype=np.float32),tri_verts=np.asarray(raw.faces,dtype=np.uint32)))
        if not solid.is_empty():
            for tolerance in (.001,.005,.01):
                q=solid.simplify(tolerance).to_mesh()
                candidate=trimesh.Trimesh(vertices=np.asarray(q.vert_properties)[:,:3],faces=np.asarray(q.tri_verts),process=True)
                trial=load_set(candidate); result=checks(trial)
                stages.append({'manifold_simplify_mm':tolerance,'checks':result})
                if passed(result): ms=trial; r=result; break
    record={**item,'before':before,'stages':stages,'after':r}
    report['parts'].append(record)
    (OUT/'mesh-validation.json').write_text(json.dumps(report,indent=2))
    assert passed(r),name+' still has mesh defects; no shop file released'
    fixed=as_mesh(ms)
    h=load_set(raw); h.add_mesh(p.Mesh(vertex_matrix=np.asarray(fixed.vertices),face_matrix=np.asarray(fixed.faces,dtype=np.int32)))
    distances=[]
    for a,b in ((0,1),(1,0)):
        distances.append(h.get_hausdorff_distance(sampledmesh=a,targetmesh=b,samplevert=True,sampleedge=True,sampleface=True,samplenum=20000))
    record['sampled_bidirectional_hausdorff']=distances
    assert all(float(d['max'])<.05 for d in distances), 'Repair deviates >0.05 mm from source tessellation'
    record['relative_volume_error_to_cad']=abs(float(fixed.volume)-item['cad_volume_mm3'])/item['cad_volume_mm3']
    assert record['relative_volume_error_to_cad']<.003, 'Repair changes >0.3 percent of CAD volume'
    # Place the actual triangles on the build plate; never use loose NURBS bounds.
    shift=np.array([-(fixed.bounds[0,0]+fixed.bounds[1,0])/2,-(fixed.bounds[0,1]+fixed.bounds[1,1])/2,-fixed.bounds[0,2]])
    fixed.apply_translation(shift)
    file=DEST/(name+'.stl'); fixed.export(file,file_type='stl')
    again=trimesh.load_mesh(file,process=True); final=checks(load_set(again))
    assert passed(final), 'Saved STL failed reimport'
    record.update({'file':str(file.relative_to(ROOT)),'saved_checks':final,'bounds_mm':again.bounds.tolist(),'mesh_bed_translation_mm':shift.tolist(),'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'bytes':file.stat().st_size})
    (OUT/'mesh-validation.json').write_text(json.dumps(report,indent=2))
    print(json.dumps({'part':name,'saved_checks':final,'bytes':file.stat().st_size}),flush=True)
assert len(list(DEST.glob('*.stl')))==4
print('Four closed, connected, consistently oriented STL meshes validated.')
