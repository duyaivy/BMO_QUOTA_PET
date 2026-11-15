"""FreeCAD MCP sequential audit/export after the elastic placeholder correction."""
from pathlib import Path
scripts=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET/scripts')
for name in ('update_bmo_final_band.py','recheck_bmo_final_service.py','reserve_bmo_final_wiring.py','export_bmo_final.py'):
    path=scripts/name
    exec(compile(path.read_text(),str(path),'exec'))
