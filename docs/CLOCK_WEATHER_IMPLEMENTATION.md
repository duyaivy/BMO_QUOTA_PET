# Bằng chứng triển khai Clock & Thời tiết (BMO)

Phạm vi đã được phê duyệt: [Kế hoạch triển khai](superpowers/plans/2026-11-15-clock-weather-on-wake.md) và [Tài liệu thiết kế](superpowers/specs/2026-11-15-clock-weather-wake-design.md), ngày 15-11-2026. Hai agent phụ trách triển khai độc lập (server/web và firmware), agent chính phụ trách rà soát và tích hợp. Việc triển khai, bật monitor, tạo secret thật hoặc nạp ESP đã được phân định ranh giới rõ ràng.

## Tính năng đã hoàn thành

- **Đồng hồ số đứng đầu nhóm biểu cảm:** Định dạng `HH:MM`, thứ và ngày/tháng theo giờ Việt Nam (UTC+7), icon thời tiết tĩnh và nhiệt độ; chỉ vẽ lại khi giá trị hiển thị thay đổi (dirty check).
- **Một phiên mạng duy nhất khi boot/bấm nút đánh thức:** Tự động ngắt kết nối sớm ngay khi nhận đủ dữ liệu (cấu hình retained, quota khớp phiên bản, thời tiết); ngân sách kết nối vô tuyến tối đa 20 giây. Sau 5 phút không có thao tác, CPU tự vào chế độ light-sleep và chỉ đánh thức bằng nút bấm vật lý. Thao tác bấm đánh thức được triệt tiêu đến khi thả nút để không gây click giả.
- **Người dùng tự chọn địa điểm trên trang `/devices`:** Tích hợp Geocoding từ nguồn tin cậy Open-Meteo, lưu trữ và giải quyết xung đột bằng revision CAS, cơ chế poll có giới hạn (tối đa 30s); múi giờ đồng hồ trên thiết bị luôn cố định UTC+7.
- **Kích hoạt cập nhật thời tiết qua HEAD/GET có token:** Khóa cứng chu kỳ 15 phút chống spam (durable due gate), cache/fencing từ nhà cung cấp, hàng đợi outbox MQTT và gửi retained. Dữ liệu thời tiết có hiệu lực 60 phút tính từ thời điểm ghi nhận nguồn (`dataAt`), không phụ thuộc vào các lần thử lại.
- **Mặc định an toàn:** Tính năng thời tiết mặc định tắt (`BMO_WEATHER_ENABLED=false`) và danh sách cho phép (`BMO_WEATHER_DEVICE_IDS`) rỗng. Hướng dẫn kích hoạt chi tiết xem tại [WEATHER_SCHEDULING.md](WEATHER_SCHEDULING.md).

## Hồ sơ kiểm chứng thực tế (Verification Record)

Toàn bộ các bộ kiểm tra cục bộ đã được chạy mới vào ngày 16-11-2026 (giờ Việt Nam UTC+7 / Node v24.18.0 / pnpm 11.24.0) và đạt 100% không có lỗi regression:

### 1. Kiểm tra Firmware trên máy chủ & Native Harness (7/7 đạt)

```bash
python3 tests/firmware/native/weather_test.py
# Weather parser behavior passed
python3 tests/firmware/native/wake_session_test.py
# Wake session state/deadline behavior passed
python3 tests/firmware/native/buttons_test.py
# Wake press consumption passed
python3 tests/firmware/native/power_test.py
# Inactivity policy behavior passed
python3 tests/firmware/native/clock_test.py
# Clock formatting/dirty render behavior passed
python3 tests/firmware/native/navigation_test.py
# Production navigation: face wrap, quota end/empty return, activity dispatch passed
python3 tests/firmware/native/render_clock.py --preview /tmp/bmo-clock-preview/index.html
# Production clock preview: /tmp/bmo-clock-preview/index.html (4 frames)
```

### 2. Biên dịch PlatformIO (2/2 môi trường THÀNH CÔNG)

```bash
/Users/apple/.platformio/penv/bin/pio run -d firmware -e esp32cam -e esp32cam_bench
# esp32cam:       SUCCESS (RAM: 26.9%, Flash: 57.7%)
# esp32cam_bench: SUCCESS (RAM: 26.7%, Flash: 51.4%)
```

### 3. Kiểm tra mã nguồn Web & Server (Tất cả ĐẠT)

