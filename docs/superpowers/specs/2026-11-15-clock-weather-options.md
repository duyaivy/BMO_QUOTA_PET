# Đồng hồ và thời tiết trên BMO ESP32 — các hướng để chủ dự án duyệt

> Cập nhật sau lựa chọn của chủ dự án: đã chọn B và điều chỉnh thành **chỉ lấy dữ liệu khi người dùng đánh thức**, server cập nhật mỗi **15 phút** trên Vercel. Xem [thiết kế cập nhật](2026-11-15-clock-weather-wake-design.md) và [plan mới](../plans/2026-11-15-clock-weather-on-wake.md). Lịch ESP tự thức 30 phút dưới đây chỉ còn là phương án khảo sát cũ.

Ngày: 2026-11-15. Trạng thái: **ĐỀ XUẤT, CHƯA CHỐT, CHƯA TRIỂN KHAI**.

Tài liệu này dùng để chọn hướng. Sau khi bạn chọn, mới hoàn thiện thiết kế và kế hoạch thực hiện. Không coi tài liệu này là phê duyệt thay đổi firmware, hợp đồng MQTT hay triển khai dịch vụ.

## 1. Yêu cầu đã nhận

- Thêm đồng hồ số **HH:MM**, không vẽ mặt đồng hồ kim, không cần giây.
- Đồng hồ là màn hình đầu tiên ở “bên icon”.
- Có thứ, ngày, tháng; trang trí nhẹ bằng icon thời tiết như nắng, mây, mưa.
- Ưu tiên giảm tải cho ESP32 và tiết kiệm pin.
- Khảo sát và đưa các hướng vào Markdown để chủ dự án chọn trước khi làm.

**Giả định cần bạn chốt:** “bên icon” là nhóm mặt/biểu cảm do nút A điều khiển, không phải nhóm icon nhà cung cấp quota của nút B. Đề xuất khởi động vào đồng hồ; nút A lần lượt chuyển Đồng hồ → Happy → các biểu cảm còn lại → Đồng hồ. Nút B từ nhóm này mở quota như hiện tại. Nút A từ quota trở về đồng hồ. Đây là đề xuất, chưa phải hành vi đã được duyệt.

## 2. Hiện trạng đã kiểm tra trong mã nguồn

| Phần        | Hiện có                                                                  | Ý nghĩa với tính năng mới                                                        |
| ----------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Phần cứng   | ESP32-CAM, OLED SSD1306 đơn sắc 128×64                                   | Dùng chữ và bitmap nhỏ, không dùng ảnh màu                                       |
| Giờ         | `firmware/src/wifi_manager.cpp` đã cấu hình SNTP, có `time()` và HH:MM   | Tận dụng đồng hồ hệ thống, không cần nhận giờ mỗi phút qua MQTT                  |
| Múi giờ     | Giá trị mẫu `BMO_GMT_OFFSET_SEC` đang là 0                               | Đề xuất Việt Nam UTC+7; chưa xác minh cấu hình riêng của thiết bị                |
| Điều hướng  | `navigation.cpp` mặc định PET/Happy; A đổi biểu cảm, B chuyển quota      | Đồng hồ nên là một trang riêng trong nhóm A, giữ ID biểu cảm hiện có             |
| Vẽ màn hình | `main.cpp` gọi render theo nhịp animation khoảng 30 FPS                  | Đồng hồ cần cơ chế chỉ vẽ lại khi nội dung đổi                                   |
| Ngủ         | `power_manager.cpp` tắt OLED sau 5 phút; CPU đặt 160 MHz                 | Chưa có chế độ ngủ CPU/ngắt mạng tương ứng; tắt OLED không đồng nghĩa ESP đã ngủ |
| MQTT        | Có config/snapshot retained, TLS, outbox và maintenance                  | Có nền tảng gửi dữ liệu; chưa có hợp đồng thời tiết                              |
| Hợp đồng    | `src/contracts/mqtt/index.ts` chỉ cho `config`, `snapshot`, PET và quota | Không thể tự thêm trường weather/topic rồi coi hệ thống hiện tại đã hỗ trợ       |

Roadmap ghi Phase 3 đã kiểm chứng cục bộ; Phase 4 còn thiếu xác nhận phần cứng. Một số mô tả trong AGENTS/README cũ hơn mã nguồn. Tài liệu này dựa trên mã đã đọc và roadmap, không coi việc có code là bằng chứng pin, OLED hay broker production đã đạt.

## 3. Phân chia công việc hợp lý

