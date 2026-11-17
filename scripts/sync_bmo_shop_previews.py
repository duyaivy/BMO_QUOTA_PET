"""Publish final CAD previews and matching shop files to the existing folders."""
import json
import shutil
from pathlib import Path

root=Path(__file__).resolve().parents[1]/'cad/print_shop'
current=root/'simple_back'
previews=current/'preview'
images=[
 ('01-assembly','Lắp hoàn chỉnh, nút trang trí có màu'),
 ('02-front','Mặt trước'),
 ('03-side-BMO','Cạnh BMO, tay đã gia cố'),
 ('04-back-switch','Mặt ngoài nắp và công tắc'),
 ('05-exploded','Tách nắp và các nút; linh kiện chỉ để tham chiếu'),
 ('06-section','Mặt cắt minh hoạ vị trí linh kiện'),
 ('07-seven-print-parts','Bảy vùng/chi tiết nhựa gửi in'),
 ('08-inside-back-cover','Mặt trong nắp, đã bỏ thanh và khay giữ mạch/pin'),
]
completed=json.loads((previews/'export-complete.json').read_text())
assert completed['images']==[n+'.png' for n,_ in images]
for name,_ in images:
    assert (previews/(name+'.png')).stat().st_size>10000,name
cards='\n'.join(f'<figure><a href="preview/{n}.png"><img src="preview/{n}.png" alt="{caption}"></a><figcaption>{caption}</figcaption></figure>' for n,caption in images)
html='''<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>BMO — bản nắp lưng đơn giản, 7 chi tiết/vùng màu</title>
<style>body{font:16px/1.6 system-ui;background:#eef7f4;color:#153e38;max-width:1100px;margin:auto;padding:28px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px}figure{margin:0;background:white;padding:12px;border-radius:12px}img{width:100%;display:block}a{color:#075b4b}</style>
<h1>BMO — nắp lưng đơn giản, nút trang trí có màu</h1>
<p>Ảnh xuất từ BMO_SIMPLE_BACK.FCStd. Đã bỏ thanh/khay giữ ESP32 và pin, bỏ bệ dưới; tay và khớp chân đã gia cố. Vị trí linh kiện giữ nguyên. Nắp có bốn lỗ vít thông, thân có lỗ mồi nhận vít.</p>
<p>Bộ in gồm 7 STL: thân và nắp mint, D-pad vàng, nút thật đỏ, tam giác cyan, nút trang trí xanh lam và xanh lá. STL không lưu màu; gán màu theo tên file và ảnh. Linh kiện điện tử trong ảnh không phải chi tiết in.</p>
<p>Chưa kiểm chứng lắp linh kiện thật, độ bền, cân bằng hoặc bắt vít thực tế. Xem README_VI.txt trong bộ gửi thợ để biết cách nhập các vùng màu cùng tọa độ.</p>
<div class="grid">'''+cards+'</div></html>'
(current/'PREVIEW.html').write_text(html)
for dest in (root,root/'SEND_TO_PRINT'):
    target=dest/'preview'
    target.mkdir(exist_ok=True)
    stale=target/'07-four-print-parts.png'
    if stale.exists():
        stale.unlink()
    for name,_ in images:
        shutil.copy2(previews/(name+'.png'),target/(name+'.png'))
    (dest/'PREVIEW.html').write_text(html)
send=root/'SEND_TO_PRINT'
for file in current.glob('*.stl'):
    shutil.copy2(file,send/file.name)
for name in ('README_VI.txt','mesh-validation.json','rear-screw-audit.json','revision-report.json'):
    shutil.copy2(current/name,send/name)
shutil.copy2(current/'mesh-validation.json',send/'MESH_CHECKS.json')
# Preserve the earlier three direct image paths with the same current geometry.
for src,dst in [('01-assembly.png','01-assembly.png'),('08-inside-back-cover.png','02-inside-back-cover.png'),('06-section.png','03-component-layout.png')]:
    shutil.copy2(previews/src,current/dst)
print('Updated 8 views in all 3 preview folders and both legacy gallery pages')
