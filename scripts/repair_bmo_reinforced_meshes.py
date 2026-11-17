"""Validate and locally repair the seven aligned STL meshes from FreeCAD."""
import json
import sys
from pathlib import Path

import numpy as np
import pymeshlab as p
import trimesh

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / (sys.argv[1] if len(sys.argv) > 1 else 'cad/print_shop/reinforced')
report = json.loads((OUT / 'revision-report.json').read_text())
checks = {}

def meshset(mesh):
    ms = p.MeshSet()
    ms.add_mesh(p.Mesh(vertex_matrix=np.asarray(mesh.vertices), face_matrix=np.asarray(mesh.faces, dtype=np.int32)))
    return ms

def current_mesh(ms):
    q = ms.current_mesh()
    return trimesh.Trimesh(vertices=q.vertex_matrix(), faces=q.face_matrix(), process=True)

for name, cad in report['parts'].items():
    path = OUT / (name + '.stl')
    raw = trimesh.load_mesh(path, process=True)
    before = {'watertight': bool(raw.is_watertight), 'winding_consistent': bool(raw.is_winding_consistent), 'volume_mm3': float(raw.volume)}
    ms = meshset(raw)
    for _ in range(4):
        candidate = current_mesh(ms)
        if candidate.is_watertight and candidate.is_winding_consistent and len(candidate.split(only_watertight=False)) == 1:
            break
        ms.compute_selection_by_self_intersections_per_face()
        if ms.current_mesh().selected_face_number():
            ms.meshing_remove_selected_faces()
        ms.meshing_remove_duplicate_vertices()
        ms.meshing_remove_duplicate_faces()
        ms.meshing_remove_null_faces()
        ms.meshing_repair_non_manifold_edges(method=0)
        ms.meshing_close_holes(maxholesize=100, selfintersection=True)
        ms.meshing_remove_unreferenced_vertices()
    fixed = current_mesh(ms)
    fixed.export(path, file_type='stl')
    saved = trimesh.load_mesh(path, process=True)
    result = {
        'before': before,
        'after': {
            'watertight': bool(saved.is_watertight),
            'winding_consistent': bool(saved.is_winding_consistent),
            'positive_volume': bool(saved.volume > 0),
            'components': len(saved.split(only_watertight=False)),
            'volume_mm3': float(saved.volume),
            'relative_volume_error': abs(float(saved.volume) - cad['volume_mm3']) / cad['volume_mm3'],
        },
    }
    checks[name] = result
    assert result['after']['watertight'] and result['after']['winding_consistent']
    assert result['after']['positive_volume'] and result['after']['components'] == 1
    assert result['after']['relative_volume_error'] < 0.003, name

(OUT / 'mesh-validation.json').write_text(json.dumps(checks, indent=2))
print(json.dumps(checks))
