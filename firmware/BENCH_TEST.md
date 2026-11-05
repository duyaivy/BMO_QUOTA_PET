# Nạp thử BMO trên ESP32-CAM

Phạm vi: dùng nguồn ngoài để kiểm tra firmware, OLED và nút trước. Chưa thiết kế pin/sạc. Board giả định AI-Thinker ESP32-CAM, OLED SSD1306 I2C 128×64 hỗ trợ nguồn 3.3V.

## Nối phần cứng

| Thiết bị | ESP32-CAM |
| --- | --- |
| OLED SDA | GPIO13 — giữ dây cũ |
| OLED SCL | GPIO14 — giữ dây cũ |
| OLED VCC / GND | 3V3 / GND |
| Nút cũ B | GPIO12 ↔ nút thường hở ↔ GND |
| Nút mới A (nếu có) | GPIO15 ↔ nút thường hở ↔ GND |
| Nguồn ngoài 5V ổn định | 5V / GND |
| USB-UART TX, logic 3.3V | U0R / GPIO3 |
| USB-UART RX, logic 3.3V | U0T / GPIO1 |
| USB-UART GND | GND chung |

Tháo HX711/load cell, còi ngoài và microSD khỏi mạch thử. Không nối pin/sạc. Với nguồn ngoài, để VCC của USB-UART không nối để tránh cấp nguồn song song. Không đưa 5V vào GPIO/3V3. Không kéo GPIO12 lên nguồn bằng điện trở ngoài.

Chưa có nút A vẫn thử OLED và nút B được; GPIO15 để hở sẽ dùng pull-up trong firmware. Nút B ở bản offline báo danh sách quota trống rồi tự quay lại mặt BMO sau 3 giây. Không tạo quota giả. Muốn thử chuyển đủ 6 biểu cảm, thêm nút A GPIO15–GND.

## Build và nạp

Chạy lệnh từ thư mục gốc repository, với PlatformIO Core trên PATH:

```sh
pio run -d firmware -e esp32cam_bench
pio device list
```

Bản `esp32cam_bench` không khởi động Wi-Fi/MQTT; không cần nhập tài khoản hoặc mật khẩu. Nếu đã có `firmware/include/config.local.h`, kiểm tra cấu hình nhánh ESP32-CAM: SDA=13, SCL=14, A=15, B=12. File local ghi đè toàn bộ mẫu. Địa chỉ OLED mặc định 0x3C, chỉ đổi thành 0x3D khi module thực dùng địa chỉ đó.

1. Nối GPIO0 với GND, reset board để vào chế độ nạp.
2. Nạp vào đúng cổng USB-UART tìm được bằng `pio device list` (thay PORT bằng đường dẫn cổng thực):

```sh
pio run -d firmware -e esp32cam_bench -t upload --upload-port PORT
```

3. Tháo dây GPIO0–GND, nhấn reset để chạy chương trình.
4. Mở log:

```sh
pio device monitor --port PORT --baud 115200
```

Nếu không kết nối được bootloader, kiểm tra TX/RX, GND và GPIO0/reset; thử giảm upload_speed trong platformio.ini xuống 115200 nếu đường truyền không ổn định.

## Kiểm tra thực tế

- Serial in `SDA=13 SCL=14 address=0x3C`, thông báo `[BENCH] Offline OLED/buttons test`, rồi boot complete.
- OLED hiện splash BMO, tiếp theo mặt hoạt hình. I2C ACK chỉ chứng minh có thiết bị phản hồi, chưa xác nhận đúng controller hoặc hình ảnh.
- Nếu có `No I2C ACK`, firmware dừng trước giao diện: kiểm tra nguồn, dây và địa chỉ OLED. Nếu ACK nhưng màn hình sai/trống, xác nhận SSD1306 hay SH1106 và kích thước trước khi đổi driver.
- Nút A: bấm/nhả lần lượt qua 6 biểu cảm rồi quay vòng. Nút B: báo không có quota rồi tự về mặt sau 3 giây. Bấm nhanh/giữ nút không làm treo máy.
- Reset khi nhả nút và khi giữ từng nút; board phải chạy lại. GPIO12/15 là chân strap nên thử trên board thực là bắt buộc.
- Chạy ít nhất 10 phút, kiểm tra reset bất thường và log lỗi; để không thao tác 5 phút để thử ngủ màn hình, bấm nút để đánh thức.

Ghi kết quả và log thực, không đánh dấu đạt chỉ vì build thành công. Sau khi OLED/nút đạt, dùng môi trường `esp32cam` với Wi-Fi/MQTT cấu hình trong file local để kiểm tra dữ liệu quota thật. Wi-Fi/TLS và dòng tải khi bật radio chưa được kiểm chứng bằng bản offline.

## Kiểm tra trên máy phát triển

`python3 tests/firmware/native/navigation_test.py` kiểm tra logic điều hướng production trên host. Build PlatformIO kiểm tra khả năng biên dịch/link firmware; hai kiểm tra này không thay thế việc nạp và quan sát board.

Kết quả 2026-11-03: host navigation PASS; PlatformIO 6.1.18 / Espressif32 6.9.0 build cả `esp32cam` và `esp32cam_bench` PASS. Bản offline: RAM tĩnh 34,320 byte, flash 613,889 byte; bản mạng: RAM tĩnh 53,920 byte, flash 977,881 byte (không phải RAM đỉnh khi chạy). Còn warning deprecated `containsKey` trong parser. Chưa nạp vì `pio device list` chưa thấy USB-UART của board.

PlatformIO được cài riêng trong thư mục tạm của máy này. Khi chưa có `pio` trên PATH, có thể dùng môi trường đã build ở phiên này:

```sh
export PLATFORMIO_CORE_DIR=/private/tmp/bmo-platformio-core
export PATH="/private/tmp/bmo-pio-venv/bin:$PATH"
```

Các thư mục tạm có thể bị hệ thống dọn; khi đó cài PlatformIO Core/IDE trước khi dùng lại các lệnh. Binary nằm ở `firmware/.pio/build/esp32cam_bench/firmware.bin`; dùng lệnh upload ở trên để nạp cả bootloader/partition đúng địa chỉ, không tự nạp riêng file này tại địa chỉ 0.
