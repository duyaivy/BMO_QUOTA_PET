"""Check delivered evidence/artifacts and build a local review ZIP. No CAD runtime."""
import ast
import hashlib
import json
import zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'cad/hardware_review'
audit=json.loads((OUT/'integration-audit.json').read_text())
validation=json.loads((OUT/'mechanical-validation.json').read_text())
base=json.loads((OUT/'baseline-inspection.json').read_text())
saved=json.loads((OUT/'saved-file-verification.json').read_text())
assert saved['saved_cad_reopened'] and saved['placements_match']
assert all(p['valid'] for p in audit['parts'].values())
assert not [p for p in audit['overlaps'] if p['classification']=='REVIEW_REQUIRED']
assert not audit['keepout_conflicts']
assert audit['ears_symmetric_difference_mm3']<.001
assert validation['lid_overlap_mm3']<.001
assert not any(s['conflicts'] for s in validation['service_sweeps'])
assert all(x['solid_length_mm']<.001 for x in validation['pilot_axis_obstructions_mm'])
assert len(validation['meshes'])==9 and all(x['exported'] and x['closed_edge_check'] for x in validation['meshes'])
assert hashlib.sha256(Path(base['source']).read_bytes()).hexdigest()==base['sha256']
assert hashlib.sha256(Path(base['backup']).read_bytes()).hexdigest()==base['sha256']
images=sorted(OUT.glob('0*.png')); assert len(images)==9
steps=sorted(OUT.glob('*.step')); assert len(steps)==4
for p in images+steps: assert p.stat().st_size>1000
with zipfile.ZipFile(OUT/'BMO_HARDWARE_INTEGRATED.FCStd') as cad:
    assert cad.testzip() is None and 'Document.xml' in cad.namelist()
scripts=[ROOT/'scripts'/x for x in ('inspect_bmo_hardware.py','integrate_bmo_hardware.py','validate_export_bmo_hardware.py','verify_bmo_hardware_saved.py','freecad_bridge_call.py','check_bmo_hardware_artifacts.py')]
for p in scripts: ast.parse(p.read_text())
files=[OUT/'BMO_HARDWARE_INTEGRATED.FCStd',OUT/'INSPECTED_BASELINE.FCStd',Path(base['backup']),ROOT/base['source'] if not Path(base['source']).is_absolute() else Path(base['source']),*OUT.glob('*.json'),*images,*steps,*OUT.glob('prototype_stl/*.stl'),*scripts,ROOT/'docs/BMO_HARDWARE_FIT_REVIEW.md']
package=OUT/'BMO_HARDWARE_REVIEW_PACKAGE.zip'
with zipfile.ZipFile(package,'w',compression=zipfile.ZIP_DEFLATED) as z:
    for p in dict.fromkeys(files): z.write(p,p.relative_to(ROOT))
with zipfile.ZipFile(package) as z: assert z.testzip() is None
print(json.dumps({'status':'DESIGN_REVIEW_REQUIRED','audited_parts':len(audit['parts']),'part_pairs':len(audit['parts'])*(len(audit['parts'])-1)//2,'prototype_stls':9,'component_steps':4,'images':len(images),'source_backup_unchanged':True,'saved_cad_reopened':True,'package':str(package.relative_to(ROOT))}))
