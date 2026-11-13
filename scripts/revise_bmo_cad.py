"""FreeCAD MCP revision; provisional fit study, never a print release.

Original file is preserved. Coordinates and dimensions are in millimetres.
"""
import Part
import math
import json
import itertools
from pathlib import Path
from FreeCAD import Vector as V

ROOT = Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET')
OUT = ROOT / 'cad'
OUT.mkdir(exist_ok=True)
for opened in list(App.listDocuments().values()):
    if opened.FileName == str(ROOT / 'BMO_QUOTA_PET.FCStd'):
        App.closeDocument(opened.Name)
doc = App.openDocument(str(ROOT / 'BMO_QUOTA_PET.FCStd'))
doc.Label = 'BMO revised fit study — UNVERIFIED HARDWARE'

def box(w,d,h,x,y,z):
    return Part.makeBox(w,d,h,V(x,y,z))

def cyl(r,h,p,d=(0,1,0)):
    return Part.makeCylinder(r,h,V(*p),V(*d))

def rounded(w,d,h,r,x,y,z):
    s = box(w-2*r,d,h,x+r,y,z).fuse(box(w,d,h-2*r,x,y,z+r))
    for xx in (x+r,x+w-r):
        for zz in (z+r,z+h-r):
            s = s.fuse(cyl(r,d,(xx,y,zz)))
    return s.removeSplitter()

def setshape(name,shape):
    o = doc.getObject(name)
    o.Shape = shape.removeSplitter()
    return o

# 40 mm nominal power board + 1.5 mm side clearances + 2 x 2.5 mm walls.
# This is a selected envelope, not a globally optimized minimum.
outer = rounded(48,30,68,4,-24,-15,0)
cavity = rounded(43,30,63,2,-21.5,-12.25,2.5)
shell = outer.cut(cavity)
shell = shell.cut(box(60,10,80,-30,12,-5))
shell = shell.cut(rounded(29,3,19.5,2.5,-14.5,-16,41))
shell = shell.cut(rounded(24.2,7,14.5,.8,-12.1,-16,43.5))
for name in ('OLED_096_PCB','OLED_096_Glass','OLED_096_ActiveArea','OLED_096_Header'):
    s=doc.getObject(name).Shape.copy(); s.translate(V(0,0,4)); setshape(name,s)

# Separate sliding caps, contiguous flange, 0.3–0.4 mm radial clearance.
for cx,cz,red in [(-10.5,20,False),(9.5,13.5,True)]:
    if red:
        hole = cyl(3.7,5,(cx,-16,cz))
        cap = cyl(3.4,4.7,(cx,-16.5,cz)).fuse(cyl(4.5,.8,(cx,-12.6,cz)))
        # Flange recess moves retaining surface inside, with 0.2 mm travel.
        recess = cyl(4.8,.8,(cx,-12.8,cz))
        setshape('BMO_Action_Button_Red',cap)
    else:
        hole = box(4.2,5,11.8,cx-2.1,-16,cz-5.9).fuse(box(11.8,5,4.2,cx-5.9,-16,cz-2.1))
        cap = box(3.4,4.7,11,cx-1.7,-16.5,cz-5.5).fuse(box(11,4.7,3.4,cx-5.5,-16.5,cz-1.7))
        cap = cap.fuse(box(13,.8,13,cx-6.5,-12.6,cz-6.5))
        recess = box(13.6,.8,13.6,cx-6.8,-12.8,cz-6.8)
        setshape('BMO_DPad_Yellow',cap)
    shell = shell.cut(hole).cut(recess)
    # Short actuator is an assumption pending actual switch height measurement.
    sw = box(6,3.5,6,cx-3,-10.5,cz-3).fuse(cyl(1.7,1.2,(cx,-10.5,cz),(0,-1,0)))
    for dx in (-2.5,2.5):
        sw=sw.fuse(cyl(.5,8,(cx+dx,-8.5,cz-3),(0,0,-1)))
    setshape('Tactile_Switch_B_Red' if red else 'Tactile_Switch_A_DPad',sw)
    # Two side rails and a rear bridge retain the switch body without clamping stem.
    for dx in (-4.0,3.2):
        shell=shell.fuse(box(.8,4.8,11.3,cx+dx,-11.5,cz-3.5))
    shell=shell.fuse(box(8,.4,11.3,cx-4,-6.95,cz-3.5))
    shell=shell.fuse(box(8,5.95,.8,cx-4,-12.5,cz+7))

