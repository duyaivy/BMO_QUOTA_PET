# BMO CAD review — 2026-11-13

## Kết luận

Đã kiểm tra bằng FreeCAD 1.1.4 qua MCP Bridge đang chạy trên máy. Bản gốc
`BMO_QUOTA_PET.FCStd` được giữ nguyên. Bản sửa là **concept kiểm tra bố trí**, chưa
phát hành để in hoặc khẳng định lắp được với linh kiện thực tế.

## Lỗi xác nhận ở bản gốc

- D-pad gồm 2 solid rời. Phần chữ thập kết thúc tại Y=-13.3, gờ giữ bắt đầu
  Y=-13.0: hở 0.3 mm. Vỏ trước gồm 3 solid, có giá đỡ chưa nối với vỏ.
- D-pad giao vỏ 65.64 mm³; nút đỏ giao vỏ 15.4566 mm³. Hai nút còn giao cần
  công tắc lần lượt 13.6188 và 16.3426 mm³. Điều này không mô tả trạng thái nghỉ
  của nút có hành trình hoạt động.
- Mỗi tay giao vỏ khoảng 197.9319 mm³; một phần tay xuống Z=-0.705 mm,
  trong khi đáy thân ở Z=0. Không có chốt lắp chân, lỗ chân lớn hơn chân nhưng
  thân chân chỉ chạm mặt ngoài.
- Kiểm tra cũ chỉ có 8 cặp: không kiểm tra vỏ, nắp, nút, tay chân hay số solid.
  Dòng “ALL COMPONENT CHECKS PASSED” vì vậy không chứng minh cả cụm lắp đúng.
- Mạch nguồn dùng PCB 36 × 14.5 mm thay vì envelope yêu cầu khoảng 40 × 15 mm.
- “Rounded box” cũ chỉ bo mặt bằng XY, không bo góc trên/dưới ở mặt nhìn chính.
- Ảnh mang tên front thực tế là góc nghiêng. Chỉ gọi viewFront trước saveImage
  không bảo đảm chuyển động camera đã kết thúc.

Số đo chi tiết và các giao hình khác: `original-audit.json`. Giao của chi tiết
trang trí với vỏ có thể là chủ đích để dán/ghép; không tự động xem mọi giao thể
tích là lỗi.

## Bản sửa

- Vỏ danh nghĩa W × D × H = **48 × 30 × 68 mm**, chưa tính tay, chân, nút và logo.
  Khoang chính W × D × H khoảng **43 × 24.5 × 63 mm**; các giá đỡ chiếm một phần
  khoang này. Chiều rộng chọn từ 40 mm PCB + 2 × 1.5 mm khoảng bên + 2 × 2.5 mm
  thành vỏ. Đây là envelope lựa chọn, **không phải nghiệm tối ưu kích thước tối thiểu**.
- Toàn cụm gồm phần nhô ra xấp xỉ 58 × 40 × 68 mm theo hộp bao hình học.
- Tay dùng đường cong spline, đường kính 3 mm, bàn tay phẳng ở Z=0; chân có
  bàn chân dạng capsule 5.8 × 3.8 × 10 mm, nối chân Ø4 mm.
- Chốt tay Ø2.8 / lỗ Ø3.3; chốt chân Ø3.6 / lỗ Ø4.1 mm. Đây là phương án
  lắp dán tháo rời để thử, chưa có khóa chống tuột; dung sai cần mẫu in kiểm tra.
- D-pad và nút đỏ mỗi nút thành 1 solid liền, gờ giữ có hốc riêng; khoảng nghỉ
  đầu cần công tắc 0.1 mm là giả định. Cần xác nhận hành trình và chiều cao cần thật.
- Chi tiết trang trí và logo nhập liền vỏ; nắp có 4 lỗ thông và trụ pilot dự kiến
  dùng vít M2. Đường kính pilot 1.7 mm cần xác nhận theo vít, vật liệu và máy in.
- Dời màn lên 4 mm, bo góc mặt trước; thêm bệ đặt OLED, pin, ESP32 và mạch nguồn.
  Giá công tắc có cầu nối với vỏ và tránh pin. PCB nguồn đổi thành 40 × 15 mm.
- Ảnh front dùng camera trực giao định hướng trực tiếp; có thêm ảnh nghiêng và
  mặt cắt X=0. Không xuất STL.

## Bằng chứng kiểm tra bản sửa

17 chi tiết leaf `Part::Feature`, kiểm tra toàn bộ 136 cặp. Cả 17 chi tiết hợp lệ
và mỗi chi tiết chỉ có 1 solid. Không có giao thể tích vật lý >0.001 mm³ giữa
các chi tiết riêng. Chỉ có lớp minh họa vùng sáng OLED chồng lớp kính
11.8048 mm³, được phân loại rõ là display overlay. Tay/chân đều không xuống
dưới Z=0. Pin tiếp xúc bệ đỡ là chủ đích, không có giao thể tích.

