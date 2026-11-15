BMO QUOTA PET — BỘ 4 CHI TIẾT IN THỬ
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
