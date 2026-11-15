"""Read FreeCAD mesh repair API; no document edits."""
import Mesh
import json
m=Mesh.Mesh()
names=[n for n in dir(m) if any(k in n.lower() for k in ('hole','fill','degener','pointson','duplicate','clean'))]
print(json.dumps({n:getattr(m,n).__doc__ for n in names}))
