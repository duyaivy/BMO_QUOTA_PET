"""FreeCAD MCP concept: underside seated legs, smooth arms, duyaivy signature.

Separate output; all dimensions mm. Stability calculation is a mass-model
estimate, not a physical load or tip test.
"""
import Part
import Draft
import json
import itertools
import math
from pathlib import Path
from FreeCAD import Vector as V

root=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET/cad')
for opened in list(App.listDocuments().values()):
    if opened.FileName==str(root/'BMO_DUT_CAT_EARS_CONCEPT.FCStd'):
        App.closeDocument(opened.Name)
doc=App.openDocument(str(root/'BMO_DUT_CAT_EARS_CONCEPT.FCStd'))
doc.Label='BMO DUT — seated / smooth arms / duyaivy'
rise=7.0
limbs=['BMO_Sitting_Leg_Left','BMO_Sitting_Leg_Right','BMO_Sitting_Arm_Left','BMO_Sitting_Arm_Right']
# Translate every physical item together so the electronics layout is preserved.
for o in doc.Objects:
    if o.TypeId=='Part::Feature' and o.Name not in limbs and 'SectionCut' not in o.Name:
        s=o.Shape.copy(); s.translate(V(0,0,rise)); o.Shape=s
shell=doc.getObject('BMO_Front_Shell').Shape.copy()
lid=doc.getObject('BMO_Back_Cover').Shape.copy()
def cyl(r,h,p,d=(0,0,1)):
    return Part.makeCylinder(r,h,V(*p),V(*d))
def above_table(s):
    return s.common(Part.makeBox(200,200,200,V(-100,-100,0))).removeSplitter()
def ellipsoid(rx,ry,rz,center):
    m=App.Matrix(); m.A11=rx; m.A22=ry; m.A33=rz
    s=Part.makeSphere(1).transformGeometry(m)
    s.translate(V(*center)); return s
def rounded_plate(w,d,h,r,x,y,z):
    s=Part.makeBox(w-2*r,d,h,V(x+r,y,z)).fuse(Part.makeBox(w,d,h-2*r,V(x,y,z+r)))
    for xx in (x+r,x+w-r):
        for zz in (z+r,z+h-r):
            s=s.fuse(cyl(r,d,(xx,y,zz),(0,1,0)))
    return s.removeSplitter()

contacts=[]
for side,suffix in [(-1,'Left'),(1,'Right')]:
    # Close obsolete front leg ports only within the front wall thickness.
    shell=shell.fuse(cyl(2.10,2.75,(side*8,-15,4.3+rise),(0,1,0)))
    # Seat the hips under the body; shoulders bear on the bottom face at Z=7.
    cx=side*10
    hip=cyl(3,4,(cx,-7,3))
    peg=cyl(1.8,3.1,(cx,-7,6.9))
    thigh=cyl(2.7,16,(cx,-7,3),(0,-1,0))
    # Trim the rounded foot below the table for a genuinely flat sole.
    foot=rounded_plate(7,4.6,12,3.2,cx-3.5,-25,-1)
    leg=above_table(hip.fuse(peg).fuse(thigh).fuse(foot))
    shell=shell.cut(cyl(2.05,5,(cx,-7,6)))
    doc.getObject('BMO_Sitting_Leg_'+suffix).Shape=leg
    contacts.append({'name':'foot_'+suffix,'center_xy':[cx,-22.7]})

    # Cubic Bezier: continuous tangent and curvature, no interpolating spline wiggle.
    points=[V(side*24.8,0,29),V(side*28,1,22),V(side*31.5,4,9),V(side*32,7,2.2)]
    curve=Part.BezierCurve(); curve.setPoles(points)
    path=Part.Wire(curve.toShape())
    profile=Part.Wire([Part.makeCircle(1.8,points[0],points[1]-points[0])])
    arm=path.makePipeShell([profile],True,False)
    shoulder=Part.makeSphere(1.8,points[0])
    arm=arm.fuse(shoulder).fuse(cyl(1.4,3.5,(side*21.5,0,29),(side,0,0)))
    # Rounded palm with a flat underside and softly rounded fingertips.
    palm=ellipsoid(3.5,4.2,1.5,(side*32,8,1.2))
    for dx in (-1.5,0,1.5):
        finger=cyl(.7,2,(side*32+dx,4.8,.85),(0,-1,0))
        finger=finger.fuse(Part.makeSphere(.7,V(side*32+dx,2.8,.85)))
        palm=palm.fuse(finger)
    arm=above_table(arm.fuse(palm))
    shell=shell.cut(Part.makeSphere(1.95,points[0]))
    clearance_profile=Part.Wire([Part.makeCircle(2.05,points[0],points[1]-points[0])])
    shell=shell.cut(path.makePipeShell([clearance_profile],True,False))
    doc.getObject('BMO_Sitting_Arm_'+suffix).Shape=arm
    contacts.append({'name':'palm_'+suffix,'center_xy':[side*32,8]})

