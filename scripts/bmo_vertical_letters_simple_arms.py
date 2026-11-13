"""FreeCAD MCP variant: vertically stacked side letters, simple rounded arms."""
import Part
import Draft
import json
import itertools
import math
from pathlib import Path
from FreeCAD import Vector as V

root=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET/cad')
source=root/'BMO_SOFT_LIMBS_COLOR_CONCEPT.FCStd'
for opened in list(App.listDocuments().values()):
    if opened.FileName==str(source): App.closeDocument(opened.Name)
doc=App.openDocument(str(source))
doc.Label='BMO DUT — vertical lettering / simple arms from O'
shell=doc.getObject('BMO_Front_Shell').Shape.copy()
limbs=['BMO_Sitting_Leg_Left','BMO_Sitting_Leg_Right','BMO_Sitting_Arm_Left','BMO_Sitting_Arm_Right']

# Remove the previous horizontal lettering outside the nominal side walls.
for x in (-30,24):
    shell=shell.cut(Part.makeBox(6,27,15,V(x,-13,32)))
# Restore the old shoulder recess to a plain side wall before cutting new sockets.
for x in (-24,21.5):
    shell=shell.fuse(Part.makeBox(2.5,8,10,V(x,-4,24)))

mirror=App.Matrix(); mirror.A11=-1
centers=[V(-24.4,0,29),V(-28,0,26),V(-29.8,3,8),V(-29.8,8,1)]
curve=Part.BezierCurve(); curve.setPoles(centers)
path=Part.Wire(curve.toShape())
direction=centers[1]-centers[0]
def pipe(radius):
    wire=Part.Wire([Part.makeCircle(radius,centers[0],direction)])
    return path.makePipeShell([wire],True,False)
arm=pipe(1.6)
# Uniform thickness and a rounded endpoint; no mitten, fingers or palm disk.
arm=arm.fuse(Part.makeSphere(1.6,centers[0])).fuse(Part.makeSphere(1.6,centers[-1]))
arm=arm.fuse(Part.makeCylinder(1.4,3.4,V(-21.5,0,29),V(-1,0,0)))
arm=arm.common(Part.makeBox(200,200,200,V(-100,-100,0))).removeSplitter()
clearance=pipe(1.85).fuse(Part.makeSphere(1.85,centers[0]))
for side,suffix in [(-1,'Left'),(1,'Right')]:
    shape=arm if side==-1 else arm.transformGeometry(mirror)
    cut=clearance if side==-1 else clearance.transformGeometry(mirror)
    shell=shell.cut(cut)
    # Preserve the shaft clearance all the way through the side wall.
    shell=shell.cut(Part.makeCylinder(1.65,5,V(side*21,0,29),V(side,0,0)))
    obj=doc.getObject('BMO_Sitting_Arm_'+suffix); obj.Shape=shape
    obj.ViewObject.ShapeColor=(.35,.76,.72)
    obj.ViewObject.DisplayMode='Shaded'
    obj.ViewObject.Deviation=.02; obj.ViewObject.AngularDeflection=6

group=doc.addObject('App::DocumentObjectGroup','Vertical_Side_Lettering')
letters=[]
font='/System/Library/Fonts/Supplemental/Arial Bold.ttf'
# B-M-O reads top to bottom. O is centered on the existing shoulder axis Z=29.
# D-U-T also reads top to bottom, ending above the opposite shoulder.
for side,word,baselines in [(-1,'BMO',[50,37,24]),(1,'DUT',[59,46,33])]:
    for letter,z in zip(word,baselines):
        temp=Draft.make_shapestring(String=letter,FontFile=font,Size=10,Tracking=0)
        doc.recompute()
        s=temp.Shape.copy(); b=s.BoundBox
        # Normalize the actual outline height, including font overshoot.
        factor=10/b.ZLength if b.ZLength>1e-5 else 10/b.YLength
        matrix=App.Matrix(); matrix.A11=factor; matrix.A22=factor; matrix.A33=factor
        s=s.transformGeometry(matrix); b=s.BoundBox
        s.translate(V(-(b.XMin+b.XMax)/2,-b.YMin,0))
        rotation=App.Rotation(V(0,side,0),V(0,0,1),V(side,0,0),'ZXY')
        s.Placement=App.Placement(V(side*24,0,z),rotation).multiply(s.Placement)
        glyph=s.extrude(V(side*.65,0,0)).removeSplitter()
        o=doc.addObject('Part::Feature',word+'_Letter_'+letter)
        o.Shape=glyph; o.ViewObject.ShapeColor=(.025,.035,.035)
        o.ViewObject.DisplayMode='Flat Lines'; group.addObject(o)
        o.addProperty('App::PropertyString','AssemblyNote','Design review')
        o.AssemblyNote='Separate black letter, flush glue contact on side; adhesion and print detail unverified'
        letters.append({'part':o.Name,'text':letter,'side':'left' if side==-1 else 'right','baseline_z_mm':z,'height_mm':10,'projection_mm':.65})
        doc.removeObject(temp.Name)

