"""FreeCAD MCP concept: three small fingers and solid upper seated legs."""
import Part
import json
import itertools
import math
from pathlib import Path
from FreeCAD import Vector as V

root=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET/cad')
source=root/'BMO_VERTICAL_LETTERS_SIMPLE_ARMS.FCStd'
for opened in list(App.listDocuments().values()):
    if opened.FileName==str(source): App.closeDocument(opened.Name)
doc=App.openDocument(str(source))
doc.Label='BMO DUT — three fingers / filled seated legs'
limbs=['BMO_Sitting_Leg_Left','BMO_Sitting_Leg_Right','BMO_Sitting_Arm_Left','BMO_Sitting_Arm_Right']
table_clip=Part.makeBox(200,200,200,V(-100,-100,0))
def ellipsoid(rx,ry,rz,center):
    m=App.Matrix(); m.A11=rx; m.A22=ry; m.A33=rz
    s=Part.makeSphere(1).transformGeometry(m); s.translate(V(*center)); return s
def rounded_xz(w,d,h,r,x,y,z):
    s=Part.makeBox(w-2*r,d,h,V(x+r,y,z)).fuse(Part.makeBox(w,d,h-2*r,V(x,y,z+r)))
    for xx in (x+r,x+w-r):
        for zz in (z+r,z+h-r):
            s=s.fuse(Part.makeCylinder(r,d,V(xx,y,zz),V(0,1,0)))
    return s.removeSplitter()

finger_details=[]; leg_fill_details=[]
for side,suffix in [(-1,'Left'),(1,'Right')]:
    obj=doc.getObject('BMO_Sitting_Arm_'+suffix)
    arm=obj.Shape.copy()
    cx=side*29.8
    palm=ellipsoid(2.2,1.8,.9,(cx,7.9,.75))
    # Three short fingers, separated by a nominal 0.4 mm gap at the free ends.
    for dx in (-1.5,0,1.5):
        tip_y=11.5 if dx==0 else 10.8
        finger=Part.makeCylinder(.55,tip_y-8.5,V(cx+dx,8.5,.65),V(0,1,0))
        finger=finger.fuse(Part.makeSphere(.55,V(cx+dx,tip_y,.65)))
        palm=palm.fuse(finger)
        finger_details.append({'part':obj.Name,'center_x_mm':cx+dx,'tip_y_mm':tip_y,'diameter_mm':1.1})
    arm=arm.fuse(palm).common(table_clip).removeSplitter()
    obj.Shape=arm; obj.ViewObject.DisplayMode='Shaded'
    obj.ViewObject.Deviation=.02; obj.ViewObject.AngularDeflection=6
    # Fill the open region above the horizontal leg, up to the body's Z=7 bottom.
    # Preserve separate legs and their existing locating pegs.
    leg_obj=doc.getObject('BMO_Sitting_Leg_'+suffix)
    fill=rounded_xz(5.4,17,5,1,side*10-2.7,-23,2)
    before=leg_obj.Shape.Volume
    leg_obj.Shape=leg_obj.Shape.fuse(fill).removeSplitter()
    leg_fill_details.append({'part':leg_obj.Name,'top_z_mm':7,'front_back_span_y_mm':[-23,-6],'added_volume_mm3':leg_obj.Shape.Volume-before})

doc.recompute()
parts=[o for o in doc.Objects if o.TypeId=='Part::Feature' and 'SectionCut' not in o.Name]
report={'status':'CONCEPT ONLY — print fit and strength unverified','fingers':finger_details,'nominal_free_finger_gap_mm':.4,'leg_fills':leg_fill_details,'parts':{},'overlaps':[],'contacts':[]}
for o in parts:
    b=o.Shape.BoundBox
    report['parts'][o.Name]={'valid':o.Shape.isValid(),'solids':len(o.Shape.Solids),'bounds':[b.XMin,b.YMin,b.ZMin,b.XMax,b.YMax,b.ZMax]}
for a,b in itertools.combinations(parts,2):
    v=a.Shape.common(b.Shape).Volume
    if v>.001:
        report['overlaps'].append({'a':a.Name,'b':b.Name,'volume_mm3':v,'display_overlay':{a.Name,b.Name}=={'OLED_096_Glass','OLED_096_ActiveArea'}})
# Probe the interior of the former side-view gap: it must now be solid leg.
for side,suffix in [(-1,'Left'),(1,'Right')]:
    probe=Part.makeBox(2,9,.5,V(side*10-1,-20,6.4))
    missing=probe.cut(doc.getObject('BMO_Sitting_Leg_'+suffix).Shape).Volume
    report['leg_fills'][0 if side==-1 else 1]['probe_missing_mm3']=missing
    assert missing<.001,'Upper leg gap remains'
points=[]
for name in limbs:
    for face in doc.getObject(name).Shape.Faces:
        b=face.BoundBox
        if abs(b.ZMin)<1e-5 and abs(b.ZMax)<1e-5 and face.Area>.01:
            report['contacts'].append({'part':name,'area_mm2':face.Area})
            for edge in face.Edges:
                points.extend([(p.x,p.y) for p in edge.discretize(Number=24)])
def cross(o,a,b): return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
points=sorted(set(points)); lower=[]; upper=[]
for p in points:
    while len(lower)>=2 and cross(lower[-2],lower[-1],p)<=0: lower.pop()
    lower.append(p)
for p in reversed(points):
    while len(upper)>=2 and cross(upper[-2],upper[-1],p)<=0: upper.pop()
    upper.append(p)
polygon=lower[:-1]+upper[:-1]
masses=json.loads((root/'seated-signature-audit.json').read_text())['stability_estimate']['electronics_mass_assumptions_g']
mass=0; weighted=V(0,0,0)
for o in parts:
    assert o.Shape.isValid() and len(o.Shape.Solids)==1,o.Name+' invalid or disconnected'
    m=masses.get(o.Name,o.Shape.Volume*.00124)
    mass+=m; weighted+=o.Shape.Solids[0].CenterOfMass*m
com=weighted/mass
margin=min(cross(p,polygon[(i+1)%len(polygon)],(com.x,com.y))/math.dist(p,polygon[(i+1)%len(polygon)]) for i,p in enumerate(polygon))
report['static_estimate']={'com_xyz_mm':[com.x,com.y,com.z],'margin_mm':margin,'limitation':'Unmeasured mass assumptions, rigid level table; no real strength or tip test'}
(root/'fingers-filled-legs-audit.json').write_text(json.dumps(report,indent=2))
assert all(p['display_overlay'] for p in report['overlaps']),'Physical overlap'
assert set(c['part'] for c in report['contacts'])==set(limbs),'Missing support'
assert all(report['parts'][n]['bounds'][2]>=-1e-5 for n in limbs),'Below table'
assert margin>0,'Static COM outside support polygon'
Gui.activateWorkbench('PartWorkbench'); Gui.updateGui(); doc.recompute()
doc.saveAs(str(root/'BMO_FINGERS_FILLED_LEGS_CONCEPT.FCStd'))
print(json.dumps({'parts':len(parts),'pairs_checked':len(parts)*(len(parts)-1)//2,'overlaps':report['overlaps'],'leg_fills':report['leg_fills'],'contacts':report['contacts'],'static_margin_mm':margin},indent=2))
