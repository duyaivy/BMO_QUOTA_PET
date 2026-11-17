"""Read-only FreeCAD MCP inventory for the current print-shop source."""
import json
from pathlib import Path

root = Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET')
doc = App.openDocument(str(root / 'cad/print_shop/BMO_PRINT_SHOP.FCStd'))
rows = []
for obj in doc.Objects:
    if not hasattr(obj, 'Shape') or obj.Shape.isNull():
        continue
    bb = obj.Shape.BoundBox
    rows.append({
        'name': obj.Name, 'label': obj.Label,
        'visible': obj.ViewObject.Visibility,
        'bounds': [round(v, 2) for v in (bb.XMin, bb.YMin, bb.ZMin, bb.XMax, bb.YMax, bb.ZMax)],
        'volume': round(obj.Shape.Volume, 2), 'solids': len(obj.Shape.Solids),
    })
print(json.dumps(rows))
