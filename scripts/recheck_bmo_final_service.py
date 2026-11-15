"""Recheck revised paths only; the audit asserts unchanged part bounds/volumes."""
from pathlib import Path
SERVICE_LABELS={'01_lid_battery_esp'}
SERVICE_MOVING_OVERRIDE={'01_lid_battery_esp':{'Battery_Soft_Retaining_Band'}}
path=Path('/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET/scripts/verify_bmo_final_assembly.py')
exec(compile(path.read_text(),str(path),'exec'))
