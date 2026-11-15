# Prompt tiếp tục cho AGY

Bạn tiếp quản việc triển khai clock/weather/tiết kiệm pin ESP32 trong repository:

`/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET`

Codex đã tạm dừng theo yêu cầu của tôi vì hết quota. **Hãy tiếp tục phần còn dang dở, không làm lại từ đầu.** Tôi đã duyệt triển khai; bạn có quyền hoàn thiện code, sửa lỗi và chạy kiểm tra cục bộ trong phạm vi tính năng này. Các quyết định kỹ thuật chưa chốt đã được giao cho agent tự quyết hợp lý. Không hỏi lại các lựa chọn đã ghi trong plan/spec.

Đọc theo thứ tự:

1. `AGENTS.md`.
2. `docs/checkpoints/2026-11-15-clock-weather-AGY-CHECKPOINT.md` — trạng thái thực tế mới nhất, evidence và việc còn lại.
3. `docs/superpowers/specs/2026-11-15-clock-weather-wake-design.md`.
4. `docs/superpowers/plans/2026-11-15-clock-weather-on-wake.md`.
5. `docs/CLOCK_WEATHER_IMPLEMENTATION.md` và `docs/WEATHER_SCHEDULING.md`.

Mã đang ở branch `main`, chưa commit, nhiều file mới untracked. Giữ nguyên mọi thay đổi đã có; không reset/clean/checkout đè, không sửa CAD hoặc phase khác. Kiểm tra process còn lại sau interrupt trước khi chạy build/test; không chạy build và typecheck song song vì cùng dùng `.next`.

Yêu cầu cốt lõi: ESP không tự thức lấy thời tiết; mỗi boot/bấm nút chỉ một phiên mạng tối đa20s, đóng sớm khi đủ dữ liệu; sau5phút idle light-sleep chỉ nút thức. Clock số UTC+7/ngày/tháng đầu nhóm biểu cảm, weather icon tĩnh. Server Vercel dùng Turso/outbox và MQTT retained; uptime monitor gọi **HEAD có token mỗi15phút**; người dùng chọn địa điểm trên web `/devices`. Mặc định weather off/allowlist rỗng, không bỏ TLS CA.

Ưu tiên tiếp theo: review các sửa server cuối vừa bị interrupt, chạy build và toàn bộ checks theo checkpoint, kiểm chứng lại firmware sau SNTP gate cuối, inspect screenshot/preview, sửa regression nếu có, hoàn thiện evidence report rồi báo output tiếng Việt. Đừng coi agent report hoặc file test tồn tại là bằng chứng đã pass; chạy và đọc kết quả thực tế.

**Không deploy, bật monitor/scheduler, tạo secret thật, flash ESP, push/merge hoặc tự đổi phase.** Phép đo pin/GPIO wake/TLS fault trên board và smoke Vercel/monitor/broker thật chưa làm; giữ riêng các giới hạn đó, không tuyên bố đã chứng minh bằng host tests. Không ghi đè `firmware/include/config.h` chứa cấu hình local; dùng `config.example.h` cho tài liệu.

Sử dụng Node24.18.0, pnpm11.24.0 và toolchain đã pin. Tôi muốn bạn hoàn thiện phần được phép làm cục bộ đến mức review được, chạy kiểm tra phù hợp và ghi rõ điều gì còn cần phần cứng/hạ tầng thật.