Các assert được chạy ngay trong FreeCAD trước khi lưu. Kết quả chi tiết:
`revised-audit.json`. Không giao hình không chứng minh đủ dung sai, độ bền,
đường đưa linh kiện vào, hoặc khả năng in.

## Thông số chưa xác minh và việc còn phải làm trước bản in

1. **OLED thực tế:** PCB 27 × 27 × 1.6 mm, vị trí lỗ, kính 24 × 14.5 mm và
   chiều cao header đang kế thừa giả định của bản cũ. Không thể xác minh chỉ từ
   tên “OLED 0.96 I2C”. [Adafruit 326](https://www.adafruit.com/category/product/326)
   nêu PCB 29.2 × 26.7 mm; [Winstar WEO012864C](https://www.winstar.com.tw/products/oled-module/graphic-oled-display/weo012864c.html)
   dùng kính 26.70 × 19.26 mm. Đây là ví dụ về biến thể, không phải linh kiện đã
   xác nhận của người dùng. Kính giả định nhỏ hiện tại có thể làm cửa màn sai.
2. **ESP32-CAM:** [datasheet Ai-Thinker](https://datasheet.lcsc.com/lcsc/Ai-Thinker-ESP32-CAM-C277946.pdf)
   nêu 27 × 40.5 × 4.5 (±0.2) mm. Bản CAD dùng đúng chiều dài/rộng danh nghĩa,
   nhưng stack có camera, thẻ SD, chân hàn phải đo lại. CAD hiện giả định hàn dây
   trực tiếp, không có header cao. Khoảng pin tới camera chỉ 0.5 mm, chưa có
   allowance đủ tin cậy cho sai số, đệm cách điện và biến dạng pin.
3. **Pin:** 503040 không đủ để kết luận kích thước cả túi pin, mạch bảo vệ và
   dây. CAD đang dùng envelope có dây cao tới 58 mm, dày 5.2 mm. Cần đo thực tế,
   định tuyến dây và dành chỗ cho thay pin; không ép pin vào khung.
4. **Nguồn:** chỉ xác nhận theo yêu cầu envelope 40 × 15 mm; chiều cao linh kiện,
   vị trí USB-C, chức năng sạc/boost và công tắc chưa có SKU/drawing. TP4056 riêng
   không tự xác nhận có boost. USB-C hiện lùi 1.4 mm so với mặt lưng; cần thử
   envelope đầu cáp và kiểm tra đường cắm, không chỉ xét lỗ có thẳng hàng.
5. **Giữ linh kiện và lắp ráp:** bệ đặt ESP32, nguồn và OLED chưa có đầy đủ cơ cấu
   chống nhấc; cần chốt phương án ngàm/đai/keo/vít với board thật. Chốt tay/chân
   chưa có khóa; chưa mô phỏng đường lắp nút từ mặt sau, tiếp cận vít, lực nhấn
   hoặc biến dạng. Giá công tắc có khe giữ cứng cần thử khả năng đưa switch vào.
6. **Dây và dung sai:** chưa có dây/đầu JST, tụ nguồn, công tắc nguồn, bộ nạp,
   khoảng gập và strain relief đầy đủ. Chưa có allowance theo công nghệ in,
   kiểm tra support, độ bền tay Ø3, test rơi và ổn định chống lật.
7. **Giống ảnh:** hình dáng tay/chân đã được chỉnh theo ảnh, nhưng tỷ lệ chỉ là
   ước lượng từ phối cảnh. Màn 0.96 có vùng sáng CAD rộng 21.74 mm, bằng 45%
   thân 48 mm; ảnh tham khảo cho cảm giác màn lớn hơn. Muốn giống hơn cần xác
   nhận màn thật hoặc chọn cỡ màn khác rồi kiểm tra lại toàn bộ bố trí.

Để chốt vòng tiếp theo, cần số đo hoặc drawing đúng model của OLED (cả kính,
PCB và header), pin (cả bảo vệ/dây), board nguồn (cả USB) và hai switch.

## Tái tạo

`scripts/freecad_bridge_call.py` đọc cấu hình MCP sẵn có, không chứa token.
`scripts/audit_bmo_cad.py` mở bản gốc và tạo audit.
`scripts/revise_bmo_cad.py` mở lại bản gốc, tạo revision và ảnh trong `cad/`.
Script revision đóng bản gốc đang mở mà không lưu thay đổi trong bộ nhớ; chỉ
chạy khi không có chỉnh sửa thủ công cần giữ. Đường dẫn workspace đang cố định.
