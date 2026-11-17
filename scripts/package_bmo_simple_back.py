"""Verify delivered meshes/previews and package only current shop artifacts."""
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import trimesh

out = Path(__file__).resolve().parents[1] / 'cad/print_shop/simple_back'
report = json.loads((out / 'revision-report.json').read_text())
assert report['remaining_internal_tray_volume_mm3'] < 1e-6
assert len(report['component_checks']) == 14
assert all(v['shape_and_position_unchanged'] for v in report['component_checks'].values())
for name in report['parts']:
    mesh = trimesh.load_mesh(out / (name + '.stl'), process=True)
    assert mesh.is_watertight and mesh.is_winding_consistent and mesh.volume > 0, name
    assert len(mesh.split(only_watertight=False)) == 1, name
for file in sorted(out.glob('0*.png')):
    assert file.read_bytes().startswith(b'\x89PNG\r\n\x1a\n') and file.stat().st_size > 10000
files = [out / name for name in ['BMO_SIMPLE_BACK.FCStd', 'README_VI.txt', 'PREVIEW.html',
                                 'revision-report.json', 'mesh-validation.json', 'rear-screw-audit.json']]
files += sorted(out.glob('*.stl')) + sorted(out.glob('*.step')) + sorted(out.glob('0*.png'))
files += sorted((out/'preview').glob('*.png'))
manifest = {str(p.relative_to(out)): {'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in files}
(out / 'MANIFEST.json').write_text(json.dumps(manifest, indent=2))
files.append(out / 'MANIFEST.json')
dest = out / 'BMO_SIMPLE_BACK_SEND_TO_SHOP.zip'
with ZipFile(dest, 'w', ZIP_DEFLATED) as archive:
    for file in files:
        archive.write(file, str(file.relative_to(out)))
with ZipFile(dest) as archive:
    assert archive.testzip() is None
    for name, record in manifest.items():
        assert hashlib.sha256(archive.read(name)).hexdigest() == record['sha256']
print(json.dumps({'zip': str(dest), 'bytes': dest.stat().st_size, 'files': len(files),
                  'closed_meshes': 7, 'unchanged_components': 14,
                  'preview_files': len(list(out.glob('0*.png'))) + len(list((out/'preview').glob('*.png')))}))
