"""FreeCAD MCP: continuous soft arm/hand lofts and separate colored accents."""
import Part
import json
import itertools
import math
from pathlib import Path
from FreeCAD import Vector as V

root=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET/cad')
source=root/'BMO_SEATED_DUYAIVY_CONCEPT.FCStd'
for opened in list(App.listDocuments().values()):
    if opened.FileName==str(source): App.closeDocument(opened.Name)
doc=App.openDocument(str(source))
doc.Label='BMO DUT — soft limbs + separate color inserts'
shell=doc.getObject('BMO_Front_Shell').Shape.copy()
limbs=['BMO_Sitting_Leg_Left','BMO_Sitting_Leg_Right','BMO_Sitting_Arm_Left','BMO_Sitting_Arm_Right']
def cyl(r,h,p,d=(0,0,1)):
    return Part.makeCylinder(r,h,V(*p),V(*d))
def grounded(s):
    return s.common(Part.makeBox(200,200,200,V(-100,-100,0))).removeSplitter()
def profile(center,normal,rx,ry):
    edge=Part.makeCircle(rx) if abs(rx-ry)<1e-6 else Part.Ellipse(V(0,0,0),rx,ry).toShape()
    wire=Part.Wire([edge])
    wire.Placement=App.Placement(V(*center),App.Rotation(V(1,0,0),V(0,1,0),normal,'ZXY'))
    return wire

for side,suffix in [(-1,'Left')]:
    # One loft continues from upper arm through wrist into a rounded mitten palm.
    stations=[(24.6,0,29,1.7,1.7),(26.5,-.8,27.5,1.9,1.9),
              (29,-1.5,23,2,2),(29.8,-1,16,1.85,1.85),
              (29.8,.5,9,1.7,1.7),(30.5,2.5,4.2,1.6,1.6),
              (32,5.5,2,1.65,1.65),(32,7.5,1,2.8,1.5),
              (32,10,.8,3,1.3),(32,12,.8,2.3,1.1),
              (32,13.1,.8,.2,.2)]
    centers=[V(side*x,y,z) for x,y,z,rx,ry in stations]
    sections=[]
    for i,(x,y,z,rx,ry) in enumerate(stations):
        tangent=centers[min(i+1,len(centers)-1)]-centers[max(0,i-1)]
        if i>=6: tangent=V(0,1,0)
        sections.append(profile((side*x,y,z),tangent,rx,ry))
    arm=Part.makeLoft(sections,True,False,False,5)
    arm=arm.fuse(Part.makeSphere(1.7,centers[0]))
    arm=arm.fuse(cyl(1.4,3.5,(side*21.5,0,29),(side,0,0)))
    arm=grounded(arm)
    # Clear only the shoulder region with a slightly larger matching loft.
    clear_sections=[]
    for i in range(len(stations)):
        x,y,z,rx,ry=stations[i]
        tangent=centers[min(i+1,len(centers)-1)]-centers[max(0,i-1)]
        if i>=6: tangent=V(0,1,0)
        clear_sections.append(profile((side*x,y,z),tangent,rx+.25,ry+.25))
    shoulder_clearance=Part.makeLoft(clear_sections,True,False,False,5)
    shell=shell.cut(shoulder_clearance)
    shell=shell.cut(Part.makeSphere(1.95,centers[0]))
    doc.getObject('BMO_Sitting_Arm_'+suffix).Shape=arm
    # Round every outer edge of the foot, then trim its sole flat.
    cx=side*10
    foot=Part.makeBox(7,5.6,12,V(cx-3.5,-25.6,-1))
    foot=foot.makeFillet(2.4,foot.Edges)
    thigh=cyl(2.7,16,(cx,-7,3),(0,-1,0))
    hip=cyl(3,4,(cx,-7,3)).fuse(cyl(1.8,3.1,(cx,-7,6.9)))
    leg=grounded(foot.fuse(thigh).fuse(hip))
    doc.getObject('BMO_Sitting_Leg_'+suffix).Shape=leg
    # Mirror the same verified surface for exact left/right symmetry.
    mirror=App.Matrix(); mirror.A11=-1
    right_arm=arm.transformGeometry(mirror)
    right_leg=leg.transformGeometry(mirror)
    assert arm.isValid() and len(arm.Solids)==1,'Left arm loft failed'
    assert right_arm.isValid() and len(right_arm.Solids)==1,'Mirrored arm failed'
    doc.getObject('BMO_Sitting_Arm_Right').Shape=right_arm
    doc.getObject('BMO_Sitting_Leg_Right').Shape=right_leg
    shell=shell.cut(shoulder_clearance.transformGeometry(mirror))
    shell=shell.cut(Part.makeSphere(1.95,V(24.6,0,29)))

group=doc.addObject('App::DocumentObjectGroup','Separate_Color_Inserts')
colors=[]
def triangle(points,y,depth):
    p=[V(x,y,z) for x,z in points]
    return Part.Face(Part.makePolygon(p+[p[0]])).extrude(V(0,depth,0))

