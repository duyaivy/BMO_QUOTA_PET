# BMO Hardware Fit Review

**Trạng thái: `DESIGN_REVIEW_REQUIRED`.** Đã cập nhật CAD, tìm bố trí, kiểm tra
hình học, xuất ảnh và STL kiểm tra. Chưa xác nhận đủ điều kiện in cả bộ để lắp
hoàn chỉnh hoặc cấp nguồn: OLED/charger/switch/PCM/tụ còn thiếu số đo thật, giữ
board/khay cần mẫu thử và tai có đoạn viền khoảng 0.99 mm cần kiểm tra tải khoen.

## 1. Dữ liệu đầu vào và bảo toàn thiết kế

Assembly nguồn là `cad/BMO_FINGERS_FILLED_LEGS_CONCEPT.FCStd`, đúng bản mới nhất
có ba ngón tay, chân đã lấp khe, chữ BMO/DUT dọc, chữ duyaivy và tai mèo rỗng.
FreeCAD MCP Bridge đã thực thi trên FreeCAD 1.1.4. Tám archive CAD ở root và
`cad/` đã đọc XML/kiểm tra ZIP; lịch sử cũ không bị thay thế.

Trước khi sửa, đã sao lưu byte-for-byte, đối chiếu SHA-256
`6aaaebe2795070c3b5b7fbf255fe26e0dca1e1c2c7a25f409048c00c388f9543`.
Đường dẫn backup chính xác nằm trong
`cad/hardware_review/baseline-inspection.json`; có thêm `INSPECTED_BASELINE.FCStd`.

Nguồn chỉ có OLED, hai tactile, pin 503040 cũ, ESP32-CAM có camera, mạch nguồn
gộp 40 × 15 mm, vỏ/nút/trang trí/tay/chân. Chưa có MT3608 riêng, tụ 2200 µF,
charger riêng, switch nguồn, connector/dây và vùng bảo trì đầy đủ. Không có pin
18650 trong assembly nguồn đã kiểm tra.

Giữ hình học mặt trước, viền OLED, các nút, tay/chân, chữ bên hông, duyaivy và hai
tai. Chỉ kéo dài khoang về phía sau, sửa trụ vít/port, thay kệ trong vỏ và thêm
giá đỡ. Boolean symmetric difference của vùng tai so với nguồn bằng **0 mm³**.

## 2. Kích thước trước/sau — mm

| Hạng mục | Trước | Sau |
| --- | ---: | ---: |
| Thân W × D × H, chưa tính tai/chân/nút/chữ | 48 × 30 × 68 | **48 × 54 × 68** |
| Cao toàn cụm từ mặt bàn tới tai | khoảng 85.95 | khoảng 85.95 |
| Đáy thân / nóc thân theo Z | 7 / 75 | 7 / 75 |
| Khoang chính danh nghĩa W × D × H | 43 × 24.5 × 63 | **43 × 48.5 × 63** |
| Thể tích hộp khoang danh nghĩa | 66,370.5 mm³ | 131,386.5 mm³ |
| Thành trước / nắp lưng, tại ray đo đại diện | 2.75 / 2.75 | 2.75 / 2.75 |
| Thành hai bên, đáy, nóc tại ray đo đại diện | 2.5 | 2.5 |

Đo đường giao ray với BRep, không suy từ ảnh. Các giá trị thành là mẫu tại vùng
đặc, không phải chứng minh mọi vị trí đều có cùng độ dày: hốc nút/cửa màn/cổng
có thành mỏng hơn và lỗ xuyên theo chức năng. Sau khi trừ các chi tiết bên trong
vỏ, khoảng rỗng đo được **129,628.12 mm³**; sau các giá in thêm còn
**126,747.49 mm³**, trước khi lắp electronics/dây/foam. Không đồng nhất thể tích
rỗng này với thể tích có thể đưa một linh kiện bất kỳ vào. Thể tích hình học từng
part và tọa độ min/max XYZ nằm trong `integration-audit.json`.

