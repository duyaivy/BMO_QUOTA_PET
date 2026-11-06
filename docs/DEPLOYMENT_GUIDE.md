# Hướng Dẫn Triển Khai BMO Quota Pet Lên Cloud (Vercel / Render)

Tài liệu này cung cấp quy trình từng bước để triển khai hệ thống **BMO Quota Pet** lên hạ tầng Cloud (Vercel hoặc Render) kết hợp với **BMO Collector (Native Swift Daemon)** chạy trên máy macOS cục bộ.

---

## 1. Kiến Trúc Hệ Thống (Hybrid Architecture)

Hệ thống hoạt động theo mô hình lai (Hybrid Cloud-Local):

```
┌────────────────────────────────────────────────────────┐
│                      CLOUD                             │
│                                                        │
│   ┌─────────────────────┐      ┌───────────────────┐   │
│   │   Next.js App       │ ───► │  Turso Database   │   │
│   │  (Vercel / Render)  │      │ (libSQL Cloud DB) │   │
│   └─────────────────────┘      └───────────────────┘   │
└──────────────▲─────────────────────────────────────────┘
               │
               │ HTTPS POST /api/internal/usage/ingest
               │ (HMAC-SHA256 Signed Packets)
               │
┌──────────────┴─────────────────────────────────────────┐
│                   LOCAL MACOS AGENT                    │
│                                                        │
│   ┌────────────────────────────────────────────────┐   │
│   │         BMO Collector (Swift Native)           │   │
│   │   - RAM < 6MB, Apple Silicon ARM64 native      │   │
│   └──────────────▲──────────────────▲──────────────┘   │
│                  │                  │                  │
│       (Push via stdin)      (Passive Tailing)          │
│                  │                  │                  │
│        ┌─────────┴────────┐   ┌─────┴────────────┐     │
│        │   Antigravity    │   │      Codex       │     │
│        │    statusLine    │   │  session .jsonl  │     │
│        └──────────────────┘   └──────────────────┘     │
└────────────────────────────────────────────────────────┘
```

- **Cloud (Vercel / Render):** Phục vụ giao diện Dashboard theo dõi hạn mức (đã định dạng giờ Việt Nam GMT+7), quản lý xác thực phiên làm việc và tiếp nhận API ingestion.
- **Database (Turso libSQL Cloud):** Dùng chung cho cả môi trường phát triển cục bộ và production trên Cloud.
- **Local macOS Agent (BMO Collector):** Chạy ngầm trên máy Mac cá nhân để đọc phiên làm việc của Codex và nhận tín hiệu statusline của Antigravity, sau đó ký số và gửi lên Cloud.

---

## 2. Bảng Biến Môi Trường (Environment Variables)

Sao chép và cấu hình các biến sau trên trang quản trị Vercel hoặc Render:

| Tên biến | Bắt buộc | Ví dụ giá trị | Giải thích |
| :--- | :---: | :--- | :--- |
| `BMO_APP_ORIGIN` | **Có** | `https://bmo-pet.vercel.app` | **URL chính thức của Web App**. Bắt buộc dùng `https://` trên môi trường Cloud. |
| `ADMIN_PASSWORD_HASH` | **Có** | `$argon2id$v=19$m=65536,t=3,p=4$...` | Mã hash Argon2id của mật khẩu quản trị viên (tạo bằng script bên dưới). Không lưu mật khẩu rõ trong biến môi trường. |
| `SESSION_SECRET` | **Có** | `delconhaaesiuuu_bmo_personal_session_secret_at_least_32_chars` | Chuỗi bí mật ngẫu nhiên tối thiểu 32 ký tự để mã hóa session cookie. |
| `TURSO_DATABASE_URL` | **Có** | `libsql://bmoquotabot-duyaivyz.aws-ap-southeast-1.turso.io` | Đường dẫn kết nối CSDL Turso Cloud (dùng chung CSDL hiện tại). |
| `TURSO_AUTH_TOKEN` | **Có** | `eyJhbGciOiJFZERTQS...` | Auth token JWT của Turso Database. |
| `BMO_INGEST_KEYS_JSON` | **Có** | `{"native-key-agy":"c9a2f78b105d43e2a9b345719e8cf1234567890abcdef1234567890abcdef120"}` | Cặp `keyId : secretHex` để xác thực chữ ký HMAC-SHA256 của Collector. |
| `SYNC_ENABLED` | Tùy chọn | `true` | Bật tiến trình đồng bộ dữ liệu. |
| `SYNC_INTERVAL_MINUTES`| Tùy chọn | `5` | Chu kỳ đồng bộ nền (phút). |
| `USAGE_STALE_AFTER_MINUTES` | Tùy chọn | `15` | Thời gian đánh dấu dữ liệu quota là cũ nếu không có quan sát mới. |
| `MQTT_HOST` | Tùy chọn | `mqtt.flespi.io` | Máy chủ MQTT broker (dành cho phần cứng BMO ESP32). |
| `MQTT_PORT` | Tùy chọn | `8883` | Cổng bảo mật TLS MQTT. |
| `MQTT_USERNAME` | Tùy chọn | `4VRtFuVwkF3gmemx...` | Token xác thực kết nối MQTT broker. |