# Fixed cosmetic inserts: blind locating holes, shallow glue seats; not extra switches.
tri=triangle([(-3.5,23.5),(3.5,23.5),(0,30.5)],-16,1.8)
tri_pocket=triangle([(-3.8,23.2),(3.8,23.2),(0,31)],-16.2,2.2)
specs=[('Triangle_Cyan',tri,tri_pocket,0,26.5,.75,(.05,.85,.88),'cyan'),
       ('Upper_Button_Blue',cyl(1.5,1.8,(8.5,-16,44.4),(0,1,0)),cyl(1.7,2.2,(8.5,-16.2,44.4),(0,1,0)),8.5,44.4,.6,(.08,.25,.88),'blue'),
       ('Small_Button_Green',cyl(1.3,1.8,(11.2,-16,29),(0,1,0)),cyl(1.5,2.2,(11.2,-16.2,29),(0,1,0)),11.2,29,.6,(.15,.85,.12),'green')]
for name,cap,pocket,x,z,peg_r,color,color_name in specs:
    shell=shell.cut(pocket).cut(cyl(peg_r+.2,1.2,(x,-14.3,z),(0,1,0)))
    cap=cap.fuse(cyl(peg_r,1.05,(x,-14.25,z),(0,1,0))).removeSplitter()
    o=doc.addObject('Part::Feature',name); o.Shape=cap; group.addObject(o)
    o.ViewObject.ShapeColor=color
    o.addProperty('App::PropertyString','AssemblyNote','Design review')
    o.AssemblyNote='Fixed cosmetic insert; separate color print + glue; tolerances unverified'
    colors.append({'part':name,'color':color_name,'type':'fixed cosmetic insert','peg_diameter_mm':peg_r*2,'radial_peg_clearance_mm':.2,'pocket_end_clearance_mm':.2})

shell=shell.removeSplitter()
doc.getObject('BMO_Front_Shell').Shape=shell
lid=doc.getObject('BMO_Back_Cover').Shape
doc.getObject('BMO_Enclosure_SectionCut').Shape=shell.fuse(lid).cut(Part.makeBox(100,100,150,V(-100,-50,-30)))
parts=[o for o in doc.Objects if o.TypeId=='Part::Feature' and 'SectionCut' not in o.Name]
report={'status':'CONCEPT ONLY; assembly and physical stability unverified','color_inserts':colors,'parts':{},'overlaps':[],'table_contacts':[]}
for o in parts:
    o.ViewObject.Deviation=.03; o.ViewObject.AngularDeflection=8
    if o.Name in limbs: o.ViewObject.DisplayMode='Shaded'
    b=o.Shape.BoundBox
    report['parts'][o.Name]={'valid':o.Shape.isValid(),'solids':len(o.Shape.Solids),'bounds':[b.XMin,b.YMin,b.ZMin,b.XMax,b.YMax,b.ZMax]}
for a,b in itertools.combinations(parts,2):
    vol=a.Shape.common(b.Shape).Volume
    if vol>.001:
        report['overlaps'].append({'a':a.Name,'b':b.Name,'volume_mm3':vol,'display_overlay':{a.Name,b.Name}=={'OLED_096_Glass','OLED_096_ActiveArea'}})
points=[]
for name in limbs:
    for f in doc.getObject(name).Shape.Faces:
        b=f.BoundBox
        if abs(b.ZMin)<1e-5 and abs(b.ZMax)<1e-5 and f.Area>.01:
            report['table_contacts'].append({'part':name,'area_mm2':f.Area})
            # Sample curved edges, to obtain a representative support polygon.
            for edge in f.Edges:
                points.extend([(v.x,v.y) for v in edge.discretize(Number=24)])
def cross(o,a,b): return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
def hull(points):
    points=sorted(set(points)); lower=[]; upper=[]
    for p in points:
        while len(lower)>=2 and cross(lower[-2],lower[-1],p)<=0: lower.pop()
        lower.append(p)
    for p in reversed(points):
        while len(upper)>=2 and cross(upper[-2],upper[-1],p)<=0: upper.pop()
        upper.append(p)
    return lower[:-1]+upper[:-1]
polygon=hull(points)
previous=json.loads((root/'seated-signature-audit.json').read_text())['stability_estimate']
mass=0; weighted=V(0,0,0)
for o in parts:
    m=previous['electronics_mass_assumptions_g'].get(o.Name,o.Shape.Volume*.00124)
    mass+=m; weighted+=o.Shape.Solids[0].CenterOfMass*m
com=weighted/mass
margin=min(cross(p,polygon[(i+1)%len(polygon)],(com.x,com.y))/math.dist(p,polygon[(i+1)%len(polygon)]) for i,p in enumerate(polygon))
report['static_estimate']={'com_xyz_mm':[com.x,com.y,com.z],'margin_mm':margin,'mass_assumptions':'Same analyst assumptions as seated-signature-audit.json; not actual measured mass','support_polygon_xy_mm':polygon}
(root/'soft-limbs-color-audit.json').write_text(json.dumps(report,indent=2))
assert all(v['valid'] and v['solids']==1 for v in report['parts'].values()),'Invalid or disconnected shape'
assert all(v['display_overlay'] for v in report['overlaps']),'Unexpected physical overlap'
assert set(x['part'] for x in report['table_contacts'])==set(limbs),'Missing support'
assert margin>0,'COM outside support polygon'
assert all(report['parts'][n]['bounds'][2]>=-1e-5 for n in limbs),'Below table'
doc.recompute(); Gui.activateWorkbench('PartWorkbench'); Gui.updateGui()
doc.saveAs(str(root/'BMO_SOFT_LIMBS_COLOR_CONCEPT.FCStd'))
print(json.dumps({'parts':len(parts),'pairs_checked':len(parts)*(len(parts)-1)//2,'overlaps':report['overlaps'],'contacts':report['table_contacts'],'static_margin_mm':margin,'colors':colors},indent=2))
