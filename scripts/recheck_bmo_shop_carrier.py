"""FreeCAD MCP focused path correction, no CAD geometry changes."""
from pathlib import Path
SERVICE_STAGE_FILTER={'dpad_FR4_switch'}
path=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET/scripts/validate_bmo_shop_service.py')
exec(compile(path.read_text(),str(path),'exec'))