Tăng chiều sâu 24 mm vì cần chứa đồng thời header ESP, MT3608 cao dự phòng
14 mm, pin/PCM/dây, tụ và module sạc riêng; không thu nhỏ linh kiện. Hình phía
hông sâu hơn rõ rệt. Không khẳng định 54 mm là tối ưu toàn cục hoặc số đo sản phẩm
thật: đây là mức nhỏ nhất trong lưới bố trí cụ thể đã thử.

## 3. Bảng linh kiện và độ tin cậy

| Component CAD | Kích thước/đặc điểm đang dùng | Nguồn và mức xác minh |
| --- | --- | --- |
| ESP32_CAM_AI_Thinker | PCB 27 × 40.5 × 1.2; shield/SD/header; pin nhô 10 mm dự phòng; bỏ camera | Dài/rộng theo AI-Thinker; stack/header/pin pitch/antenna cần đo đúng revision |
| OLED_096_PCB | 27 × 27 × 1.6; bốn lỗ Ø2 giả định | Kế thừa bản cũ; **chưa xác minh module người dùng** |
| OLED glass / active area | 24 × 14.5 × 1.3; vùng sáng 21.74 × 10.86 | Kế thừa bản cũ, không suy kích thước thực từ tên 0.96 inch |
| OLED header | 4 chân, pitch 2.54 giả định; có loom I2C | Thứ tự chân, hướng header và chiều cao cần xác nhận |
| Tactile A/B | thân 6 × 6, sâu 3.5; cần nhô 1.2 theo Y | Chưa có mã switch; cần đo lực/hành trình/chân hàn |
| Battery_LiPo_503048 | cell **5 × 30 × 48**, PCM làm pack dài 50; dây/JST riêng | Nominal người dùng cung cấp; cả pack có PCM/connector chưa đo |
| Battery_LiPo_503040 | cell **5 × 30 × 40**, PCM/dây tương tự | Cấu hình dự phòng ẩn; không lắp đồng thời |
| Power_Boost_MT3608 | PCB **37.2 × 17.2**, stack tối đa **14**; cuộn cảm/biến trở/pads/đầu hàn | Theo reference người dùng; vị trí populated part là placeholder, không phải drawing đúng SKU |
| Capacitor_2200uF | **Ø12.5 × 25**, pitch chân 5 và vùng dây 5 | Toàn bộ kích thước là placeholder; `ELECTRICAL_VALIDATION_REQUIRED` |
| Charger_Module_PLACEHOLDER | PCB 26 × 19 × 1.6, stack 5.8; USB hướng lưng | Chưa có mã/ảnh đủ định danh; không coi là MT3608 hay power-path |
| Power_Switch_PLACEHOLDER | thân khoảng 5 × 8 × 6, actuator riêng | Chưa có SKU, kiểu khóa/định mức chưa xác minh |
| Loom/dây | đường đại diện Ø1.4; envelope tuyến Ø4 | Dự phòng không gian, không xác nhận tiết diện dẫn điện/dòng định mức |