# Integrate fixed decorative details into shell so they are attached solids.
for name in ('BMO_Triangle_Button','BMO_Small_Button_Upper','BMO_Small_Button_Mid','BMO_Disk_Drive_Bar'):
    o=doc.getObject(name)
    if name in ('BMO_Small_Button_Upper','BMO_Disk_Drive_Bar'):
        s=o.Shape.copy(); s.translate(V(0,0,4)); o.Shape=s
    shell=shell.fuse(o.Shape)
    doc.removeObject(name)

# Rear screw bosses, axes normal to removable lid; M2 pilot assumptions.
lid=rounded(48,2.75,68,4,-24,12.25,0)
for x in (-20,20):
    for z in (23,62):
        boss=cyl(2.5,8,(x,4,z)).cut(cyl(.85,8.1,(x,4,z)))
        shell=shell.fuse(boss)
        lid=lid.cut(cyl(1.15,4,(x,12,z)))
        lid=lid.cut(cyl(2.1,1.0,(x,14,z)))
lid=lid.cut(box(10,5,4,-5,11.5,6))

# Battery shelf connects to the side walls; use removable foam/strap in prototype.
shell=shell.fuse(box(43,6,1.2,-21.5,-6.5,7.3))
# OLED side shelves connect to the inner walls and touch PCB side edges.
for x in (-21.5,13.5):
    shell=shell.fuse(box(8,2,1.2,x,-10.8,37.5))
# Board seating ledges: side access remains open for soldered wires.
shell=shell.fuse(box(43,2.2,1,-21.5,4.3,19))
shell=shell.fuse(box(43,2.2,1,-21.5,4.3,2.5))

def tube(points,r):
    curve=Part.BSplineCurve()
    curve.interpolate([V(*p) for p in points])
    path=Part.Wire(curve.toShape())
    tangent=curve.tangent(curve.FirstParameter)[0]
    circle=Part.Wire([Part.makeCircle(r,V(*points[0]),tangent)])
    return path.makePipeShell([circle],True,False)

# Slender curved arms: outward shoulder, side arc, flattened hand on Z=0.
for side,suffix in [(-1,'Left'),(1,'Right')]:
    sx=lambda n: side*n
    pts=[(sx(24.8),0,22),(sx(27),-1,17),(sx(27.2),-3,8),(sx(26.5),-7,2.2),(sx(26.5),-10,1.8)]
    arm=tube(pts,1.5)
    arm=arm.fuse(Part.makeSphere(1.5,V(*pts[0])))
    palm=rounded(4.8,4,2,.8,sx(26.5)-2.4,-13,0)
    arm=arm.fuse(palm)
    for dx in (-1.4,0,1.4):
        arm=arm.fuse(cyl(.65,1.5,(sx(26.5)+dx,-12.8,.75),(0,-1,0)))
    arm=arm.fuse(cyl(1.4,4,(sx(21.5),0,22),(side,0,0)))
    shell=shell.cut(cyl(1.65,5,(sx(21),0,22),(side,0,0)))
    setshape('BMO_Sitting_Arm_'+suffix,arm)
    # Capsule-like upright feet, thinner in depth than the original round tubes.
    cx=side*8
    leg=cyl(2,9,(cx,-14,4.3),(0,-1,0))
    foot=rounded(5.8,3.8,10,2.8,cx-2.9,-25,0)
    leg=leg.fuse(foot).fuse(cyl(1.8,3,(cx,-14,4.3)))
    shell=shell.cut(cyl(2.05,5,(cx,-16,4.3)))
    setshape('BMO_Sitting_Leg_'+suffix,leg)

# Logos follow the widened sides; fuse to enclosure for physical continuity.
for name,dx in [('BMO_Logo_Left',-1.8),('BMO_Logo_Right',1.8)]:
    s=doc.getObject(name).Shape.copy(); s.translate(V(dx,0,0))
    shell=shell.fuse(s)
    doc.removeObject(name)