# Small recessed signature on the lower back, above and beside the USB opening.
font='/System/Library/Fonts/Supplemental/Arial Bold.ttf'
text=Draft.make_shapestring(String='duyaivy',FontFile=font,Size=2.5,Tracking=0)
doc.recompute()
s=text.Shape.copy(); b=s.BoundBox
s.translate(V(-(b.XMin+b.XMax)/2,-b.YMin,0))
rot=App.Rotation(V(-1,0,0),V(0,0,1),V(0,1,0),'ZXY')
s.Placement=App.Placement(V(0,0,0),rot).multiply(s.Placement)
s.translate(V(-10,15.05,20))
engraving=s.extrude(V(0,-.45,0))
assert lid.common(engraving).Volume>.01,'Signature must cut the lid'
lid=lid.cut(engraving).removeSplitter()
doc.removeObject(text.Name)
cover=doc.getObject('BMO_Back_Cover')
if 'Signature' not in cover.PropertiesList:
    cover.addProperty('App::PropertyString','Signature','Design review')
cover.Signature='duyaivy — 2.5 mm nominal height, recessed 0.4 mm'
cover.Shape=lid
doc.getObject('BMO_Front_Shell').Shape=shell.removeSplitter()
doc.getObject('BMO_Enclosure_SectionCut').Shape=shell.fuse(lid).cut(Part.makeBox(100,100,150,V(-100,-50,-30)))
parts=[o for o in doc.Objects if o.TypeId=='Part::Feature' and 'SectionCut' not in o.Name]
for o in parts:
    o.ViewObject.Visibility=True
    o.ViewObject.Deviation=.05
    o.ViewObject.AngularDeflection=10
    if o.Name in limbs:
        o.ViewObject.DisplayMode='Flat Lines'
    o.VerificationStatus='Concept: geometry checked; real assembly, strength and tip tests pending'
doc.getObject('BMO_Enclosure_SectionCut').ViewObject.Visibility=False
doc.recompute()

report={'status':'CONCEPT ONLY — static estimate, no physical stability test','body_bottom_z_mm':rise,'signature':cover.Signature,'parts':{},'overlaps':[],'table_contacts':[]}
for o in parts:
    b=o.Shape.BoundBox
    report['parts'][o.Name]={'valid':o.Shape.isValid(),'solids':len(o.Shape.Solids),'bounds':[b.XMin,b.YMin,b.ZMin,b.XMax,b.YMax,b.ZMax]}
for a,b in itertools.combinations(parts,2):
    volume=a.Shape.common(b.Shape).Volume
    if volume>.001:
        report['overlaps'].append({'a':a.Name,'b':b.Name,'volume_mm3':volume,'display_overlay':{a.Name,b.Name}=={'OLED_096_Glass','OLED_096_ActiveArea'}})