### Hướng dẫn tạo mật khẩu mới an toàn:

Để thay đổi mật khẩu đăng nhập trang Dashboard, chạy lệnh sau tại thư mục dự án:
```bash
pnpm exec tsx scripts/auth-hash.ts
```
1. Script không hiện lời nhắc. Nhập mật khẩu mới, nhấn Enter rồi Ctrl+D để kết thúc đầu vào. Mật khẩu sẽ hiện trên terminal khi gõ theo cách này.
2. Script sẽ xuất ra dòng `ADMIN_PASSWORD_HASH=...` chứa hash có dạng:
   ```text
   $argon2id$v=19$m=65536,p=4,t=3$...
   ```
3. Trên Vercel / Render, đặt biến `ADMIN_PASSWORD_HASH` bằng phần giá trị sau `ADMIN_PASSWORD_HASH=`, bỏ dấu `\` trước mỗi `$` nếu có. Khi lưu vào `.env.local`, giữ nguyên các dấu `\` mà script xuất ra để tránh nội suy biến. Không cấu hình `ADMIN_PASSWORD`; xóa biến này nếu đã thêm trước đó. Khi đăng nhập Dashboard, nhập mật khẩu gốc, không nhập chuỗi hash.

---

## 3. Các Bước Triển Khai Lên Vercel

### Bước 1: Đẩy mã nguồn lên GitHub
Đảm bảo các thay đổi mới nhất đã được đẩy lên repository GitHub:
```bash
git push origin main
```

### Bước 2: Import Project vào Vercel
1. Truy cập [vercel.com](https://vercel.com/) và đăng nhập.
2. Chọn **Add New...** $\rightarrow$ **Project**.
3. Chọn kho lưu trữ GitHub của dự án (`BOM_QUOTA_PET`).
4. Cấu hình cơ bản:
   - **Framework Preset:** `Next.js`
   - **Root Directory:** `./`
   - **Build Command:** `pnpm build` (hoặc để Vercel tự nhận diện)
   - **Install Command:** `pnpm install`

### Bước 3: Điền Environment Variables
Mở rộng mục **Environment Variables** và nhập đầy đủ các biến từ bảng ở Mục 2.

### Bước 4: Deploy & Kiểm tra Domain
1. Nhấn nút **Deploy**.
2. Chờ 1-2 phút để Vercel hoàn tất quá trình build.
3. Sau khi deploy thành công, sao chép URL production được cấp (ví dụ: `https://bom-quota-pet.vercel.app`).
4. Nếu URL khác với biến `BMO_APP_ORIGIN` đã nhập, cập nhật lại biến `BMO_APP_ORIGIN` trong **Settings $\rightarrow$ Environment Variables** và chọn **Redeploy**.

---

## 4. Các Bước Triển Khai Lên Render

