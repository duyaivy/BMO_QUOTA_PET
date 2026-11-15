# Hướng Dẫn Cấu Hình Lịch Cập Nhật Thời Tiết (Uptime Monitor)

Dữ liệu thời tiết trên BMO được làm mới tự động bởi một dịch vụ **Uptime Monitor** bên ngoài (ví dụ: Better Uptime, UptimeRobot, Cron-Job.org, v.v.). Cơ chế này giúp server cập nhật thời tiết định kỳ mà không cần duy trì tiến trình chạy ngầm hay dùng cron của Vercel.

---

## 1. Cấu Hình Uptime Monitor

Thiết lập một giám sát mới trong dịch vụ Uptime Monitor của bạn với các thông số sau:

- **Phương thức HTTP (Method):** `HEAD` (Bắt buộc; endpoint chỉ trả về header, không có body, giúp tiết kiệm băng thông và tài nguyên Function tối đa).
- **URL yêu cầu:** `https://<ten-mien-production>/api/internal/weather/refresh`
  _(Sử dụng trực tiếp domain HTTPS chính thức, không qua chuyển hướng redirect)_.
- **Tần suất (Interval):** Mỗi **15 phút** (900 giây).
- **Thời gian chờ (Timeout):** Tối thiểu **30 giây** (Function được cấp ngân sách 25 giây để hoàn thành fetch Open-Meteo và publish MQTT).
- **Xác thực (Authentication):**
  - **Cách ưu tiên (Khuyên dùng):** Thêm HTTP Request Header:
    ```http
    Authorization: Bearer <TOKEN_32_BYTE>
    ```
  - **Cách phụ (Dành cho monitor không hỗ trợ custom header):** Thêm token vào query parameter của URL:
    ```http
    https://<ten-mien-production>/api/internal/weather/refresh?token=<TOKEN_32_BYTE>
    ```
  - _Lưu ý: Chỉ chọn một trong hai cách, không gửi cả hai cùng lúc._

---

## 2. Tạo Và Lưu Trữ Token Bí Mật

Để đảm bảo an toàn, server **không bao giờ lưu trữ token thô**:

1. **Tạo token ngẫu nhiên:** Tạo một chuỗi ngẫu nhiên 32-byte an toàn (định dạng hex hoặc base64url).
   _Ví dụ lệnh tạo trên Terminal:_
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. **Tính mã băm SHA-256:** Tính toán chuỗi SHA-256 hex digest của token vừa tạo:
   _Ví dụ lệnh tính hash:_
   ```bash
   node -e "console.log(require('crypto').createHash('sha256').update('<TOKEN_VUA_TAO>').digest('hex'))"
   ```
3. **Cấu hình trên Server (Vercel Environment Variables):**
   - Đặt biến: `BMO_WEATHER_TRIGGER_TOKEN_SHA256=<CHUOI_HEX_SHA256>`
   - Biến này chứa 64 ký tự hex của mã băm SHA-256.
4. **Cấu hình trên Uptime Monitor:**
   - Nhập chuỗi `<TOKEN_VUA_TAO>` thô vào phần Header `Authorization` hoặc tham số `?token=`.
5. **Cơ chế xác thực an toàn:**
   - Endpoint sẽ băm token nhận được và so sánh với giá trị trong biến môi trường bằng thuật toán `timingSafeEqual` (chống timing attack).
   - Mọi request không có token, sai token, hoặc định dạng lỗi sẽ bị từ chối với mã lỗi `401 Unauthorized` ngay lập tức trước khi truy vấn cơ sở dữ liệu.

---

## 3. Mã Trạng Thái HTTP & Ý Nghĩa (Responses)