**Đồng hồ:** ESP đồng bộ SNTP khi có mạng, sau đó tự giữ giờ và tính thứ/ngày. Đổi phút thì vẽ lại HH:MM; đổi ngày thì cập nhật ngày. Không gửi “tick” từ server. Mất mạng sau khi đã đồng bộ vẫn xem được giờ; sai số khi chạy offline cần đo. Mất nguồn hoàn toàn rồi khởi động lại mà chưa có mạng thì hiển thị `--:--`, không dùng giờ lưu cũ như giờ hiện tại. ESP có bộ đếm RTC nội bộ nhưng không thay thế đồng hồ có pin dự phòng khi mất nguồn. [Espressif: System Time](https://docs.espressif.com/projects/esp-idf/en/v4.4/esp32/api-reference/system/system_time.html).

**Thời tiết:** server lấy dữ liệu theo địa điểm đã cấu hình, ánh xạ điều kiện thành mã icon, lưu bản mới nhất rồi gửi MQTT retained. ESP chỉ đọc bản tin nhỏ và chọn bitmap trong firmware. Không tải icon, gọi API thời tiết hay giải mã JSON lớn trên ESP.

“Realtime” ở đây là gửi bản mới ngay khi server cập nhật và ESP đang online. Không cần lấy thời tiết từng giây. Đề xuất ban đầu: server lấy mỗi **30 phút**, đánh dấu cũ sau **90 phút** tính từ thời điểm dữ liệu thời tiết; lịch trễ hoặc lỗi API không được làm dữ liệu cũ thành mới. Các khoảng này là lựa chọn thiết kế để bạn duyệt.

## 4. Ba hướng để chọn

| Hướng                                               | Cách hoạt động                                                                                                                   | Lợi ích                                                                          | Đánh đổi                                                                                         |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **A — Giữ MQTT liên tục**                           | Đồng hồ tự chạy; server gửi thời tiết mỗi 30 phút; ESP giữ mạng, chỉ vẽ khi nội dung đổi                                         | Ít thay đổi nền tảng; quota nhận ngay khi online; phù hợp ưu tiên cập nhật nhanh | Wi-Fi vẫn hoạt động dù đồng hồ rất nhẹ; mức tiết kiệm pin có giới hạn                            |
| **B — Kết nối theo đợt, ưu tiên pin (khuyến nghị)** | Đồng hồ tự chạy; ESP bật mạng khoảng mỗi 30 phút để nhận retained quota/thời tiết rồi tắt; có thể yêu cầu cập nhật khi vào quota | Giảm thời gian bật radio; vẫn có giờ/ngày và thời tiết                           | Quota và thời tiết không được đẩy ngay lúc ngắt mạng; cần thêm quản lý kết nối/ngủ và đo thực tế |
| **C — Đồng hồ trước, thời tiết sau**                | Làm đồng hồ/ngày/điều hướng/vẽ khi đổi trước; chưa thêm API thời tiết, chưa đổi chính sách mạng                                  | Phạm vi nhỏ nhất, dùng được cả khi server thời tiết chưa sẵn sàng                | Chưa có icon thời tiết thực; nếu giữ Wi-Fi hiện tại thì chưa giải quyết triệt để hao pin         |

**Đề xuất chọn B** vì pin là ưu tiên lớn nhất của bạn. Bản đầu của B nên dùng light-sleep khi đã tắt mạng, thức bằng timer/nút; chưa chọn deep-sleep làm mặc định vì cần phục hồi trạng thái, xử lý nút và tránh lặp boot/portal. Lựa chọn sleep cụ thể phải xác nhận với Arduino core và board đang dùng.

Wi-Fi mất kết nối khi chủ động vào light/deep-sleep; giữ mạng cần cơ chế modem-sleep/automatic light-sleep phù hợp. Không thể vừa tắt radio vừa nhận MQTT ngay. [Espressif: Sleep Modes](https://docs.espressif.com/projects/esp-idf/en/v4.4/esp32/api-reference/system/sleep_modes.html).

Với B, đề xuất hành vi:

- Đồng hồ đang sáng: thức khi đổi phút hoặc có nút bấm; không bật Wi-Fi cho mỗi phút.
- Hết thời gian xem: tắt OLED, hẹn thức cho lần lấy dữ liệu tiếp theo hoặc nút bấm. Đề xuất 60 giây; bạn có thể giữ 5 phút như hiện tại.
- Mỗi đợt mạng: kết nối, nhận retained phù hợp, đồng bộ giờ nếu cần, rồi tắt mạng; đặt ngân sách tối đa khoảng 20 giây cho một đợt tự động và backoff khi lỗi. Không mở portal tự động sau mọi lần thất bại.
- Vào quota: hiện cache ngay cùng trạng thái cũ nếu cần; khởi động một lần cập nhật có giới hạn, không chặn nút/vẽ bằng vòng chờ kết nối.
- Đang xem biểu cảm: chỉ chạy animation khi trang đó đang hiện; không hứa tiết kiệm như màn hình đồng hồ tĩnh.
- Nút thức máy: đề xuất lần bấm đầu chỉ đánh thức và hiện lại trang; lần bấm tiếp mới chuyển trang để tránh vừa bật lên đã mất đồng hồ.

Đây là thay đổi chính sách mạng cho **toàn thiết bị**, ảnh hưởng cả quota. Nếu bạn muốn quota luôn nhận ngay, chọn A; không nên gọi B là realtime liên tục.

## 5. Nội dung màn hình và trang trí nhẹ

Đề xuất: HH:MM là nội dung lớn nhất; phía trên có icon thời tiết tĩnh 16×16, nhiệt độ nếu bạn muốn; phía dưới có `T2 ... T7 / CN` và `DD/MM`. Có thể thêm đường phân cách mảnh và ký hiệu dữ liệu cũ nhỏ. Chưa chốt bố cục pixel.

- Dấu `:` đứng yên, không nháy từng giây. Không chạy hiệu ứng mưa/nắng liên tục.
- Bộ icon đơn sắc: nắng, trời quang ban đêm, ít mây, nhiều mây, mưa, giông, sương, tuyết, không rõ. Chín bitmap 16×16 chỉ có **288 byte dữ liệu pixel thô**, chưa tính cấu trúc/chương trình.
- Render trực tiếp bằng buffer OLED có sẵn; không đưa đồng hồ qua bước co giãn animation của mặt BMO.
- Chỉ gửi framebuffer khi đổi phút, thời tiết/trạng thái đổi, chuyển trang hoặc đánh thức. Tránh cấp phát `String` trong vòng vẽ; dùng buffer kích thước cố định.
- Không thêm % pin nếu chưa có mạch đo và hiệu chuẩn.
- Giảm số lần vẽ giúp giảm CPU/I2C; OLED vẫn tiêu thụ điện khi đang sáng dù không vẽ lại. Cần đo cả board và thời gian sáng màn hình.

## 6. Phía server và MQTT nếu chọn có thời tiết

**Nguồn đề xuất:** Open-Meteo; server chỉ lấy `temperature_2m`, `weather_code`, `is_day` và thời điểm tương ứng. Đây là dữ liệu mô hình, không phải cảm biến tại nhà. Tài liệu API có mã điều kiện WMO và thông tin ngày/đêm để ánh xạ icon. Kiểm tra điều kiện sử dụng, quota và yêu cầu ghi nguồn theo mục đích triển khai; chưa khóa nhà cung cấp. [Open-Meteo: Weather API](https://open-meteo.com/en/docs).

- Bạn chọn thành phố hoặc tọa độ một lần; không thêm GPS, không suy ra vị trí chính xác từ IP. Vị trí chỉ cần lưu phía server.
- Dùng scheduler xác thực gọi tác vụ có giới hạn; không phụ thuộc `setInterval` trong tiến trình web. Maintenance hiện chưa lấy thời tiết, nên cần bổ sung tác vụ được duyệt rõ ràng.
- Cache theo địa điểm để nhiều thiết bị dùng chung một lần gọi; có khóa/lease chống chạy trùng, timeout, giới hạn response và backoff.
- Sau lần lấy thành công, lưu dữ liệu và enqueue outbox trong giao dịch; tái dùng cơ chế gửi/retry nhưng phải mở rộng nơi đang giới hạn loại topic. Không giữ giao dịch DB trong lúc gọi API.
- Đề xuất topic riêng `bmo/v1/devices/<deviceId>/weather`, retained, publisher QoS 1; bản tin mục tiêu không quá 512 byte, parser cố định có giới hạn. **Topic này chưa tồn tại.**
- Payload đề xuất gồm version, deviceId, revision bền vững, locationRevision, condition, temperature nullable, isDay, dataAt và validUntil; timestamp dùng UTC. Đổi địa điểm phải vô hiệu cache cũ; retained trễ từ địa điểm trước không được hiện như dữ liệu mới.
- Chỉ giữ cache thời tiết trong RAM cho bản đầu; sau reboot chờ retained. Không ghi NVS mỗi phút/mỗi lần vẽ. Khôi phục retained sau reboot không được bị chặn bởi revision cache sai.
- Mở rộng đồng bộ schema TS/C++, topic parser/subscription, ACL, outbox/reconciliation, simulator và tombstone khi tắt weather/retire thiết bị. Không nhét thời tiết vào quota window.
- Bản đầu có thể giữ `pet-home` làm nhóm A và thêm clock nội bộ ở đầu nhóm, tránh đổi nghĩa PET/quota v1. Nếu muốn kéo thả trang clock độc lập trên dashboard thì cần thiết kế migration/version config riêng; chưa bao gồm mặc định.

## 7. Khi mất mạng hoặc dữ liệu lỗi

| Tình huống                     | Đề xuất hiển thị/hành vi                                                   |
| ------------------------------ | -------------------------------------------------------------------------- |
| Chưa đồng bộ giờ sau mất nguồn | `--:--`, ngày chưa xác định; không chặn giao diện                          |
| Đã có giờ rồi mất Wi-Fi        | Giờ tự chạy; không gắn mất Wi-Fi với mất giờ                               |
| Chưa có thời tiết/đã quá hạn   | Icon không rõ và `--`; đồng hồ vẫn bình thường                             |
| API lỗi                        | Giữ bản cũ tới validUntil; không đổi dataAt thành thời điểm retry          |
| MQTT trùng/cũ/sai schema       | Bỏ qua an toàn, không vẽ lại vô ích                                        |
| Đồng hồ hệ thống chưa đáng tin | Không coi retained weather là fresh chỉ vì vừa nhận                        |
| Không có quota cấu hình        | Đồng hồ và nhóm A vẫn dùng được; thông báo quota rỗng vẫn có đường quay về |

## 8. Kiểm chứng cần có sau khi duyệt

1. Test điều hướng nhóm A/nhóm B, không quota, hết danh sách và bấm thức; giữ ổn định ID các biểu cảm.
2. Test giờ UTC+7, qua nửa đêm/tháng/năm/năm nhuận, chưa có giờ, mất mạng và SNTP chỉnh giờ.
3. Đếm lần flush OLED: đồng hồ tĩnh không vẽ 30 FPS; đang ẩn/ngủ không vẽ, thức lên phải hiện phút hiện tại ngay.
4. Test thời tiết bằng fixture: mapping icon ngày/đêm, hết hạn, API lỗi, đổi địa điểm, payload sai/quá cỡ, retained/reboot/duplicate/revision và retire cleanup.
5. Build cả `esp32cam` và `esp32cam_bench`; xem preview từ renderer thật và kiểm tra OLED/nút trực tiếp. Bench offline chưa có SNTP phải hiện trạng thái chưa biết giờ.
6. Với B: đo thức bằng nút/timer, reconnect có giới hạn, TLS sau khi có giờ, cache quota cũ và thiết bị offline dài ngày.
7. Đo dòng toàn board khi clock sáng, OLED tắt, animation, kết nối Wi-Fi/TLS và sleep; kiểm tra sụt áp khi radio bật. So sánh A/B trên cùng pin, độ sáng và lịch dùng trước khi kết luận hướng nào tiết kiệm hơn bao nhiêu.

Không dự đoán số giờ dùng pin hoặc lấy dòng deep-sleep của chip làm dòng của cả ESP32-CAM. Tắt/bật radio cũng có chi phí reconnect; chu kỳ 30 phút cần kiểm chứng thực tế.

## 9. Các mục để bạn chọn/chốt

- [ ] Chọn **A — MQTT liên tục**.
- [ ] Chọn **B — Kết nối theo đợt, ưu tiên pin** (đề xuất).
- [ ] Chọn **C — Đồng hồ trước, thời tiết sau**.
- [ ] Xác nhận clock là trang đầu nhóm **A/biểu cảm**, khởi động vào clock; hoặc ghi lại nếu muốn đầu nhóm B/quota.
- [ ] Chọn địa điểm thời tiết: ____________________.
- [ ] Đồng ý giờ 24h, UTC+7, thứ và DD/MM; có / không có nhiệt độ.
- [ ] Chọn thời gian OLED tự tắt: **60 giây đề xuất** / 5 phút như cũ / khác: ______.
- [ ] Nếu chọn B: đồng ý quota cũng cập nhật theo đợt, vào quota có thể chờ lần refresh.

**Phạm vi hiện tại chỉ là khảo sát và tài liệu lựa chọn.** Sau khi bạn chốt, mới viết thiết kế cuối cùng và kế hoạch chia bước firmware → thời tiết server/MQTT → đo pin. Không tự triển khai thêm phase, cài scheduler, cấu hình broker production hoặc flash thiết bị trong lượt này.
