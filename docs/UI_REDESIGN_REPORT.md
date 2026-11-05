# BMO Quota — Báo cáo redesign dashboard

## Kết quả

Đã triển khai giao diện navy tối theo ảnh tham chiếu, với sidebar tím nhẹ, chấm xanh cho provider đang chọn, quota card dùng thanh xanh/vàng/đỏ, và drawer điều hướng trên mobile. Dùng Next.js, Tailwind, Lucide và các primitive UI sẵn có; không thêm dependency.

Giữ nguyên các route hiện có, thêm ba trang được bảo vệ bởi layout xác thực hiện có:

- `/providers/antigravity`
- `/providers/codex`
- `/providers/claude` — tên hiển thị Claude Code, giữ đúng provider ID hiện có.

Antigravity tách Claude & GPT và Gemini, mỗi nhóm có vị trí cho khung 5 giờ và tuần. Khung chưa có quan sát hiển thị trạng thái trống; các khung động khác vẫn được giữ. Giao diện chung được áp dụng cho tổng quan, cấu hình nguồn, collector, thiết bị, trạng thái và đăng nhập.

## File tạo mới

- `src/app/(protected)/providers/[providerId]/page.tsx`
- `src/components/quota/presentation.ts`
- `src/components/quota/provider-icon.tsx`
- `src/components/quota/provider-summary.tsx`
- `tests/ui/quota-presentation.test.ts`
- `tests/browser/redesign.spec.ts`
- `docs/UI_REDESIGN_REPORT.md`

## File chỉnh sửa

- `src/app/globals.css`, `src/app/layout.tsx`, `src/app/login/page.tsx`
- `src/app/(protected)/settings/providers/page.tsx`
- `src/app/(protected)/collectors/page.tsx`
- `src/app/(protected)/devices/page.tsx`
- `src/app/(protected)/status/page.tsx`
- `src/components/shell/app-shell.tsx`, `src/components/shell/page-header.tsx`
- `src/components/quota/provider-card.tsx`, `src/components/quota/window-view.tsx`, `src/components/quota/refresh-button.tsx`
- `src/components/auth/login-form.tsx`
- `src/components/device/device-editor.tsx`, `src/components/device/oled-preview.tsx`
- `src/components/ui/card.tsx`, `src/components/ui/badge.tsx`, `src/components/ui/button.tsx`
- `tests/browser/shell.spec.ts`, `tests/browser/dashboard.spec.ts`, `tests/browser/lifecycle.spec.ts`

Phạm vi thay đổi không bao gồm API, schema, migration, truy vấn server, collector, adapter, MQTT, cron hay cơ chế xác thực. Shell chỉ dùng hàm kiểm tra phiên hiện có để hiển thị các điều khiển quản trị phù hợp.

## Component và quyết định dữ liệu

- `ProviderQuotaCard`: nhóm quota theo provider, giữ các window ID động, có trạng thái trống cho khung chưa nhận dữ liệu.
- `WindowViewCard`: phần trăm còn lại, phần trăm đã dùng khi nguồn có, progressbar, countdown và mục mở rộng dữ liệu.
- `ProviderSummary`: thống kê provider và trung bình từ các quan sát hợp lệ, khả dụng, chưa cũ hoặc quá mốc reset; thiếu dữ liệu không được tính thành 100%.
- `ObservationFreshness`: đánh giá độ mới theo nhóm, không suy ra độ mới từ collector đang bật.
- `ProviderIcon`: icon nhất quán từ Lucide.
- `presentation.ts`: định dạng phần trăm tối đa **2 chữ số thập phân**, ngưỡng màu và các hàm trình bày thời gian. Dữ liệu số gốc và độ rộng thanh quota giữ nguyên độ chính xác.

Ngưỡng màu theo quota còn lại: trên 50% xanh, từ 20% đến 50% vàng, dưới 20% đỏ. Các ngưỡng là hằng số UI.

