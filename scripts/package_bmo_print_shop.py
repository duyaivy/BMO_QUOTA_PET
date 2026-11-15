"""Package exactly four verified print files, previews and Vietnamese instructions."""
import json
import hashlib
import shutil
import zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'cad/print_shop'; SEND=OUT/'SEND_TO_PRINT'
mesh=json.loads((OUT/'mesh-validation.json').read_text())
fit=json.loads((OUT/'fit-validation.json').read_text())
service=json.loads((OUT/'service-validation.json').read_text())
saved=json.loads((OUT/'saved-file-verification.json').read_text())
assert len(mesh['parts'])==4 and saved['printed_part_count']==4 and saved['saved_cad_reopened']
assert len(service['stages'])==8 and not any(s['conflicts'] for s in service['stages'])
assert not [o for o in fit['overlaps'] if not o['expected']] and not fit['keepouts']
assert all(a['obstruction_mm']<1e-5 for a in saved['mount_axes'])
for part in mesh['parts']:
    r=part['saved_checks']
    assert r['watertight'] and r['winding_consistent'] and r['components']==1 and r['self_intersecting_faces']==0
    assert hashlib.sha256((ROOT/part['file']).read_bytes()).hexdigest()==part['sha256']

readme='''BMO QUOTA PET — BỘ 4 CHI TIẾT IN THỬ
Trạng thái: DESIGN_REVIEW_REQUIRED — chưa xác minh fit với toàn bộ linh kiện thật.

GỬI TIỆM IN
In mỗi STL một chiếc, đơn vị mm, scale 100%:
1. BMO_MAIN_BODY.stl     — xanh mint: thân, tay, chân, tai rỗng, trang trí, chữ liền thân.
2. BMO_BACK_COVER.stl    — xanh mint: nắp lưng, khay/giá đỡ, vị trí công tắc sau lưng.
3. BMO_DPAD_YELLOW.stl   — vàng: nút D-pad thật.
4. BMO_BUTTON_RED.stl    — đỏ: nút tròn thật.

Thân danh nghĩa 48 x 48 x 68 mm, chưa tính tay/chân/tai/nút. Hai chân và chữ BMO
đã phục hồi từ LIVE_STATE_BEFORE; chữ O đồng tâm gốc tay. Không tách tay/chân/tai
ra để in rời. Các chi tiết giả và chữ cùng màu thân; người dùng tự sơn nếu muốn.

Profile thử để tiệm đánh giá: nozzle 0.4 mm; layer 0.16–0.20 mm; 3–4 vách.
STL đã đặt trên Z=0 theo hướng in thử. Tiệm cần xem support trong slicer, đặc biệt
dưới tay/ngón, đáy thân, gân trong nắp và flange của hai cap. Giữ sạch mặt trượt,
lỗ tai và hốc OLED; không tự thay scale để sửa fit. Hai cap có hai trụ chặn nhỏ,
cần gỡ support nhẹ. Chưa có G-code hoặc profile máy in đã thử.

LẮP RÁP
Để chỉ có 4 chi tiết nhựa in, hai tactile dùng 2 miếng FR4/PCB đục lỗ dày 1.6 mm
và 4 vít M2 làm giá. Đây là vật tư lắp ráp bổ sung, không có STL in riêng.
Cách giữ switch/footprint/chân hàn phải đối chiếu switch thật; không thêm nút thật.

TRƯỚC KHI IN FULL ĐỂ LẮP
Cần đo pack 503048 cả bọc/PCM/JST, header ESP, OLED, boost/tụ, charger/công tắc và
chiều cao/hành trình tactile. Khe ngang cell–khay danh nghĩa 0.3 mm mỗi bên.
Nên in thử vùng nút/giá switch và thử bằng dummy pin trước; không ép pin thật vào
vỏ để bù sai số. Mesh kín không chứng minh kích thước thực hoặc độ bền đã đạt.

XEM PREVIEW
Mở PREVIEW.html bằng trình duyệt để xem ảnh assembly, mặt trước, cạnh BMO,
công tắc sau lưng, exploded, section và bộ 4 chi tiết in. Bấm ảnh để phóng lớn.
Muốn xoay 3D: mở BMO_PRINT_SHOP.FCStd bằng FreeCAD; hoặc kéo 4 STL vào slicer.
File CAD/STEP và bản preview CAD nằm tại cad/print_shop/ trong project gốc.
'''
kernel_warnings=[r['name'] for r in saved.get('freecad_mesh_checks',[]) if r['self_intersections']]
if kernel_warnings:
    readme=readme.replace('TRƯỚC KHI IN FULL ĐỂ LẮP',
        'LƯU Ý KIỂM MESH\nCác file kín/manifold; PyMeshLab không phát hiện mặt tự giao. Kernel FreeCAD\n'
        'còn cảnh báo tại '+', '.join(kernel_warnings)+'. Nhờ tiệm xem layer preview trong\n'
        'slicer và xử lý/xác nhận trước khi in full. Chi tiết trong MESH_CHECKS.json.\n\nTRƯỚC KHI IN FULL ĐỂ LẮP')
