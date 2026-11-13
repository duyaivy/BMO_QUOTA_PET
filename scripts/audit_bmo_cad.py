"""Run inside FreeCAD GUI via MCP. Units: mm, mm², mm³."""
import json
import itertools
from pathlib import Path
ROOT = Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET')
doc = App.openDocument(str(ROOT / 'BMO_QUOTA_PET.FCStd'))
objects = [o for o in doc.Objects if o.TypeId == 'Part::Feature' and not o.Shape.isNull() and 'SectionCut' not in o.Name]
report = {'file': doc.FileName, 'units': 'mm', 'objects': {}, 'overlaps': []}
for o in objects:
    b = o.Shape.BoundBox
    report['objects'][o.Name] = {'valid': o.Shape.isValid(), 'solids': len(o.Shape.Solids), 'volume': o.Shape.Volume, 'bounds': [b.XMin,b.YMin,b.ZMin,b.XMax,b.YMax,b.ZMax]}
for a,b in itertools.combinations(objects,2):
    v = a.Shape.common(b.Shape).Volume
    if v > .001:
        report['overlaps'].append({'a':a.Name,'b':b.Name,'volume_mm3':round(v,4)})
(ROOT / 'cad').mkdir(exist_ok=True)
(ROOT / 'cad/original-audit.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