- **Production Build:** `pnpm build` → Thành công biên dịch Next.js 16.4.3 production build sạch, toàn bộ 21 dynamic/API routes và static pages được tạo thành công.
- **Unit & Persistence Tests:** `pnpm test:unit` → 35/35 test files đạt (195/195 tests), bao gồm schema hợp đồng weather, tìm kiếm địa điểm, provider, settings route, CAS delivery, HTTP HEAD trigger auth và MQTT outbox drain.
- **Strict TypeScript:** `pnpm typecheck` → Sinh route types và kiểm tra kiểu nghiêm ngặt `tsc --noEmit` sạch lỗi.
- **ESLint:** `pnpm lint` → 0 cảnh báo, 0 lỗi (`--max-warnings=0`).
- **Prettier:** `pnpm format:check` → Toàn bộ file mã nguồn và tài liệu tuân thủ chuẩn định dạng.
- **Integration Tests:** `pnpm test:integration` → 24/24 Playwright tests đạt trên production server nội bộ (bao gồm tìm kiếm/lưu địa điểm, xử lý xung đột 409, khôi phục khi tìm rỗng và các nghiệp vụ quota/status hiện có).
- **Kiểm tra Whitespace / Conflict:** `git diff --check` → Sạch lỗi (exit code 0).

### 4. Kết quả kiểm tra giao diện trực quan

- **Bản xem trước OLED Clock:** `/tmp/bmo-clock-preview/index.html` với 4 khung hình PNG chuẩn pixel (128x64 phóng to 4x thành 512x256):
  - `leap-midnight.png` (Năm nhuận 29/02/2024 lúc 00:00, hiển thị `T5 29/02`)
  - `new-year-2359-minus-100.png` (Đêm giao thừa 31/12/2024 lúc 23:59 ở mức cực lạnh -100°C, icon tuyết)
  - `new-year-0000-plus-70.png` (Năm mới 01/01/2025 lúc 00:00 ở mức cực nóng +70°C, icon trời quang)
  - `unknown-time.png` (Giờ `--:--`, không hiển thị ngày hoặc thời tiết giả khi chưa đồng bộ giờ)
- **Ảnh chụp giao diện Web:**
  - Bản Desktop: `/tmp/bmo-weather-desktop.png` (1280x1840)
  - Bản Mobile: `/tmp/bmo-weather-mobile.png` (390x2607)

### Dữ liệu mẫu Collector (Baseline Fixtures)

Ban đầu có 3 ca kiểm tra collector bị lỗi do mốc thời gian cố định tháng 10 hết hạn so với giờ thực tế. Các fixture này đã được cập nhật thành mốc thời gian tương đối mà không làm thay đổi hành vi nghiệp vụ của collector; toàn bộ 15 tests của collector đã chạy lại và đạt.

## Đánh giá rà soát và Giới hạn thực tế

Agent chính đã rà soát tính tương thích giao thức, thứ tự retained/phục hồi, kiểm tra token trước khi truy cập DB, xử lý đổi địa điểm đồng thời, hạn mức thời gian toàn bộ tác vụ, xử lý trùng lặp gói tin retained, bộ đệm gói tin cố định trên firmware, triệt tiêu nút bấm khi đánh thức và bố cục hiển thị đồng hồ ở các mức nhiệt độ cực hạn.

### Giới hạn phần cứng & môi trường Cloud thật:

- **Pin & Dòng tiêu thụ:** Các bài test trên máy chủ không thể đo lường dòng tiêu thụ pin, điện trở kéo chân GPIO12/15 khi ngủ, thời điểm cắt Wi-Fi thực tế hoặc thời gian giải phóng tác vụ TLS khi ngắt kết nối trên board mạch thật. Sau thời hạn phiên mạng, vòng lặp chính sẽ chủ động tắt radio, nhưng tác vụ TLS đồng bộ có thể cần thêm thời gian để giải phóng. Các thông số này cần đo đạc thực tế theo hướng dẫn tại [firmware/BENCH_TEST.md](../firmware/BENCH_TEST.md).
- **Hạ tầng Production:** Hoạt động thực tế trên Vercel, Turso từ xa, MQTT broker bên ngoài, các lượt gọi định kỳ 15 phút từ Uptime Monitor và quá trình gửi retained đến thiết bị ESP32 thực tế cần được kiểm chứng khi đưa lên môi trường thật. Báo cáo này không tự ý đánh dấu hoàn thành các phase triển khai trước đó.