(SEND/'README_VI.txt').write_text(readme)
(SEND/'MESH_CHECKS.json').write_text(json.dumps({'status':'DESIGN_REVIEW_REQUIRED','freecad':saved.get('freecad_mesh_checks',[]),'pymeshlab_and_trimesh':[{'name':p['name'],'checks':p['saved_checks'],'sha256':p['sha256']} for p in mesh['parts']]},indent=2))
preview_dir=SEND/'preview'; preview_dir.mkdir(exist_ok=True)
images=[('01-assembly','Assembly — chân và BMO theo LIVE_STATE_BEFORE'),('02-front','Mặt trước — các nút dịch phải thêm 2 mm'),('03-side-BMO','Chữ O tại gốc tay'),('04-back-switch','Công tắc trên nắp lưng'),('05-exploded','Exploded view — có cả hardware không in'),('06-section','Section view — linh kiện bên trong'),('07-four-print-parts','Đúng bốn chi tiết gửi in')]
for name,_ in images:
    file=OUT/'preview'/(name+'.png'); assert file.stat().st_size>15000
    shutil.copy2(file,preview_dir/file.name)
cards=''.join(f'<figure><a href="preview/{n}.png" target="_blank"><img src="preview/{n}.png" alt="{t}"></a><figcaption>{t}</figcaption></figure>' for n,t in images)
html='''<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BMO — Preview bộ 4 chi tiết</title><style>body{font:16px/1.6 system-ui;margin:0;background:#eef7f4;color:#153e38}main{max-width:1160px;margin:auto;padding:32px}h1{line-height:1.2}p{max-width:900px}.badge{display:inline-block;background:#fff0bf;border:1px solid #dac374;border-radius:8px;padding:6px 12px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:20px}figure{margin:0;background:white;border:1px solid #cbded7;border-radius:12px;overflow:hidden}img{width:100%;display:block}figcaption{padding:14px}code{background:#fff;padding:2px 5px}a{color:#075b4b}</style><main><h1>BMO Quota Pet — bản 4 chi tiết in</h1><p class="badge">DESIGN_REVIEW_REQUIRED · bộ in thử · mm · scale 100%</p><p>Chân và chữ BMO lấy từ LIVE_STATE_BEFORE, O trùng gốc tay. Các nút tròn/tam giác dịch sang phải; công tắc ở nắp lưng. Tay, chân, tai rỗng và trang trí dính liền thân.</p><p><b>Gửi tiệm:</b> 4 STL cùng <a href="README_VI.txt">README_VI.txt</a>. Thân + nắp màu mint, D-pad vàng, nút tròn đỏ. Bấm từng ảnh để xem lớn.</p><p><b>Vật tư lắp thêm:</b> hai giá FR4/PCB đục lỗ và bốn vít M2 cho hai tactile, không phải part nhựa in. Fit thực và cách giữ switch cần coupon trước khi in cả bộ.</p><div class="grid">'''+cards+'''</div><p>Muốn xoay 3D: mở CAD bằng FreeCAD hoặc nạp 4 STL vào slicer. Các hình này được render từ CAD thực.</p></main></html>'''
(SEND/'PREVIEW.html').write_text(html)
(OUT/'PREVIEW.html').write_text(html)
rows='\n'.join(f'| `{p["name"]}.stl` | {p["color"]} | {p["saved_checks"]["faces"]:,} | 1 | 0 |' for p in mesh['parts'])
max_deviation=max(float(d['max']) for p in mesh['parts'] for d in p['sampled_bidirectional_hausdorff'])
warnings=[r for r in saved.get('freecad_mesh_checks',[]) if r['self_intersections']]
tool_note=('FreeCAD không báo self-intersection trên các STL cuối.' if not warnings else 'FreeCAD vẫn có cảnh báo self-intersection theo ngưỡng kernel ở '+', '.join(r['name'] for r in warnings)+'. PyMeshLab không phát hiện mặt tự giao; cần kiểm lại trong slicer. Không gắn PRINT_READY từ sự khác nhau giữa hai phép kiểm.')
report=f'''# BMO — Final Print Optimization

**Bản bàn giao hiện tại: `cad/print_shop/`. Phân loại: `DESIGN_REVIEW_REQUIRED`.**
Đã chỉnh trực tiếp bằng FreeCAD MCP trên assembly hiện có; không dựng lại BMO.

## File gửi tiệm và preview

- Gửi `cad/print_shop/BMO_SEND_TO_PRINT.zip`, hoặc 4 STL và `README_VI.txt` trong
  `cad/print_shop/SEND_TO_PRINT/`. Mỗi STL in một chiếc, mm, scale 100%.
- Mở `cad/print_shop/PREVIEW.html` để xem ảnh offline.
- CAD chỉnh sửa: `cad/print_shop/BMO_PRINT_SHOP.FCStd`.
- CAD xem riêng bốn part in: `cad/print_shop/BMO_FOUR_PRINT_PARTS_PREVIEW.FCStd`.
- STEP từng part và assembly: `cad/print_shop/step/`.

## Thay đổi đã chốt theo yêu cầu mới nhất

| Nội dung | Kết quả hiện tại |
| --- | --- |
| Chân | Lấy lại các khối chân từ `cad/final_print/LIVE_STATE_BEFORE.FCStd`; giữ dáng, tọa độ và phần bàn chân nhô như file tham chiếu |
| Chữ BMO | Hình chữ nổi gốc cao 10 mm, đúng tọa độ LIVE; cùng mint và gộp vào thân |
| Chữ O | Tâm Y=0, Z=29 mm, đồng tâm gốc tay |
| Tam giác và nút tròn | Dịch thêm +2 mm theo X so với bản tối ưu trước; D-pad và OLED giữ vị trí |
| Công tắc | Chuyển lên góc trên bên phải nắp lưng, tâm X=12, Z=66; actuator nhô 2 mm sau mặt nắp |
| Số part in | Đúng 4: thân, nắp, D-pad, nút đỏ |

Chân phải trong file tham chiếu là BRep đối xứng gây lỗi Boolean. Đã round-trip
STEP để sửa topology trước khi gộp, không vẽ lại chân; chênh thể tích BRep khoảng
0,0358 mm³ (khoảng 0,0041%). Peg cũ nằm trong root liền khối, không còn cơ cấu
lắp chốt rời. Body cuối là một solid. File tham chiếu và backup được giữ nguyên.

## Kích thước và bố trí linh kiện

Thân danh nghĩa **48 × 54 × 68 → 48 × 48 × 68 mm**, giảm sâu **6 mm (11,1%)**.
Lòng trong danh nghĩa **43 × 48,5 × 63 → 43 × 42,5 × 63 mm**, trước khi trừ giá.
Thành trước/nắp mẫu đo 2,75; hông/đáy/nóc 2,5; hông khắc DUT còn danh nghĩa 1,9 mm.
Các kích thước này không bao gồm bàn chân, tay, tai và nút nhô.

ESP populated 27 × 40,5 mm giữ nguyên, dịch 5,4 mm về trước. OLED không đổi.
Boost giữ hình học 37,2 × 17,2 với chiều cao placeholder 14 mm, xoay 90° đứng;
tụ Ø12,5 × 25 nằm ngang. Pin 503048 cùng PCM/dây/JST được giữ nguyên; pin và
cradle ESP đi với nắp. Không bỏ boost/tụ, không scale PCB hoặc cell.

So sánh cuối 544 tổ hợp mỗi family, sâu 38–54 theo bước 1 mm: boost nằm cần
51 mm trong lưới đã thử; boost đứng đạt 48 mm. 44 mm sơ bộ bị loại vì tụ dời
trước giao switch/retainer. Giới hạn hiện tại là tụ–boost–khay/pin, header ESP,
controls và khoảng chừa. Không khẳng định tối ưu toàn cục với mọi góc/xếp linh kiện.
`cad/final_print/depth-comparison-final.json` lưu so sánh; bản mới giữ cách xếp
được chọn, thay cơ cấu nút và vị trí switch.

Pin cách mặt phẳng trong nắp 1,65 mm; tụ 23 mm. Vách khay/gân chính đã tăng từ
0,5 lên 1,2 mm, khe ngang cell–khay danh nghĩa 0,3 mm mỗi bên. Sàn cradle ESP
0,8 mm. Dùng foam/đai mềm, không ép pouch bằng PLA. Chưa đo pack thật; không
suy độ an toàn cơ/điện/nhiệt từ nominal CAD.

## Bố cục nút và cơ cấu 4 part

D-pad tâm (-12,5;27), đỏ (12,5;21,5), tam giác tâm bbox (3;32), nút nhỏ trên
(10,5;39,4), nút nhỏ dưới (14,2;31), đơn vị X,Z mm. So với nguồn LIVE: D-pad
dịch trái 2; đỏ phải 3/lên 1; tam giác phải 3/lên 5; hai nút giả được điều chỉnh
đồng bộ. Các relief giả cùng mint, có rãnh sơn, không có switch hay lỗ xuyên.
Hai layout trước đã đo: A có D-pad–tam giác 4,5 mm, B bị loại do đỏ–nút nhỏ chỉ
1,43 mm. Dịch phải thêm 2 mm ở bản hiện tại tiếp tục tăng khoảng phía D-pad.

Chỉ D-pad và đỏ là nút thật. Shaft/hole clearance danh nghĩa 0,4 mm mỗi mép;
flange giữ phía trong. Hai cap có trụ chặn tích hợp tiếp xúc giá ở hành trình
0,30 mm; cap–stem nghỉ 0,05 mm, nén stem danh nghĩa 0,25. Đã kiểm 0–0,30 mm
không giao body, housing/giá/stem nén; kiểm kéo -0,05 và nhấn quá 0,35 để thấy stop.
Chưa kiểm lực, đàn hồi, nghiêng cap hoặc tuổi thọ với switch thật.

**Vật tư bổ sung để chỉ còn 4 STL:** hai miếng FR4/PCB đục lỗ 1,6 mm và bốn vít
M2 làm giá hai tactile. Đây là phương án cơ khí mặc định được chọn để thay part
nhựa giữ switch thứ năm. FR4 không xuất STL; có trong assembly STEP/CAD.
Footprint, cách hàn/giữ và hình dáng chân tactile phải đo; đây không phải thiết kế
PCB đã route hoặc mạch điện mới. Đo/fit coupon giá này trước khi in cả bộ.

## Gộp chi tiết và in FDM

Thân gộp hai tay, chân, hai tai rỗng, các nút giả, thanh ngang, chữ/hoa văn và
các giá cố định/skid. Nắp gộp khay pin/cradle ESP và giá công tắc sau lưng.
Không có STL riêng cho tay/chân/tai/chữ hoặc linh kiện điện tử.

Tai giữ lỗ cũ, viền mẫu đo 0,993 → 1,643 mm, sâu 5 → 7 mm; dưỡng Ø3 qua cả hai.
Tay giữ liền thân, root được gia cố; ngón vẫn nhỏ nên cần support và coupon.
Chưa có thử lực kéo khoen, bẻ tay/chân, rơi hoặc FEA. BMO theo source là chữ nổi;
DUT và duyaivy tiếp tục là rãnh khắc mint để tự sơn.

Hướng STL đã đặt trên Z=0: body đứng, nắp mặt ngoài xuống, cap mặt trước xuống
để các trụ chặn hướng lên. Hai cap cần tiệm xem support dưới flange; tay/ngón,
đáy thân và gân nắp cũng cần support chọn lọc. Thử nozzle 0,4, layer 0,16–0,20,
3–4 vách; đây chưa phải profile slicer đã chạy hoặc G-code. Gỡ support nhẹ,
giữ sạch mặt trượt và lỗ tai. In coupon trước khi in full để lắp.

## Kiểm chứng

`fit-validation.json`: 21 leaf parts có BRep hợp lệ, một solid mỗi part;
không có giao vật lý ngoài overlay OLED glass/active-area được phân loại rõ.
Antena, USB và khoảng thao tác switch không bị vật thể khác chiếm.
`saved-file-verification.json`: mở lại CAD đã lưu, kiểm đủ 4 part in và trục
vít giá FR4. `service-validation.json`: 8 bước tháo, kiểm BRep bước tối đa 0,5 mm,
không còn giao trên đường mẫu; không phải chứng chỉ chuyển động liên tục.

Thứ tự: ngắt dây/release đai và vít → rút nắp cùng ESP/pin/switch → charger →
boost → nhấc tụ 4 mm rồi rút → tháo giá D-pad (ra sau 4, lên 3, phải 4, rút sau)
→ giá đỏ (sau 0,2, lên 1,5, sau 4,8, trái 2, rút sau) → D-pad (sau 6, phải 4/
xuống 2, rút sau) → đỏ ra sau. Không kéo khi dây/adhesive còn giữ. Các vector và
điều kiện cụ thể nằm trong audit; cần xác nhận thao tác trên prototype.

| STL | Màu | Tam giác | Khối liên thông | Mặt tự giao theo PyMeshLab |
| --- | --- | ---: | ---: | ---: |
{rows}

STL đã đọc lại: kín, winding nhất quán và thể tích dương. Dùng PyMeshLab đóng
lỗ tessellation cục bộ, Manifold cleanup tolerance 0,01 mm cho thân, 0,005 mm
cho các part khác; không sửa CAD bằng mesh. Chân và chữ theo tham chiếu được
giữ trong CAD; STL là tessellation có sai số được kiểm riêng.
Khoảng cách Hausdorff lấy mẫu hai chiều tới tessellation nguồn lớn nhất
**{max_deviation:.5f} mm**; đây là phép lấy mẫu, không phải bound toàn bề mặt.
{tool_note}
Các filter được mô tả trong [tài liệu PyMeshLab](https://pymeshlab.readthedocs.io/en/latest/filter_list.html).
`mesh-validation.json` lưu phiên bản công cụ, checks, bounds, transform và SHA-256.

## Còn cần đo và thử

Pack 503048 cả bọc/PCM/JST; camera/header ESP thực (nguồn giả định camera đã
tháo); PCB/kính/header OLED; boost/trimmer/chân hàn; tụ/lead/cực tính/rating;
charger/USB và switch thật; hai tactile/footprint/height/travel/force; vít,
foam/đai và đủ số lõi dây/đầu nối/bend radius. Các hành lang dây trước chỉ là
dự phòng, chưa chứng minh harness hoàn chỉnh; vị trí switch mới cần route dây
đúng thực tế. Chưa có thử nhiệt/điện hoặc cấp nguồn từ xa.

Không dùng `PRINT_READY`: mesh đạt không chứng minh fit, độ bền, retention hoặc
nguồn điện. `DESIGN_REVIEW_REQUIRED` là trạng thái của bộ in thử này; nâng mức
sau khi đóng số đo quyết định và in/lắp coupon đạt.

## Source để chỉnh tiếp

Nguồn hình học ban đầu và backup giữ ở `cad/final_print/`; các stage trong CAD
và script FreeCAD MCP giữ khả năng tái tạo. BRep không phải toàn bộ sketch có
constraint tự recompute; sửa JSON/spreadsheet phải chạy lại generator tương ứng.
Pipeline bản mới: `revise_bmo_print_shop.py` → `check_bmo_shop_revision.py` →
`mount_bmo_shop_switches.py` → `repair_bmo_reference_foot.py` →
`restore_bmo_live_style.py` → `export_bmo_shop_source.py` →
`validate_bmo_shop_service.py` → `prepare_bmo_shop_meshes.py` →
`verify_bmo_shop_saved.py` → `package_bmo_print_shop.py`.
Chờ từng job MCP xong trước bước phụ thuộc; các đường dẫn workspace trong source
cần điều chỉnh nếu chuyển máy. Không ghi đè thay đổi thủ công chưa lưu phiên bản.

![BMO hiện tại](../cad/print_shop/preview/01-assembly.png)

![Bộ bốn chi tiết in](../cad/print_shop/preview/07-four-print-parts.png)
'''
(ROOT/'docs/BMO_FINAL_PRINT_OPTIMIZATION.md').write_text(report)
manifest={'status':'DESIGN_REVIEW_REQUIRED','files':[{'name':p['name']+'.stl','color':p['color'],'sha256':p['sha256'],'bytes':p['bytes']} for p in mesh['parts']],'printed_part_count':4,'nonprinted_additional_hardware':'Two FR4 carriers and four M2 fasteners; actual tactile attachment/footprint must be verified.'}
(SEND/'MANIFEST.json').write_text(json.dumps(manifest,indent=2))
archive=OUT/'BMO_SEND_TO_PRINT.zip'
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED) as z:
    for file in sorted(SEND.rglob('*')):
        if file.is_file(): z.write(file,file.relative_to(SEND))
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    assert len([n for n in z.namelist() if n.endswith('.stl')])==4
print(json.dumps({'archive':str(archive.relative_to(ROOT)),'bytes':archive.stat().st_size,'stls':4,'preview':str((OUT/'PREVIEW.html').relative_to(ROOT)),'report':'docs/BMO_FINAL_PRINT_OPTIMIZATION.md'}))
