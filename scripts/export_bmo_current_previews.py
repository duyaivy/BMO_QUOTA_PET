"""FreeCAD MCP: render the final shop CAD, one frame per GUI event cycle."""
import json
from pathlib import Path
import Part
from PySide import QtCore
from FreeCAD import Vector as V

out = Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET/cad/print_shop/simple_back')
dest = out / 'preview'
dest.mkdir(exist_ok=True)
source = App.openDocument(str(out / 'BMO_SIMPLE_BACK.FCStd'))
parts = list(json.loads((out/'revision-report.json').read_text())['parts'])
hardware = list(json.loads((out/'revision-report.json').read_text())['component_checks'])
snapshots = {n: (source.getObject(n).Shape.copy(), source.getObject(n).ViewObject.ShapeColor) for n in parts+hardware}
jobs = [
    ('01-assembly', parts+hardware, -35, 78, 'normal'),
    ('02-front', parts+hardware, 0, 90, 'normal'),
    ('03-side-BMO', parts+hardware, -90, 90, 'normal'),
    ('04-back-switch', parts+hardware, 180, 90, 'normal'),
    ('05-exploded', parts+hardware, -35, 78, 'exploded'),
    ('06-section', parts+hardware, -35, 78, 'section'),
    ('07-seven-print-parts', parts, -35, 65, 'parts'),
    ('08-inside-back-cover', ['BMO_BACK_COVER'], -35, 78, 'normal'),
]

def run_job(index=0):
    if index == len(jobs):
        (dest/'export-complete.json').write_text(json.dumps({'source':'BMO_SIMPLE_BACK.FCStd','images':[j[0]+'.png' for j in jobs]},indent=2))
        return
    title, selected, yaw, pitch, mode = jobs[index]
    doc = App.newDocument('BMO_Current_Preview')
    for key in selected:
        shape, color = snapshots[key]
        shape = shape.copy()
        if mode == 'section' and key in ('BMO_MAIN_BODY','BMO_BACK_COVER'):
            shape = shape.cut(Part.makeBox(100,150,150,V(-100,-50,-10)))
        if mode == 'exploded':
            if key in ('BMO_BACK_COVER','Power_Switch_PLACEHOLDER'):
                shape.translate(V(0,38,0))
            elif key.startswith('BMO_DECOR') or key in ('BMO_BUTTON_RED','BMO_DPAD_YELLOW'):
                shape.translate(V(0,-18,0))
        if mode == 'parts':
            if key == 'BMO_MAIN_BODY':
                shape.translate(V(-45,0,0))
            elif key == 'BMO_BACK_COVER':
                shape.translate(V(45,0,0))
            else:
                position = parts.index(key)-2
                b=shape.BoundBox
                shape.translate(V(-35+position*18-(b.XMin+b.XMax)/2,-45-(b.YMin+b.YMax)/2,-b.ZMin))
        obj = doc.addObject('Part::Feature',key)
        obj.Shape=shape
        obj.ViewObject.ShapeColor=color
    doc.recompute()
    App.setActiveDocument(doc.Name)
    view=Gui.getDocument(doc.Name).activeView()
    view.setCameraType('Orthographic')
    view.setCameraOrientation(App.Rotation(V(0,0,1),yaw).multiply(App.Rotation(V(1,0,0),pitch)).Q)
    view.fitAll()
    Gui.updateGui()
    def save_and_advance():
        view.fitAll()
        view.redraw()
        view.saveImage(str(dest/(title+'.png')),1400,1400,'White')
        App.closeDocument(doc.Name)
        QtCore.QTimer.singleShot(250,lambda:run_job(index+1))
    QtCore.QTimer.singleShot(1600,save_and_advance)

run_job()
print('Scheduled eight final-CAD previews; completion recorded in preview/export-complete.json')
