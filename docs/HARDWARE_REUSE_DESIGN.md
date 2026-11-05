# Thiết kế tái sử dụng phần cứng dự án cũ cho BMO

Ngày: 2026-11-03. Trạng thái: đề xuất thiết kế, chưa sửa firmware, chưa kiểm chứng trên bàn thử.

Tiếp nối cùng ngày: chủ dự án yêu cầu hoãn pin/sạc, ưu tiên build/nạp thử nguồn ngoài. Cấu hình chân và bản offline đang được triển khai theo [hướng dẫn bench](../firmware/BENCH_TEST.md); các mục nguồn phía dưới vẫn chỉ là đề xuất cho bước sau.

Đầu vào: bảng chân trong `image copy.png`, sơ đồ minh họa `image.png`, phạm vi BMO trong `docs/PROJECT_SCOPE.md` và firmware hiện có. Ưu tiên bảng chân người dùng cung cấp; không suy ra kết nối chỉ từ màu dây trong ảnh.

## 1. Phương án đề xuất

Giữ ESP32-CAM và OLED, giữ nguyên SDA GPIO13 / SCL GPIO14. Giữ nút cũ GPIO12–GND làm Button B (quota); thêm một nút GPIO15–GND làm Button A (biểu cảm). Bỏ HX711 và load cell vì BMO không có chức năng cân. Bản cơ sở không dùng còi, camera hoặc microSD.

Giả định board là AI-Thinker ESP32-CAM hoặc bản tương thích đúng sơ đồ; OLED là I2C 4 chân SSD1306 128×64 và hoạt động ở 3.3V. Ảnh chưa đủ để xác nhận controller OLED, mã nguồn, pin hoặc biến thể board. Nếu OLED là SH1106, có thể giữ phần cứng/chân nhưng phải đổi driver sau.

## 2. Giữ / bỏ / bổ sung

| Linh kiện cũ | Quyết định | Điều kiện / lý do |
| --- | --- | --- |
| ESP32-CAM | Giữ | Xác nhận biến thể board; không cần thay chỉ để chạy BMO |
| OLED | Giữ cùng chân tín hiệu | Xác nhận controller, 128×64, mức nguồn và điện trở kéo lên I2C |
| Nút nhấn GPIO12–GND | Giữ | Nút thường hở, không có mạch kéo lên ngoài tới nguồn |
| HX711 DT GPIO2 / SCK GPIO15 | Tháo khỏi mạch BMO | Không còn đo khối lượng; giải phóng GPIO2/15 |
| Load cell | Tháo khỏi mạch BMO | Không thuộc chức năng quota/PET |
| Còi GPIO4 | Tháo trong bản cơ sở | Không có yêu cầu âm thanh; GPIO4 dùng chung LED flash trên board phổ biến |
| Công tắc nguồn | Giữ có điều kiện | Đủ dòng DC cho đường nguồn pin/boost; kiểm tra tiếp điểm |
| Pin 1 cell | Giữ có điều kiện | Xác nhận hóa học, điện áp sạc, dòng xả/sạc, tình trạng và bảo vệ |
| Mạch sạc trông giống TP4056 | Chưa chốt | Xác nhận mã, bảo vệ, dòng sạc phù hợp pin; không mặc định có power-path |
| Module nguồn có cuộn cảm 220 | Chưa chốt | Nếu là LM2596 buck thì thay bằng boost 1S→5V cho phương án bên dưới |
| Nút thứ hai | Thêm 1 | Nút thường hở GPIO15–GND |
| Nguồn 5V ổn định / bộ nâng áp | Bổ sung theo nguồn cũ | Chọn theo dòng đầu ra thực ở điện áp pin thấp, không theo dòng công tắc quảng cáo |

## 3. Bảng nối dây đề xuất

Số GPIO là số in dạng IOxx trên board, không phải thứ tự chân header.

| Tín hiệu | Cũ | Đề xuất BMO | Hành động |
| --- | --- | --- | --- |
| OLED SDA | GPIO13 | GPIO13 | Giữ nguyên |
| OLED SCL | GPIO14 | GPIO14 | Giữ nguyên |
| OLED VCC | Bảng cũ không ghi | 3V3 của ESP32-CAM | Chỉ dùng nếu module hỗ trợ 3.3V; pull-up SDA/SCL về 3.3V |
| OLED GND | Không ghi | GND chung | Kiểm tra lại dây |
| Nút cũ chân 1 | GPIO12 | GPIO12, Button B | Giữ nguyên |
| Nút cũ chân 2 | GND | GND | Giữ nguyên |
| Nút mới chân 1 | Chưa có | GPIO15, Button A | Thêm sau khi tháo HX711 |
| Nút mới chân 2 | Chưa có | GND | Thêm |
| HX711 DT / SCK | GPIO2 / GPIO15 | Không nối | Tháo cả nguồn và tín hiệu HX711 |
| Còi (+) | GPIO4 | Không nối | Tháo còi ngoài; để GPIO4 dành cho LED flash |
| Nguồn ESP32-CAM | Chưa xác nhận | 5V ổn định → chân 5V; mass → GND | Không cấp pin 1S trực tiếp vào 5V/3V3 |

GPIO12 là chân strap chọn điện áp flash: trên board flash 3.3V phải LOW khi lấy mẫu reset. Giữ nút chỉ kéo xuống GND; chỉ bật INPUT_PULLUP trong firmware sau boot. Không thêm pull-up ngoài vào GPIO12. Không khẳng định boot bảo đảm trước khi kiểm tra board thực.