# Extract actual coplanar contact faces rather than inferring from bounding boxes.
contact_vertices=[]
for name in limbs:
    shape=doc.getObject(name).Shape
    for face in shape.Faces:
        bb=face.BoundBox
        if abs(bb.ZMin)<1e-5 and abs(bb.ZMax)<1e-5 and face.Area>.01:
            report['table_contacts'].append({'part':name,'area_mm2':face.Area,'center_xy':[face.CenterOfMass.x,face.CenterOfMass.y]})
            contact_vertices += [(v.Point.x,v.Point.y) for v in face.Vertexes]

def cross(o,a,b):
    return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
def hull(points):
    points=sorted(set(points)); lower=[]; upper=[]
    for p in points:
        while len(lower)>=2 and cross(lower[-2],lower[-1],p)<=0: lower.pop()
        lower.append(p)
    for p in reversed(points):
        while len(upper)>=2 and cross(upper[-2],upper[-1],p)<=0: upper.pop()
        upper.append(p)
    return lower[:-1]+upper[:-1]
polygon=hull(contact_vertices)
assert len(polygon)>=3,'Need a nondegenerate support polygon'
# Analyst assumptions in grams, used only for a static center-of-mass estimate.
electronics_masses={'OLED_096_PCB':3,'OLED_096_Glass':1.5,'OLED_096_ActiveArea':0,'OLED_096_Header':.5,'Tactile_Switch_A_DPad':.3,'Tactile_Switch_B_Red':.3,'LiPo_Battery_503040':12,'ESP32_CAM_AI_Thinker':10,'Power_Charger_Module':5}
weighted=V(0,0,0); mass=0
for o in parts:
    m=electronics_masses[o.Name] if o.Name in electronics_masses else o.Shape.Volume*.00124
    mass+=m; weighted+=o.Shape.Solids[0].CenterOfMass*m
com=weighted/mass
def margin(point):
    return min(cross(p,polygon[(i+1)%len(polygon)],point)/math.dist(p,polygon[(i+1)%len(polygon)]) for i,p in enumerate(polygon))
static_margin=margin((com.x,com.y))
# Check a body-centered range without assuming exact physical component masses.
sample_margins=[margin((x,y)) for x in (-5,0,5) for y in (-4,0,4)]
report['stability_estimate']={'support_polygon_xy_mm':polygon,'electronics_mass_assumptions_g':electronics_masses,'plastic_density_assumption_g_mm3':.00124,'estimated_mass_g':mass,'estimated_com_xyz_mm':[com.x,com.y,com.z],'com_projection_margin_mm':static_margin,'body_center_range_xy_mm':[[-5,5],[-4,4]],'min_sample_margin_mm':min(sample_margins),'limitation':'Rigid level surface only; no push, keyring pull, flex, print warp, actual mass or friction test.'}
(root/'seated-signature-audit.json').write_text(json.dumps(report,indent=2))
assert all(p['valid'] and p['solids']==1 for p in report['parts'].values()),'Invalid or disconnected part'
assert all(p['display_overlay'] for p in report['overlaps']),'Physical collision'
assert all(report['parts'][n]['bounds'][2]>=-1e-5 for n in limbs),'Below table'
assert set(x['part'] for x in report['table_contacts'])==set(limbs),'All four supports must contact table'
assert static_margin>0 and min(sample_margins)>0,'COM outside supports'
Gui.activateWorkbench('PartWorkbench'); Gui.updateGui()
doc.recompute()
doc.saveAs(str(root/'BMO_SEATED_DUYAIVY_CONCEPT.FCStd'))
print(json.dumps({'parts':len(parts),'pairs_checked':len(parts)*(len(parts)-1)//2,'overlaps':report['overlaps'],'contacts':report['table_contacts'],'stability':report['stability_estimate']},indent=2))
print('Saved seated concept. Render previews in a separate MCP call after scene update.')