Độ mới dùng chính sách thời gian hiện có và bằng chứng nguồn. Chỉ hiển thị “Dữ liệu mới” khi có timestamp nguồn hợp lệ cùng bằng chứng độ mới phù hợp. Nguồn không rõ hoặc timestamp ở tương lai không được xem là đã xác minh. Thời điểm collector ghi nhận không được coi là thời điểm nhà cung cấp vừa cập nhật, cũng không được gán thành thời điểm ghi database.

Countdown khởi tạo từ thời gian server để tránh hydration mismatch, cập nhật trên client và xử lý reset thiếu/không hợp lệ/quá hạn. Quota không tự chuyển về 100% sau reset. Giá trị cũ hoặc nguồn bị tắt được ghi rõ “Gần nhất” và không có thanh quota hiện tại.

Drawer hỗ trợ Escape, giới hạn focus, khôi phục focus và khóa tương tác nội dung phía sau. Các hành động đăng xuất/cài đặt quản trị không hiển thị khi chưa xác thực.

## Xác minh

Môi trường thực thi: Node.js 24.18.0, pnpm 11.24.0.

| Lệnh                                                                 | Kết quả                  |
| -------------------------------------------------------------------- | ------------------------ |
| `pnpm typecheck`                                                     | Qua                      |
| `pnpm lint`                                                          | Qua, không cảnh báo      |
| `pnpm build`                                                         | Qua, production build    |
| `pnpm test:integration`                                              | 18/18 Playwright qua     |
| `./node_modules/.bin/vitest run tests/ui/quota-presentation.test.ts` | 5/5 qua                  |
| `pnpm test:unit`                                                     | 135 qua, 3 lỗi collector |
| Prettier check trên các file UI/test thay đổi                        | Qua                      |
| `git diff --check`                                                   | Qua                      |

Playwright kiểm tra 9 trang ở 320, 375, 768, 1024 và 1440px, cộng ảnh Antigravity ở desktop 1672px. Các ca gồm: điều hướng provider, collapse sidebar, focus drawer, không tràn ngang, vùng chọn mobile đủ cao, dữ liệu thiếu, làm tròn hiển thị, màu quota, không trộn dữ liệu provider, nguồn bị tắt, reset, độ mới, quyền truy cập, chỉnh thiết bị và xung đột revision.

Ban đầu sandbox chặn thông tin tiến trình và cổng local. Đã chạy lại unit/Playwright ngoài sandbox theo quyền được cấp. Các ảnh và số liệu kiểm thử dùng database fixture tạm, không ghi vào database người dùng.

## Giới hạn còn lại

Toàn bộ unit suite chưa xanh. Ba lỗi nằm trong `collector/tests/collector.test.ts` (2 ca) và `collector/tests/reliability.test.ts` (1 ca): sự kiện `EVENT_EXPIRED` và số lượng sự kiện pending không như kỳ vọng. Các fixture liên quan dùng timestamp cố định `2026-10-31`. Không sửa collector hoặc kiểm thử collector trong phạm vi frontend này.

Xác minh UI dùng quan sát mô phỏng có nhãn rõ ràng, không phải bằng chứng quota trực tiếp từ Antigravity/Claude. Không triển khai hay cài dịch vụ nền.

## Ảnh giao diện

Ảnh được tạo từ production build với dữ liệu fixture có nhãn mô phỏng; nằm trong `test-results/`, không commit.

- [Antigravity desktop](../test-results/redesign-antigravity-desktop.png)
- [Antigravity mobile](../test-results/redesign-antigravity-375.png)
- [Codex](../test-results/redesign-codex-desktop.png)
- [Claude Code](../test-results/redesign-claude-desktop.png)
- [Cài đặt provider](../test-results/redesign-providers-1440.png)
- [Thiết bị mobile](../test-results/redesign-devices-375.png)
- [Đăng nhập mobile](../test-results/redesign-login-375.png)