GPIO15 cũng là chân strap; kéo LOW khi khởi động ảnh hưởng log ROM trên cấu hình ESP32 thông thường. Dùng làm nút có điều kiện kiểm tra reset với nút nhấn/nhả. Không dùng microSD đồng thời với các chân này. Không dùng GPIO16 như chân dự phòng mặc định vì có thể nối PSRAM; để GPIO1/3 cho UART, GPIO0 cho nạp firmware.

## 4. Nguồn đề xuất

Thử phần logic trước bằng nguồn 5V ổn định, mục tiêu khả năng cấp ít nhất 1A tại đầu ra, dây ngắn, đưa vào chân 5V của board. Đây là dự phòng thiết kế, không phải dòng tiêu thụ đã đo. OLED lấy 3.3V từ board nếu module tương thích.

```text
USB 5V → mạch sạc 1S có bảo vệ ↔ pin 1S
                  OUT+ → công tắc → boost 5V IN+
                  OUT− ─────────→ boost IN−
                                  boost OUT+ → ESP32-CAM 5V
                                  boost OUT− → ESP32-CAM GND
                                               ├─ OLED GND
                                               └─ hai nút về GND
ESP32-CAM 3V3 → OLED VCC
ESP32-CAM IO13 → OLED SDA
ESP32-CAM IO14 → OLED SCL
```

Sơ đồ trên áp dụng khi xác nhận module có B+/B− và OUT+/OUT− đúng chức năng: pin nối B+/B−, tải nối OUT+/OUT− để không bỏ qua bảo vệ. Với module sạc đơn giản chưa xác nhận load-sharing, tắt tải khi sạc. Nếu cần vừa chạy vừa sạc, chọn thiết kế charger/power-path phù hợp và giữ bảo vệ pin; chưa chốt mã mua khi chưa biết pin/module thực tế.

Module trong ảnh có hình dạng giống buck LM2596, nhưng chưa đọc được mã IC. Nếu đúng LM2596: đây là bộ hạ áp, đầu vào tối thiểu 4.5V theo TI, không phù hợp nâng pin 1S lên 5V. Không áp dụng sơ đồ LDO 3.3V trong tài liệu cũ như giải pháp mặc định cho toàn dải pin 1S.

Tụ đầu vào/đầu ra theo datasheet bộ nguồn được chọn; cân nhắc tụ dự trữ 220–470µF tại 5V gần board nếu bộ nguồn cho phép, kiểm tra bằng đo sụt áp. Khi nạp dùng UART logic 3.3V, TX→GPIO3, RX←GPIO1, GND chung, GPIO0→GND chỉ lúc nạp; nguồn board 5V riêng đủ dòng. Không nối hai nguồn 5V cùng lúc khi chưa có mạch chống cấp ngược.

## 5. Thay đổi code sau khi chốt thiết kế

Chưa thực hiện trong bước này. Cấu hình ESP32-CAM hiện tại dùng SDA=15, SCL=14, Button A=13, Button B=12. Cấu hình đích: SDA=13, SCL=14, Button A=15, Button B=12. Cần đồng bộ config mẫu/local, chú thích display/main và hướng dẫn hardware/README; không đổi nhánh board khác. Xác nhận controller và địa chỉ I2C thực, không mặc định địa chỉ chỉ qua ảnh.

`firmware/HARDWARE.md` hiện chưa khớp thiết kế này: bảng chân cũ, phương án nguồn LDO và gợi ý GPIO16 cần được xem lại trước khi dùng để lắp. Tài liệu này là đề xuất thay thế cho phần wiring; chưa chứng nhận khả năng hoạt động thực tế.

## 6. Điều kiện kiểm chứng trước lắp hoàn chỉnh

- Xác nhận mã board, OLED, IC nguồn/sạc; thông số pin và nhu cầu vừa sạc vừa chạy.
- Đo nguồn, cực tính và mức pull-up I2C trước khi nối OLED/ESP32; tháo microSD.
- Sau bước chỉnh firmware riêng: scan I2C, kiểm tra hiển thị 128×64, nút/giữ nút khi reset, nạp lại và Wi-Fi reconnect.
- Đo sụt áp/nhiệt khi Wi-Fi hoạt động và khi pin xuống thấp; kiểm tra bảo vệ/sạc theo module. Chưa ước tính thời lượng pin khi chưa đo dòng trung bình.

## Nguồn kỹ thuật

- [Espressif ESP32 datasheet](https://documentation.espressif.com/esp32_datasheet_en.html): GPIO matrix, strapping, flash/PSRAM.
- [Espressif SD pull-up requirements](https://docs.espressif.com/projects/esp-idf/en/v5.2.2/esp32/api-reference/peripherals/sd_pullup_requirements.html): GPIO12 và yêu cầu điện áp flash.
- [TI LM2596](https://www.ti.com/product/LM2596): bộ hạ áp, đầu vào từ 4.5V.
- [Microchip AN1149](https://www.microchip.com/en-us/application-notes/an1149): quản lý đường nguồn và tải khi sạc Li-ion.

Đối chiếu ảnh/tài liệu và đọc cấu hình hiện có; chưa chạy build/test vì chỉ thêm tài liệu, chưa flash hay đo phần cứng.