# Correct requested nominal 15 x 40 power PCB; populated components remain estimates.
pwr=box(40,1.6,15,-20,4.5,3.5)
pwr=pwr.fuse(box(9,7.5,3.2,-4.5,6.1,6.5))
pwr=pwr.fuse(box(6.5,3,6.5,-14,1.5,7.5))
pwr=pwr.fuse(box(4,1.2,4,8,3.3,8.5))
setshape('Power_Charger_Module',pwr)
setshape('BMO_Front_Shell',shell)
setshape('BMO_Back_Cover',lid)
section=shell.fuse(lid).cut(box(100,100,150,-100,-50,-30))
setshape('BMO_Enclosure_SectionCut',section)

for o in doc.Objects:
    if o.TypeId=='Part::Feature':
        o.ViewObject.Visibility='SectionCut' not in o.Name
        o.ViewObject.DisplayMode='Flat Lines' if 'OLED' in o.Name else 'Flat Lines'
        if not hasattr(o,'VerificationStatus'):
            o.addProperty('App::PropertyString','VerificationStatus','Design review')
        o.VerificationStatus='Concept only; physical dimensions and print fit unverified'
doc.recompute()

# Exhaustive leaf-object check. Cosmetic display/glass intersection is explicitly classified.
objects=[o for o in doc.Objects if o.TypeId=='Part::Feature' and 'SectionCut' not in o.Name]
report={'units':'mm','status':'PROVISIONAL — NOT PRINT RELEASE','shell_mm':[48,30,68], 'objects':{},'overlaps':[],'clearances':[]}
for o in objects:
    b=o.Shape.BoundBox
    report['objects'][o.Name]={'valid':o.Shape.isValid(),'solids':len(o.Shape.Solids),'bounds':[b.XMin,b.YMin,b.ZMin,b.XMax,b.YMax,b.ZMax]}
for a,b in itertools.combinations(objects,2):
    vol=a.Shape.common(b.Shape).Volume
    if vol>.001:
        report['overlaps'].append({'a':a.Name,'b':b.Name,'volume_mm3':round(vol,4), 'classification':'display overlay' if {a.Name,b.Name}=={'OLED_096_Glass','OLED_096_ActiveArea'} else 'REVIEW REQUIRED'})
    if a.Name=='LiPo_Battery_503040' or b.Name=='LiPo_Battery_503040':
        report['clearances'].append({'a':a.Name,'b':b.Name,'distance_mm':a.Shape.distToShape(b.Shape)[0]})
(OUT/'revised-audit.json').write_text(json.dumps(report,indent=2))
assert all(v['valid'] and v['solids']==1 for v in report['objects'].values()), 'Invalid or disconnected part'
assert not [p for p in report['overlaps'] if p['classification']=='REVIEW REQUIRED'], 'Unresolved overlap'
for name in ('BMO_Sitting_Leg_Left','BMO_Sitting_Leg_Right','BMO_Sitting_Arm_Left','BMO_Sitting_Arm_Right'):
    assert doc.getObject(name).Shape.BoundBox.ZMin >= -1e-5, 'Part below table plane'
print(json.dumps(report,indent=2))

view=Gui.activeDocument().activeView()
view.setAnimationEnabled(False) if hasattr(view,'setAnimationEnabled') else None
view.setCameraType('Orthographic')
view.setCameraOrientation(0,0,0,1) if False else None
# Explicit orientation avoids animated viewFront capturing an intermediate frame.
view.setCameraOrientation(App.Rotation(V(1,0,0),90).Q)
view.fitAll()
Gui.updateGui()
view.saveImage(str(OUT/'revised-front.png'),1400,1400,'White')
view.setCameraOrientation(App.Rotation(V(0,0,1),25).multiply(App.Rotation(V(1,0,0),70)).Q)
view.fitAll(); Gui.updateGui()
view.saveImage(str(OUT/'revised-isometric.png'),1400,1400,'White')
doc.getObject('BMO_Front_Shell').ViewObject.Visibility=False
doc.getObject('BMO_Back_Cover').ViewObject.Visibility=False
doc.getObject('BMO_Enclosure_SectionCut').ViewObject.Visibility=True
Gui.updateGui()
view.saveImage(str(OUT/'revised-section.png'),1400,1400,'White')
doc.getObject('BMO_Front_Shell').ViewObject.Visibility=True
doc.getObject('BMO_Back_Cover').ViewObject.Visibility=True
doc.getObject('BMO_Enclosure_SectionCut').ViewObject.Visibility=False
doc.recompute()
doc.saveAs(str(OUT/'BMO_REVISED_CONCEPT.FCStd'))
print('Saved revised concept and previews; no STL exported.')