shell=shell.removeSplitter()
doc.getObject('BMO_Front_Shell').Shape=shell
lid=doc.getObject('BMO_Back_Cover').Shape
doc.getObject('BMO_Enclosure_SectionCut').Shape=shell.fuse(lid).cut(Part.makeBox(100,100,150,V(-100,-50,-30)))
parts=[o for o in doc.Objects if o.TypeId=='Part::Feature' and 'SectionCut' not in o.Name]
report={'status':'CONCEPT ONLY; not a print release','lettering':letters,'arm_diameter_mm':3.2,'root_center_mm':[-24.4,0,29],'parts':{},'overlaps':[],'contacts':[]}
for o in parts:
    b=o.Shape.BoundBox
    report['parts'][o.Name]={'valid':o.Shape.isValid(),'solids':len(o.Shape.Solids),'bounds':[b.XMin,b.YMin,b.ZMin,b.XMax,b.YMax,b.ZMax]}
for a,b in itertools.combinations(parts,2):
    vol=a.Shape.common(b.Shape).Volume
    if vol>.001:
        report['overlaps'].append({'a':a.Name,'b':b.Name,'volume_mm3':vol,'display_overlay':{a.Name,b.Name}=={'OLED_096_Glass','OLED_096_ActiveArea'}})
# The shoulder must pass through the O counter, without cutting its strokes.
o=doc.getObject('BMO_Letter_O')
gauge=Part.makeCylinder(1.6,8,V(-21,0,29),V(-1,0,0))
report['o_counter_gauge_overlap_mm3']=o.Shape.common(gauge).Volume
assert report['o_counter_gauge_overlap_mm3']<.001,'Shoulder obstructed by O'
points=[]
for name in limbs:
    for f in doc.getObject(name).Shape.Faces:
        b=f.BoundBox
        if abs(b.ZMin)<1e-5 and abs(b.ZMax)<1e-5 and f.Area>.01:
            report['contacts'].append({'part':name,'area_mm2':f.Area})
            for e in f.Edges:
                points.extend([(p.x,p.y) for p in e.discretize(Number=24)])
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
    assert o.Shape.isValid() and len(o.Shape.Solids)==1,o.Name+' invalid/disconnected'
    m=masses.get(o.Name,o.Shape.Volume*.00124)
    mass+=m; weighted+=o.Shape.Solids[0].CenterOfMass*m
com=weighted/mass
margin=min(cross(p,polygon[(i+1)%len(polygon)],(com.x,com.y))/math.dist(p,polygon[(i+1)%len(polygon)]) for i,p in enumerate(polygon))
report['static_estimate']={'com_xyz_mm':[com.x,com.y,com.z],'margin_mm':margin,'mass_assumptions':'Unmeasured masses inherited from seated-signature-audit.json; rigid, level table only'}
(root/'vertical-letters-simple-arms-audit.json').write_text(json.dumps(report,indent=2))
assert all(p['display_overlay'] for p in report['overlaps']),'Physical overlap'
assert set(p['part'] for p in report['contacts'])==set(limbs),'Missing support'
assert all(report['parts'][n]['bounds'][2]>=-1e-5 for n in limbs),'Below table'
assert margin>0,'Unstable static estimate'
doc.recompute(); Gui.activateWorkbench('PartWorkbench'); Gui.updateGui()
doc.saveAs(str(root/'BMO_VERTICAL_LETTERS_SIMPLE_ARMS.FCStd'))
print(json.dumps({'parts':len(parts),'pairs_checked':len(parts)*(len(parts)-1)//2,'overlaps':report['overlaps'],'o_gauge_overlap':report['o_counter_gauge_overlap_mm3'],'contacts':report['contacts'],'static_margin_mm':margin},indent=2))
