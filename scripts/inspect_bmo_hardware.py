"""Read and back up the latest assembly before hardware edits, via FreeCAD MCP."""
import json
import hashlib
import shutil
import datetime
from pathlib import Path
root=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET')
out=root/'cad/hardware_review'; out.mkdir(exist_ok=True)
source=root/'cad/BMO_FINGERS_FILLED_LEGS_CONCEPT.FCStd'
doc=App.openDocument(str(source))
report={'freecad_version':App.Version(),'source':str(source),'files':[],'objects':[]}
for p in sorted(root.rglob('*.FCStd')):
    if any(x in p.parts for x in ('node_modules','.next')): continue
    report['files'].append({'path':str(p.relative_to(root)),'bytes':p.stat().st_size})
for o in doc.Objects:
    item={'name':o.Name,'label':o.Label,'type':o.TypeId,'properties':list(o.PropertiesList)}
    if hasattr(o,'Shape') and not o.Shape.isNull():
        b=o.Shape.BoundBox
        item.update({'bounds':[b.XMin,b.YMin,b.ZMin,b.XMax,b.YMax,b.ZMax],'volume_mm3':o.Shape.Volume,'valid':o.Shape.isValid(),'solids':len(o.Shape.Solids)})
    report['objects'].append(item)
# Back up disk source byte-for-byte, and also save the opened state in a separate file.
stamp=datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
backup=out/('backup-'+stamp+'.FCStd'); shutil.copy2(source,backup)
report['backup']=str(backup); report['sha256']=hashlib.sha256(source.read_bytes()).hexdigest()
assert hashlib.sha256(backup.read_bytes()).hexdigest()==report['sha256']
doc.saveAs(str(out/'INSPECTED_BASELINE.FCStd'))
(out/'baseline-inspection.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'source':report['source'],'backup':report['backup'],'sha256':report['sha256'],'objects':[{k:v for k,v in x.items() if k in ('name','type','bounds','solids')} for x in report['objects']]},indent=2))