Trong các ảnh hiện có tại workspace, chưa tìm thấy drawing có thước hoặc ảnh
module OLED/tụ đủ để xác định chính xác SKU và kích thước quyết định độ vừa.
Thông tin trong hội thoại rằng có ảnh không được coi là phép đo thật. Ví dụ
[OLED Adafruit 326](https://www.adafruit.com/category/product/326) có PCB khác
27 × 27; không lấy mẫu này làm số đo của module người dùng.

Nguồn đối chiếu: [Ai-Thinker ESP32-CAM](https://docs.ai-thinker.com/esp32-cam),
[datasheet AI-Thinker được lưu tại LCSC](https://datasheet.lcsc.com/lcsc/Ai-Thinker-ESP32-CAM-C277946.pdf),
[ESP32 Series — Espressif](https://documentation.espressif.com/esp32_datasheet_en.html),
[MT3608 — Aerosemi/Mouser](https://www.mouser.com/datasheet/2/306/MT3608-3223743.pdf).
Datasheet chip không tự xác nhận chiều cao hay khả năng tải của một module bán lẻ.

Thể tích BRep, không phải thể tích envelope: ESP32 2,417.68 mm³, pin 503048
7,548.32 mm³ kể cả PCM/dây/connector mô phỏng, MT3608 2,860.82 mm³,
tụ khoảng 3,074.32 mm³ kể cả chân, charger khoảng 1,539.20 mm³.

## 4. Ba phương án và lựa chọn

| Layout | Kết quả tại thân sâu 30 mm |
| --- | --- |
| A — pin sau, ESP trung tâm, nguồn dưới | Envelope ESP/MT/charger ra ngoài khoang; pin giao ESP/boost/tụ và vùng anten |
| B — pin nằm ở tầng dưới | Envelope pin xoay nằm có chiều sâu 52 mm gồm allowance, vượt khoang; giao boost/tụ |
| C — tìm kiếm rời rạc | 270 tổ hợp, 78 thỏa containment và không giao envelope; chọn sâu 54 mm |

Grid: 10 chiều sâu 30..66 mm (bước 4), 3 vị trí Y cho ESP, 3 cho boost, 3 cho tụ.
Đầu USB và vùng đầu cáp được kiểm tra riêng theo tọa độ tương đối với lưng của
từng ứng viên. Portal tương ứng được cắt thật trên vỏ/nắp, và keep-out vẫn
kiểm tra hai chi tiết này; không bỏ qua đầu nối khi kiểm tra linh kiện khác.
Ưu tiên: không lỗi envelope/antenna → chiều sâu nhỏ nhất → tổng khoảng cách tâm
các cặp cần nối dây nhỏ nhất. Giá trị khoảng cách tâm của phương án chọn
114.32 mm là **proxy**, không phải chiều dài dây thực. Mẫu A/B và các envelope
của C là các object ẩn có thể bật xem trong assembly; toàn bộ kết quả nằm trong
`layout-search.json`. Không tìm kiếm mọi góc xoay hoặc mọi hình dáng giá đỡ.

Phương án chọn: OLED và hai switch giữ nguyên ở trước; ESP dọc ở giữa, header
hướng lưng; pin sau trong khay tháo được; MT ở tầng đáy phía sau; tụ nằm ngang
theo trục X ở đáy phía trước; sạc ở hông trái, switch nguồn ở hông phải phần kéo
dài. Thử xoay tụ đứng tại cùng bay gây giao ESP **114.73 mm³**; vì vậy chọn ngang
cho bay này, không mặc định hướng ngang luôn tốt hơn.

503048 với PCM/dây và 503040 dự phòng đều được mô phỏng đúng chiều dài cell.
503040 tiết kiệm 8 mm theo chiều cao cell; chưa chứng minh có thể giảm sâu vỏ vì
boost, tụ, header và tuyến dây vẫn chi phối. Nguồn cũ dùng 503040 không chứng minh
503048 vừa với **toàn bộ** phần cứng mới trong vỏ sâu 30 mm.

## 5. Va chạm, keep-out và khoảng hở

44 physical leaf objects: **946 cặp** được sàng lọc hộp bao rồi Boolean các cặp
có thể giao. Tất cả BRep hợp lệ; object đôi giá OLED cố ý chứa hai solid rời.
Không còn giao thể tích không chủ đích >0.001 mm³. Các giao được phân loại riêng:
vùng sáng OLED minh họa chồng kính; dây đi vào terminal/connector mô phỏng. Những
giao terminal này không phải kiểm chứng sơ đồ điện hay chất lượng mối hàn.

Đã kiểm tra thêm vùng anten, tua vít biến trở, đầu USB, thao tác switch và
envelope Ø4 của năm tuyến loom. Kết quả cuối không còn keep-out giao vật thể
không thuộc endpoint cho phép. Các góc dây vẽ đoạn thẳng chỉ mô tả hành lang;
**bán kính uốn thực, strain relief, tiết diện và đủ số lõi dây chưa được chốt**.

| Cặp BRep | Khoảng cách gần nhất mm |
| --- | ---: |
| Pin — MT3608 | 2.30 |
| Pin — tụ | 22.25 |
| Pin — ESP32 | 14.30 |
| Pin — charger | 3.30 |
| MT3608 — tụ | 3.77 |
| MT3608 — ESP32 | 8.77 |
| Tụ — ESP32 | 6.12 |
| ESP32 — charger | 1.95 |
| Tụ — nắp lưng | 29.00 |
| Pin gồm connector — nắp lưng | 1.75 |

Khoảng cách nhỏ nhất đến cả module không phải khoảng cách đến riêng linh kiện
nóng. Không suy ra an toàn nhiệt từ các số này. Khoảng pin–nguồn/sạc và thông gió
phải được kiểm tra nhiệt ở tải thật; chưa có thử mô phỏng nhiệt hoặc đo nhiệt.

## 6. Vỏ, giá đỡ, tai và khả năng in

Đổi các kệ cũ thành khay pin có foam/đai mềm, khay boost có vùng chân hàn, cradle
tụ có đai mềm, cradle giữ mép ESP không dựa vào lỗ PCB, đỡ mép PCB OLED và bracket
sạc. Foam/đai là vật liệu mềm dự phòng, **không in bằng PLA cứng rồi ép pin**.
Không dùng biến trở hoặc kính OLED làm điểm giữ cơ học. Giá ESP còn cần thử lực
giữ/khóa chống trượt theo header thật; một cradle có chỗ đặt không chứng minh
board đã chịu được rung/lật. Các khay/band và cách gắn chúng cần thử cơ khí.

Hai trụ vít trên chuyển từ X=±20 sang ±21.5, vẫn Z=69; hai trụ dưới X=±20, Z=30.
Lỗ pilot xuyên đã đo không bị bít; đường kính pilot 1.7, nắp Ø2.3/counterbore Ø4.2
là giả định vít M2 cần coupon theo vít thật. Trụ trên OD4 mm mỏng hơn trụ dưới
OD5 mm: chưa thử mô-men siết. Không đặt trụ vít đè vào cell.

Tai vẫn rỗng, vùng tai không thay đổi thể tích. Khoảng cách nhỏ nhất lấy mẫu giữa
wire ngoài và wire lỗ của mặt tai khoảng **0.993 mm**. Đây là **điểm cần review**,
không kết luận tai đủ bền treo móc khóa. Cần chốt khoen và thử kéo; cân nhắc tăng
vật liệu về phía trước/sau hoặc root sau khi xác định khoảng luồn khoen, giữ lỗ
mở. Chưa có FEA, thử rơi, thử mỏi hay thử lực kéo.

Tay Ø3.2, ngón Ø1.1/khe khoảng 0.4 và tai mỏng cần coupon riêng. Chân đã lấp khe
giữ nguyên. Chưa có profile máy/nozzle/vật liệu, nên chưa có G-code hoặc xác nhận
support tối ưu. Hướng in thử: nắp nằm mặt ngoài phẳng; khay đặt mặt đáy; vỏ thử
theo mặt trước hoặc đáy sau khi xem support cho hốc nút/tai. Cần kiểm tra bề mặt
nhìn thấy và hướng lớp chịu lực trước khi in toàn bộ.

STL giữ tọa độ assembly theo mm; cần đặt từng part lên bàn và chọn hướng trong
slicer, không in nguyên assembly đã lắp.

Đã xuất 9 STL mang hậu tố `DESIGN_REVIEW_REQUIRED`: front shell, back cover và
7 cụm fixture/skid. BRep trước xuất hợp lệ; mọi cạnh mesh sau lượng tử 1e-5 mm
có hai tam giác kề, không có cạnh hở/non-two-face theo phép kiểm đó. Đây không
thay thế kiểm tra self-intersection trong slicer, dung sai in hoặc thử lắp.

## 7. Nút bấm

Chỉ **D-pad và nút đỏ** có tactile vật lý. D-pad là **một nút**, không phải bốn
hướng độc lập. Tam giác, nút xanh dương/xanh lá và thanh khe là trang trí.
Ba miếng màu là các part riêng, không phát sinh yêu cầu ba switch mới.

Khoảng nghỉ giữa cap và đầu cần switch khoảng 0.10 mm. Đã dịch cap vào 0, 0.1,
0.2 và 0.25 mm: không giao vỏ. Sau 0.1 mm, đầu cần phải nén; chưa đo hành trình,
lực, độ hồi và độ rơ của switch thật. Không coi Boolean của cap với một stem
cứng ở trạng thái nhấn là chứng minh nút kẹt hay nút hoạt động. Cần coupon có
switch thật để chốt flange, chiều sâu và giá giữ.

## 8. Đóng nắp và bảo trì

Nắp đóng không giao front shell; pin/connector và tụ không bị nắp ép trong mô
hình. Cổng USB cũ được lấp, mở cổng mới theo charger placeholder; switch nguồn
có hốc và khoảng ngón tay ở phần hông kéo dài. Đầu USB/độ lùi cần đối chiếu cáp
thật. Lỗ vít có đường trục rỗng, chưa mô phỏng vít ren thực hoặc mọi đầu tua vít.

Kiểm tra hộp sweep liên tục bảo thủ cho ba bước, không còn vật cản trong các
part giữ lại: (1) rút khay pin về sau, (2) rút ESP sau khi bỏ pin, (3) rút boost
sau khi bỏ pin/ESP. Phải tháo nắp và ngắt loom trước; không khẳng định tháo module
đang cắm dây. UART/IO0 cần tiếp cận sau khi rút pin/ESP, chưa xác minh đúng chân
trên revision board; không mặc định có lỗ bắt vít ESP. Biến trở có vùng tua vít
đã kiểm tra trước khi hoàn tất lắp. Lắp thực theo thứ tự ngược.

## 9. Trọng tâm

Mô hình giả định điện tử: pin14 g, ESP10 g, boost4 g, tụ5 g, charger3 g, switch1 g,
OLED/headers khoảng5 g; nhựa tính từ BRep đặc ×1.24 g/cm³. Chưa có cân linh kiện,
infill/vít/keo và dây thật. Tổng khoảng **107.09 g**, COM khoảng
**(-0.21, 12.77, 37.65) mm**. Chiều sâu tăng khiến COM lùi quá vùng tựa tay cũ;
vì vậy thêm **Rear_AntiTip_Skid** thấp dưới phần thân kéo dài, không đổi mặt trước.
Với skid, hình chiếu COM nằm trong đa giác tựa, biên khoảng **23.23 mm**.

Không kết luận đứng vững chỉ bằng hai bàn chân: mô hình ngồi dùng tay và skid
cùng tựa bàn. Cần kiểm tra thật khi bấm nút, cắm USB, kéo khoen, bàn không phẳng
và khi các khớp dán có độ võng. Cách cố định skid vào thân cũng cần mẫu thử.

## 10. Kiểm tra điện và nhiệt

Chuỗi chức năng dự kiến: **LiPo/PCM → công tắc/cấp nguồn đã chốt → MT3608 →
đầu vào board ESP32-CAM**. Charger nối cell/PCM theo sơ đồ đúng module. Đây không
phải sơ đồ đấu dây đã xác minh. Không có thao tác hàn, chỉnh biến trở hoặc cấp
nguồn nào được thực hiện từ xa.

- **ESP32-CAM:** mục tiêu kiểm tra là chân **5V của đúng board** qua regulator
  onboard, không đưa 5V vào 3V3/GPIO. Phải xác nhận revision/schematic và nhãn
  header trước. Bảng RF trong [Espressif datasheet](https://documentation.espressif.com/esp32_datasheet_en.html)
  nêu dòng chip điển hình khoảng 180–240 mA khi phát và 95–100 mA khi nhận ở
  điều kiện thử 3.3V; **không phải dòng đầu vào 5V trung bình/đỉnh của cả board**.
  Camera bỏ đi không loại bỏ dòng Wi-Fi. Chưa đo MQTT/Wi-Fi firmware thật.
- **MT3608:** datasheet [Aerosemi](https://www.mouser.com/datasheet/2/306/MT3608-3223743.pdf)
  mô tả boost, không mô tả charger. Giới hạn switch nội 4A không phải đảm bảo
  module cấp 4A ở 5V. Khả năng thực phụ thuộc diode, cuộn cảm, PCB, VIN và nhiệt.
  Điện áp OUT thực tế chưa đo; không giả định biến trở đang đặt 5.0V.
- **Pin/PCM:** 650–750 mAh và mã 503048 không xác định dòng xả. Cần datasheet đúng
  cell/pack: discharge liên tục/xung, cutoff, PCM trip, điện áp sạc, dây/connector.
  [Ví dụ datasheet một pin 503040 khác](https://www.lipolbattery.com/LiPo-Battery-Datahseet/LiPo_Battery_LP503040_3.7V_560mAh.pdf)
  chỉ minh họa các giới hạn được công bố riêng; không áp cho viên pin này.
- **Charger:** mã board chưa rõ. Nếu thực sự dùng TP4056, dòng sạc phụ thuộc PROG
  và nhiệt theo [datasheet Top Power](https://www.toppwr.com/uploadfile/file/20230304/640301eae1260.pdf).
  Không coi 1A là phù hợp mọi cell nhỏ. Bảo vệ DW01A/PCM không đồng nghĩa có
  power-path. Cấu hình vừa sạc vừa chạy **chưa được chấp thuận**; cần sơ đồ/module
  power-path đúng hoặc thử hệ thống, không suy từ tên chip.
- **Tụ:** `ELECTRICAL_VALIDATION_REQUIRED`. Đọc voltage rating, loại tụ và cực tính.
  Chỉ cân nhắc mắc ngang rail boost 5V/GND gần đầu vào ESP khi đã xác nhận rating
  cao hơn mức rail cực đại với margin, cực dương/âm đúng và dòng ripple/ESR phù
  hợp. 2200 µF không tự chữa được regulator/battery thiếu dòng; phải thử inrush
  khi bật nguồn và sụt áp/xung tải. CAD chưa là xác nhận vị trí đấu điện cuối.
- **OLED:** xác nhận controller, VCC chấp nhận và pull-up I2C về mức phù hợp với
  GPIO ESP32; không suy thứ tự chân từ một module 0.96 khác.

Tính minh họa, **không phải kết quả đo**:
`Ibat = Vout × Iout / (η × Vbat)`, chọn η=0.85, Vout=5V.

| Tải 5V giả định | Pin 3.7V | Pin 3.0V |
| --- | ---: | ---: |
| 0.30A | 0.477A | 0.588A |
| 0.50A | 0.795A | 0.980A |

Chưa tính xung tải, dòng tĩnh, điện trở trong và sụt dây. Không kết luận cell hoặc
MT3608 đủ tải từ bảng này. Chưa chọn tiết diện dây, fuse, rating công tắc/JST hay
định mức nhiệt. Phải thử tải tại điện áp pin thấp, ghi dòng/rail sag/nhiệt tại
boost, charger, regulator và cell, kể cả lúc Wi-Fi kết nối lại và USB đang cắm.

## 11. Kích thước cần đo bằng thước kẹp

1. OLED: SKU/controller, W/H PCB, cả kính, lệch tâm vùng sáng, lỗ/spacing, stack,
   header và đầu cắm/dây; không ép kính để bù sai số.
2. Pin503048 đã mua: pack có PCM/JST, cực tính, dày/rộng/dài cả seal và dây;
   lấy datasheet dòng xả/sạc/PCM từ nhà bán/nhà sản xuất.
3. MT3608: đúng W/H PCB, tổng cao nhất, chân/mối hàn phía dưới, tọa độ pads và
   trục chỉnh biến trở; không cắt biến trở để vừa.
4. Tụ: Ø/chiều dài/lead pitch/khoảng uốn, mã điện áp/cực tính/series.
5. Charger: SKU/chip, PCB/USB và độ lùi cáp, resistor PROG/power-path/PCM.
6. Slide switch: thân/chốt/actuator/ren và định mức DC; hai tactile: travel/stem.
7. Header ESP32 đúng board, đầu UART bảo trì, dây thực và khoen tai.

## 12. Các phần nên in thử trước

Coupon: flange D-pad/red + switch thật; hốc OLED/PCB edge; một đoạn cradle ESP
cùng header; holder MT/charger/USB; khay pin bằng dummy cứng đúng kích thước;
cradle tụ bằng dummy; lỗ pilot M2 và counterbore; tai mèo với khoen và hướng lớp;
ngón tay 1.1 mm/khe0.4 mm; chân/skid và mối gắn vào đáy. Chưa ép pin thật vào
coupon. Chỉ in full enclosure sau khi sửa các số đo quyết định độ vừa và cơ cấu
giữ, thử nhiệt/nguồn trên bench riêng.

## 13. Bàn giao, tái tạo và kết luận

- CAD: `cad/hardware_review/BMO_HARDWARE_INTEGRATED.FCStd`.
- Source: `scripts/integrate_bmo_hardware.py`, `scripts/validate_export_bmo_hardware.py`.
- Tham số: `cad/hardware_review/parameters.json`; Spreadsheet và thuộc tính
  capacitor hiển thị trong CAD. **Đổi JSON rồi chạy lại source để dựng lại hình**;
  đổi property/spreadsheet đơn thuần không tự tái tạo mọi BRep cũ.
- Components STEP: pin503048, pin503040, MT3608, tụ2200uF; alternative503040 ẩn
  riêng trong CAD. Module giả định có nhãn DimensionEvidence.
- STL: `cad/hardware_review/prototype_stl/`, 9 file có hậu tố review.
- Ảnh: `01-front` / `02-side` / `03-back` / `04-exploded` / `05-cross-section` /
  `06-internal-hardware` / `07-battery-compartment` / `08-power-and-capacitor`,
  thêm `09-overall`, đuôi `.png` cùng thư mục. Đã mở xem nội thất và tổng thể.
- Evidence: baseline-inspection, cad-inventory, layout-search, integration-audit,
  mechanical-validation JSON. Không có báo cáo nhiệt/điện giả lập thành đo thật.

Chạy lần lượt qua FreeCAD MCP: inspect → integrate → validate/export; các script
có đường dẫn workspace cố định. Integrate mở lại baseline, không dựng lại BMO
từ đầu; nó đóng baseline đang mở mà không lưu chỉnh sửa trong bộ nhớ, nên phải
giữ các thay đổi thủ công cần thiết trước khi chạy. Source gốc và backup giữ riêng.

**Kết luận: `DESIGN_REVIEW_REQUIRED`.** Bố trí prototype và bộ file kiểm tra đã
được tạo thực. Hình học không giao, nắp đóng và đường bảo trì đã kiểm tra theo
giả định; nhưng còn tai mỏng, cơ cấu giữ cần coupon, module/connector chưa đo,
bán kính uốn và nguồn điện chưa xác minh. Chưa dùng `PROTOTYPE_READY` cho cả bộ
lắp hoàn chỉnh và tuyệt đối chưa dùng `PRINT_READY`. Các STL hiện tại phục vụ
review/coupon có kiểm soát, không phải khuyến nghị in sản phẩm hoàn thiện.
