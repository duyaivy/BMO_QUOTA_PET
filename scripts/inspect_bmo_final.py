"""Run through FreeCAD MCP: inspect and byte-backup current assembly, no edits."""
import json
import hashlib
import shutil
import datetime
import Part
from pathlib import Path
from FreeCAD import Vector as V

ROOT = Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET')
OUT = ROOT / 'cad/final_print'
OUT.mkdir(exist_ok=True)
source = ROOT / 'cad/hardware_review/BMO_HARDWARE_INTEGRATED.FCStd'
doc = next((d for d in App.listDocuments().values() if d.FileName == str(source)), None)
if doc is None:
    doc = App.openDocument(str(source))
stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
backup = OUT / ('SOURCE_BACKUP_' + stamp + '.FCStd')
shutil.copy2(source, backup)
assert source.read_bytes() == backup.read_bytes()
audit = json.loads((ROOT / 'cad/hardware_review/integration-audit.json').read_text())
def bounds(s):
    b = s.BoundBox
    return [b.XMin, b.YMin, b.ZMin, b.XMax, b.YMax, b.ZMax]
report = {'source': str(source.relative_to(ROOT)), 'backup': str(backup.relative_to(ROOT)),
          'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
          'freecad': App.Version(), 'live_unsaved': doc.isTouched(),
          'objects': {}, 'files': [], 'button_front_distances': []}
for o in doc.Objects:
    if hasattr(o, 'Shape') and not o.Shape.isNull():
        report['objects'][o.Name] = {'label': o.Label, 'type': o.TypeId,
            'bounds': bounds(o.Shape), 'valid': o.Shape.isValid(),
            'solids': len(o.Shape.Solids), 'volume': o.Shape.Volume,
            'visible': o.ViewObject.Visibility, 'physical': o.Name in audit['parts']}
names = ['BMO_DPad_Yellow', 'BMO_Action_Button_Red', 'Triangle_Cyan',
         'Upper_Button_Blue', 'Small_Button_Green']
# Slice only the exposed face detail, excluding internal retaining flanges.
slab = Part.makeBox(100, 1.2, 100, V(-50, -16.6, 0))
for i, a in enumerate(names):
    for b in names[i+1:]:
        report['button_front_distances'].append({'a': a, 'b': b,
            'distance_mm': doc.getObject(a).Shape.common(slab).distToShape(doc.getObject(b).Shape.common(slab))[0]})
for folder in [ROOT, ROOT/'cad', ROOT/'cad/hardware_review', ROOT/'cad/hardware_review/prototype_stl']:
    for p in sorted(folder.iterdir()):
        if p.suffix.lower() in ('.fcstd', '.stl', '.step'):
            report['files'].append({'path': str(p.relative_to(ROOT)), 'bytes': p.stat().st_size})
(OUT/'baseline-inspection.json').write_text(json.dumps(report, indent=2))
print(json.dumps({'backup': report['backup'], 'live_unsaved': report['live_unsaved'],
    'objects': len(report['objects']), 'physical': len(audit['parts']),
    'button_front_distances': report['button_front_distances'], 'files': len(report['files'])}))