| HTTP Status                 | Header `X-BMO-Weather-Result` | Ý nghĩa                                                                             |
| :-------------------------- | :---------------------------- | :---------------------------------------------------------------------------------- |
| **200 OK**                  | `updated`                     | Đã lấy thời tiết mới từ Open-Meteo và đưa vào hàng đợi MQTT outbox.                 |
| **200 OK**                  | `unchanged`                   | Dữ liệu thời tiết tại nguồn không thay đổi so với bản ghi trước.                    |
| **200 OK**                  | `not_due`                     | Chưa đủ 15 phút (900s) kể từ lần gọi thành công trước đó (bảo vệ chống spam/retry). |
| **200 OK**                  | `busy`                        | Đang có một tác vụ khác giữ lease cập nhật.                                         |
| **200 OK**                  | `unconfigured`                | Chưa có địa điểm nào được lưu trên web `/devices`.                                  |
| **200 OK**                  | `disabled`                    | Biến `BMO_WEATHER_ENABLED` chưa bật (`false`).                                      |
| **401 Unauthorized**        | —                             | Token không hợp lệ, thiếu token, hoặc sai định dạng.                                |
| **503 Service Unavailable** | `failed` / `misconfigured`    | Lỗi kết nối provider, lỗi cơ sở dữ liệu Turso, hoặc thiếu cấu hình server.          |
| **405 Method Not Allowed**  | —                             | Gọi sai phương thức (chỉ hỗ trợ `HEAD`, `GET`, `OPTIONS`).                          |

> [!NOTE]
>
> - Khi monitor gửi request `HEAD`, response body luôn luôn rỗng (độ dài 0 byte).
> - Bạn có thể dùng trình duyệt hoặc Postman gửi request `GET` kèm token để xem thông tin chi tiết dạng JSON phục vụ kiểm tra chẩn đoán lỗi thủ công.
> - Mã `200 OK` với `not_due` hoặc `busy` có nghĩa là request đã được xử lý an toàn, không có nghĩa là dữ liệu thời tiết mới vừa được nạp.

---

## 4. Quản Lý Vòng Đời Dữ Liệu Thời Tiết

- **Nguồn dữ liệu:** Cung cấp bởi Open-Meteo (Geocoding API và Current Weather API).
- **Hạn sử dụng thời tiết (TTL):** Đúng **60 phút** tính từ thời điểm dữ liệu được sinh tại nguồn (`dataAt`). Các lần gọi monitor bị trễ hoặc thử lại thất bại **không làm tăng thời hạn này**.
- **Bảo toàn khi lỗi:** Nếu Open-Meteo gặp sự cố hoặc timeout (5s), hệ thống giữ nguyên bản ghi thời tiết hợp lệ cuối cùng trong cache, không ghi đè dữ liệu rỗng.
- **Phát dữ liệu tới ESP32:** ESP32 nhận bản tin thời tiết qua cơ chế **MQTT Retained message** khi kết nối mạng lúc đánh thức. Server không chủ động đánh thức thiết bị.

---

## 5. Danh Sách Kiểm Tra Trước Khi Kích Hoạt (Pre-Activation Checklist)

1. [ ] Đã chạy migration cơ sở dữ liệu `0006_weather_cache.sql` trên Turso Cloud.
2. [ ] Đã cấu hình các biến môi trường trên Vercel:
   - `BMO_WEATHER_ENABLED=true`
   - `BMO_WEATHER_DEVICE_IDS=["bmo-local"]` (chỉ đưa ID thiết bị đã nạp firmware mới)
   - `BMO_WEATHER_TRIGGER_TOKEN_SHA256=<chuoi_hex_64_ky_tu>`
3. [ ] Broker MQTT hỗ trợ cờ **Retained Message** với QoS 1 trên topic `bmo/v1/devices/<deviceId>/weather`.
4. [ ] Nếu Vercel bật _Deployment Protection_, hãy thêm bypass rule cho Uptime Monitor để request `HEAD` tới được Function.
5. [ ] Đăng nhập vào trang `/devices` trên giao diện web, tìm kiếm và nhấn **"Lưu địa điểm"**.
6. [ ] Kiểm tra nhật ký của Uptime Monitor để đảm bảo nhận được HTTP `200` với header `X-BMO-Weather-Result: updated`.
