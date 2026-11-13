"""Reopen the saved FreeCAD assembly and compare the audited placements."""
import json
from pathlib import Path
root=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET/cad/hardware_review')
path=root/'BMO_HARDWARE_INTEGRATED.FCStd'
for d in list(App.listDocuments().values()):
    if d.FileName==str(path): App.closeDocument(d.Name)
doc=App.openDocument(str(path))
audit=json.loads((root/'integration-audit.json').read_text())
for name,expected in audit['parts'].items():
    o=doc.getObject(name)
    assert o and o.Shape.isValid(),name+' missing or invalid'
    b=o.Shape.BoundBox; actual=[b.XMin,b.YMin,b.ZMin,b.XMax,b.YMax,b.ZMax]
    assert all(abs(a-e)<1e-4 for a,e in zip(actual,expected['bounds'])),name+' placement changed after render'
assert doc.getObject('Battery_LiPo_503040') is not None
assert not doc.getObject('Battery_LiPo_503040').ViewObject.Visibility
boost=doc.getObject('Power_Boost_MT3608')
if 'Pad_Locations_PLACEHOLDER' not in boost.PropertiesList:
    boost.addProperty('App::PropertyString','Pad_Locations_PLACEHOLDER','Review')
by=audit['selected_layout']['boost_y']+1
boost.Pad_Locations_PLACEHOLDER=json.dumps({'IN+':[17.2,by+15.2,12.6],'IN-':[17.2,by+2,12.6],'OUT+':[-17.2,by+2,12.6],'OUT-':[-17.2,by+15.2,12.6],'warning':'Geometric placeholders, not verified physical pin mapping'})
doc.save()
result={'saved_cad_reopened':True,'audited_parts_verified':len(audit['parts']),'placements_match':True,'fallback_present_hidden':True}
(root/'saved-file-verification.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result))
