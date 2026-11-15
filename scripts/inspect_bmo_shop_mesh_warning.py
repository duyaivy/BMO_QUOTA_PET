"""FreeCAD MCP quantify the remaining mesh-kernel warning on final output."""
import Mesh
import json
from pathlib import Path
ROOT=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET'); OUT=ROOT/'cad/print_shop'
m=Mesh.Mesh(str(OUT/'SEND_TO_PRINT/BMO_MAIN_BODY.stl'))
rows=[]
for a,b,p,q in m.getSelfIntersections():
    rows.append({'facets':[a,b],'a':[p.x,p.y,p.z],'b':[q.x,q.y,q.z],'intersection_segment_mm':(q-p).Length})
(OUT/'freecad-mesh-warning.json').write_text(json.dumps(rows,indent=2))
print(json.dumps(rows))