### Bước 1: Tạo Web Service mới
1. Đăng nhập vào [dashboard.render.com](https://dashboard.render.com/).
2. Nhấn **New +** $\rightarrow$ **Web Service**.
3. Kết nối với kho lưu trữ GitHub của dự án.

### Bước 2: Cấu hình Build & Start Command
- **Name:** `bmo-quota-pet` (tùy chọn)
- **Region:** `Singapore` (gần Việt Nam nhất, tối ưu độ trễ với Turso `ap-southeast-1`)
- **Branch:** `main`
- **Runtime:** `Node`
- **Build Command:**
  ```bash
  corepack enable && pnpm install --frozen-lockfile && pnpm build
  ```
- **Start Command:**
  ```bash
  pnpm start
  ```

### Bước 3: Nhập Environment Variables
Cuộn xuống phần **Environment Variables** và thêm tất cả các biến cấu hình từ Mục 2.

### Bước 4: Hoàn tất & Lấy Domain
1. Nhấn **Create Web Service**.
2. Lấy URL được cấp (dạng `https://bmo-quota-pet.onrender.com`).
3. Đảm bảo `BMO_APP_ORIGIN` khớp chính xác với URL này.

---

## 5. Cấu Hình BMO Collector Tại Máy Local

Sau khi trang Web đã online trên Cloud, bạn cần trỏ Collector trên máy Mac lên URL Cloud.

### Bước 1: Cập nhật URL Ingest trong Collector Config
Mở file `collector-native.local.json` trên máy Mac:
```json
{
  "evidenceMode": "native",
  "collectorId": "native-collector-agy",
  "keyId": "native-key-agy",
  "secretFile": "/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET/.data/bmo-native.key",
  "url": "https://<DOMAIN-CUA-BAN>.vercel.app/api/internal/usage/ingest",
  "stateDirectory": "/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET/.data/native-collector-state",
  "allowLocalHttp": true,
  "providers": {
    "codex": {
      "enabled": true,
      "generation": 2
    },
    "antigravity": {
      "enabled": true,
      "generation": 3
    }
  },
  "nativeCodex": {
    "sessionDirectory": "/Users/apple/.codex/sessions",
    "version": "0.163.0"
  },
  "nativeStatuslines": {
    "antigravity": {
      "version": "1.5.1",
      "subscriptionQuotaConfirmed": true
    }
  }
}
```
*(Thay thế `<DOMAIN-CUA-BAN>.vercel.app` bằng URL thực tế).*

### Bước 2: Khởi động lại BMO Collector Daemon
Chạy lệnh dừng và khởi động lại Collector:
```bash
./Stop-Collector.command
./BMO-Collector.app/Contents/MacOS/launcher
```

### Bước 3: Kiểm tra Log thu thập
Xem log xác nhận collector đã ký số và gửi lên Cloud thành công:
```bash
tail -n 20 .data/bmo-collector.log
```
Kỳ vọng nhìn thấy dòng chữ:
```text
[BMO] [Codex] Observation uploaded (Primary: ...% used, Secondary: ...% used) -> ACKNOWLEDGED
[BMO] [Antigravity] Statusline observation uploaded (4 windows) -> ACKNOWLEDGED
```

---

## 6. So Sánh Cơ Chế Thu Thập Quota: Codex vs Antigravity

| Tiêu chí | Google Antigravity (AGY) | OpenAI Codex |
| :--- | :--- | :--- |
| **Mô hình** | **Push / Active Callback** | **Passive / File Tailing** |
| **Nguồn dữ liệu** | Hook lệnh `statusLine` truyền qua `stdin` | Tệp nhật ký `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` |
| **Tần suất kích hoạt** | Tức thì khi gõ lệnh hoặc tương tác trong IDE | Khi AI hoàn thành một lượt sinh token (turn) |
| **Khởi động Daemon** | Ghi dữ liệu vào spool khi có lượt chat mới | Tự động dò ngược (`discoverLatestQuota`) tìm phiên mới nhất ngay khi bật app |
| **Bảo mật chuyển giao** | Ký số HMAC-SHA256 (`BMO-INGEST-V1`) | Ký số HMAC-SHA256 (`BMO-INGEST-V1`) |
| **Hiển thị Dashboard** | Quy đổi múi giờ Việt Nam GMT+7 | Quy đổi múi giờ Việt Nam GMT+7 |

---

## 7. Khắc Phục Sự Cố Thường Gặp (Troubleshooting)

1. **Lỗi `401 Unauthorized` hoặc `AUTH_FAILED` khi Collector đẩy dữ liệu:**
   - Kiểm tra `keyId` trong `collector-native.local.json` (`native-key-agy`).
   - Kiểm tra nội dung chuỗi hex 64 ký tự trong `.data/bmo-native.key` có khớp với trường `BMO_INGEST_KEYS_JSON` trên Vercel / Render hay không.

2. **Lỗi `404 Not Found`:**
   - Kiểm tra lại URL trong `collector-native.local.json`. Đường dẫn đúng phải kết thúc bằng `/api/internal/usage/ingest`.

3. **Dashboard báo "Dữ liệu cũ" (Stale Data):**
   - Kiểm tra xem máy Mac có đang bật và kết nối Internet không.
   - Kiểm tra xem tiến trình Collector có đang chạy không: `ps aux | grep bmo-collector`.
   - Nếu Collector bị dừng, chỉ cần click mở lại `BMO-Collector.app`.
