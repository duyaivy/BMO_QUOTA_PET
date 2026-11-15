# Checkpoint chuyển tiếp Codex → AGY: Clock / Weather / Wake-only

**Trạng thái: TẠM DỪNG theo yêu cầu người dùng do hết quota Codex. Chưa nghiệm thu toàn bộ.**

Workspace: `/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET`. Branch tại checkpoint: `main`. Thay đổi đang nằm trực tiếp trong working tree, gồm nhiều file mới **untracked**. Chưa commit, deploy, kích hoạt monitor, tạo secret thật hoặc flash ESP. Không reset/clean/checkout đè các thay đổi này.

Người dùng yêu cầu thực hiện plan, sinh đúng hai sub-agent: server/web và firmware, main agent review/check. Hai implementer dùng `gpt-6-sol/high`. Firmware đã bàn giao và dừng; server bị interrupt khi người dùng yêu cầu pause. AGY tiếp tục từ mã hiện tại, không làm lại từ đầu.

## 1. Tài liệu ràng buộc và yêu cầu đã duyệt

- [Plan](../superpowers/plans/2026-11-15-clock-weather-on-wake.md).
- [Spec mới nhất](../superpowers/specs/2026-11-15-clock-weather-wake-design.md).
- [Báo cáo triển khai đang viết](../CLOCK_WEATHER_IMPLEMENTATION.md): **verification record chưa hoàn thiện**, không coi là nghiệm thu.
- [Runbook scheduler](../WEATHER_SCHEDULING.md).
- Đọc `AGENTS.md`; Node **24.18.0**, pnpm **11.24.0**. Không nâng dependency/toolchain.

Quyết định cố định:

1. ESP ưu tiên pin: chỉ boot/bấm nút thức mới mở một phiên Wi-Fi/SNTP/MQTT; không tự thức định kỳ lấy weather, không reconnect sau khi phiên kết thúc. Phiên mạng tối đa 20 giây, đủ dữ liệu thì đóng sớm.
2. Sau 5 phút không tương tác: OLED off, Wi-Fi/MQTT/SNTP off, CPU **light-sleep**, chỉ GPIO nút A15/B12 active-low đánh thức. Bấm để thức chỉ hiện Clock, consume tới khi thả, không click chuyển trang cùng lúc.
3. Clock đầu nhóm biểu cảm A: HH:MM24h, UTC+7, T2–T7/CN DD/MM, icon weather tĩnh và °C. Giữ face IDs/config/snapshot v1, không animation/giây/flash-write mỗi phút. Chỉ flush clock khi nội dung đổi.
4. Server Vercel + remote Turso + broker MQTT ngoài. **Uptime monitor HEAD mỗi 15 phút**, GET kiểm tra thủ công; không thêm weather cron Vercel. Token Bearer, fallback query nếu monitor không hỗ trợ header; server lưu digest SHA256 riêng. HEAD không body, auth trước DB/provider, no-store.
5. Durable gate tối thiểu 900 giây giữa provider attempts, lease/fencing chống trùng/đổi địa điểm, cache/outbox bền vững. Weather TTL 60 phút **từ dataAt nguồn**.
6. Người dùng tìm/chọn/lưu địa điểm ở `/devices`; một địa điểm chung, owner auth/CSRF, CAS revision, rate limit tìm/resolve30/phút/session. Server resolve providerID, không tin tọa độ browser.
7. Weather qua retained QoS1 `bmo/v1/devices/<deviceId>/weather`, tối đa512 UTF-8bytes; config/quota vẫn8KiB. `BMO_WEATHER_ENABLED=false`, allowlist `[]` mặc định. TLS CA luôn kiểm chứng.

Người dùng đã giao các lựa chọn kỹ thuật còn lại cho agent. Không hỏi lại lựa chọn đã chốt. Không bắt đầu phase khác. Chưa được phép deploy/kích hoạt scheduler/flash.

## 2. Những phần đã có mã

### Server / web

- `src/contracts/weather/index.ts`: strict Zod wire/location/settings schemas; browser-safe payload parser, size/revision/location arbitration.
- MQTT topic weather trong `src/contracts/mqtt/index.ts`.
- `drizzle/0006_weather_cache.sql`, `src/server/db/schema.ts`: singleton settings/cache và durable `weather_topic_state` counter/hash, không phụ thuộc outbox đã prune.
- `src/server/weather/`: config, locations, provider, settings, rate-limit, projection, refresh, trigger-auth.
- Routes `/api/weather/locations`, `/api/settings/weather`, `/api/internal/weather/refresh`.
- Card `src/components/weather/weather-settings.tsx`, mount ở `src/app/(protected)/devices/page.tsx`.
- `src/server/auth/index.ts`: owner session trả thêm handleHash nội bộ để rate limit.
- `src/server/mqtt/{drain,publisher}.ts`: scoped weather drain, deadline, fencing/supersession. Device retirement queues weather tombstone.
- `next.config.ts`: output tracing includes `drizzle/*.sql`; `.env.example` và deployment/scheduler docs.
- `tests/weather/` và `tests/browser/weather.spec.ts` đã thêm, nhưng **chưa chạy đầy đủ trên trạng thái cuối**.

### Firmware

- New `weather.h/.cpp`: strict ≤512B parser, 53-bit-safe revisions, UTC calendar/TTL, unavailable/cache arbitration. Duplicate retained hợp lệ được tính là đã nhận để đóng mạng sớm; bản cũ/location regression bị bỏ.
- `wake_session.h/.cpp`: một phiên WIFI→TIME→MQTT, 20s deadline wrap-safe. Có gate SNTP mới: đợi callback lần thức này hoặc sau3s dùng giờ đã tin cậy từ trước; cold boot chưa có giờ phải đợi sync/deadline.
- `wifi_manager`: ordinary wake không portal/retry; provisioning lần đầu/chủ động riêng; stop SNTP và radio khi xong. Probe saved credentials khởi tạo STA driver rồi tắt lại.
- `mqtt_client`: một persistent FreeRTOS worker core0 xử lý I/O đồng bộ, main sở hữu cache/UI; 4 packet slots 8KiB preallocated + index queue; atomic flags. Async lwIP DNS tránh hostByName chặn~31s, DNS gate5s; pre-resolved TLS giữ hostname SNI/cert, TCP timeout2s, handshake3s; không `setInsecure` khi thiếu CA.
- `power_manager/buttons/main/navigation`: CPU light-sleep GPIO-only, consume wake press, Clock→Happy→…→Clock, quota quay về Clock.
- `clock_renderer`: static HH:MM/date/weather, dirty flush, temp bắt đầu x88 để `-100°C` không tràn.
- Host tests weather/session/buttons/power/clock/navigation; production GFX preview `render_clock.py`. Firmware README/BENCH cập nhật.

### Phần main agent làm

- `tests/fixtures/device-simulator.ts`: weather arbitration, weather tombstone chỉ xóa weather; subscribe3topics qua TCP.
- `tests/fixtures/mqtt-broker.ts`: exact SUBSCRIBE, retained delivery, live forwarding QoS0 fixture, tombstone xóa retained.
- `tests/weather/simulator.test.ts`, `end-to-end.test.ts`: offline qua2refresh, DB reconnect, wake nhận latest qua TCP thật.
- `tests/weather/http.test.ts` và `tests/fixtures/weather-fetch-preload.mjs`: chạy **production Next server thật**, DB/broker tạm, Open-Meteo intercepted trong **test-only preload**. Kiểm tra HEAD auth/empty/no-cache/duplicate fetch; owner login/search/save/CSRF/409.
- Sửa **chỉ fixture ngày giờ** trong `collector/tests/{collector,reliability}.test.ts`:3test nền hết hạn vì capture timestamp cố định2026-10-31; đổi sang relative time. Không đổi logic collector.
- Thêm evidence report, addendum architecture/roadmap. Plan header đã ghi đã được duyệt; checkbox gốc không phải bằng chứng PASS.

## 3. Bằng chứng đã chạy — phân biệt nguồn và thời điểm

### Main agent đã trực tiếp xác nhận

| Kiểm tra | Kết quả / giới hạn |
| --- | --- |
| Baseline `pnpm test:unit` ngoài sandbox |164pass/3fail trước feature; cả3 là collector fixture ngày cũ. Log `/tmp/bmo-clock-baseline-unrestricted.log`. |
| Collector fixture rerun |15 tests /2files PASS sau sửa relative capture time. `/tmp/bmo-baseline-fixtures-green.log`. |
| Simulator |3 tests RED→GREEN, malformed/old/duplicate/tombstone/location change. |
| E2E + MQTT regression |9files /33tests PASS: `tests/weather/{end-to-end,simulator}.test.ts`, `tests/mqtt`, `tests/integration/mqtt-pipeline.test.ts`; `/tmp/bmo-weather-e2e-green.log`. Trước các server sửa cuối. |
| Production HTTP |2tests PASS trong `tests/weather/http.test.ts`, `/tmp/bmo-weather-http-red.log` **tên log là red nhưng nội dung là PASS** vì agent server đã build kịp trước lúc chạy. Trước các sửa cuối. |
| Sáu host firmware + GFX preview |Đã chạy PASS trực tiếp; trước thay đổi SNTP readiness gate cuối. |
| Hai build PlatformIO |Main chạy PASS cả `esp32cam`/`esp32cam_bench`, `/tmp/bmo-main-platformio.log`; trước SNTP readiness gate cuối. |
| Preview |Main mở xem PNG `new-year-2359-minus-100` và `new-year-0000-plus-70`, layout vừa128×64. |
| Diff whitespace |`git diff --check` đã chạy không lỗi tại thời điểm đó; chưa phải kiểm tra cuối. |

### Agent firmware báo cáo

Sau thay đổi cuối cùng SNTP readiness gate: host wake test RED→GREEN, hai PlatformIO build SUCCESS. Mã đã freeze. Worklog `/tmp/bmo-clock-firmware-worklog.md`; **main chưa chạy xác nhận lại thay đổi cuối** vì người dùng pause. Lệnh main định rerun bị abort; `/tmp/bmo-main-platformio-final.log` chưa tồn tại, không coi là đã chạy.

### Agent server báo cáo / chưa nghiệm thu

- Từng `pnpm build` PASS sau khi thêm UI; browser test đầu từng lỗi locator trùng và đã sửa; screenshot desktop/mobile đã tồn tại.
- Thêm nhiều sửa review sau build ban đầu; trạng thái cuối còn cần build/typecheck/lint/tests lại.
- Đã gặp race khi build và typecheck chạy đồng thời do `.next/types`; **chạy tuần tự**, không build/typecheck song song trong cùng checkout.
- `/tmp/bmo-weather-server-worklog.md` **chưa tồn tại** khi pause. Không suy diễn một kiểm tra đã pass nếu chỉ có filecode/screenshot.

## 4. Việc còn phải làm ngay khi AGY tiếp tục

1. Kiểm tra `git status`, đọc code hiện tại và plan/spec. Không reimplement phần đã có. Phần server bị interrupt giữa đợt sửa review; sửa nhỏ có thể chưa format hoặc chưa test.
2. Kiểm tra các process test/build/server còn chạy sau interrupt; chỉ dừng process thuộc đợt này khi cần, tránh kill tiến trình của chủ dự án. Codex không đọc được `ps` trong sandbox nên chưa xác nhận hết process.
3. Rà và kiểm chứng các sửa server cuối:
   - **Same source retained repair**: projection vừa đổi sang giữ nguyên revision/payload khi force republish cùng semanticHash; reactivate row published, preserve pending/failed backoff, reconstruct same revision nếu pruned. Cần test branch này, không tăng revision vô ích.
   - **GET diagnostics**: not_due/busy vừa đổi trả cache.data_at/fetched_at/last_job_at thay vì bịa lastJobAt=now; cần typecheck/test sau sửa.
   - Contract invalidcandidate tests: revision của case xấu phải mới hơn cache để duplicate guard không che lỗi validation; main đã yêu cầu agent sửa, cần kiểm tra đã làm đủ.
   - UI: async mount/poll không được ghi đè saved revision mới; dùng functional state guard. Poll hết30s phải dừng kể cả hidden; điều kiện timeout trước visibility. Label weather tiếng Việt. Kiểm tra sửa hiện tại và regression.
   - Browser tests mới: conflict giữdraft rồi save lại; empty/error giữsavedplace; đã thêm nhưng chưa xác nhận toàn suite. Còn xem xét reload/staleasync/429/keyboard/mobile theo plan.
   - Drain unscoped không batch khi candidate cóweather; thất bại worker cũ không revive superseded. Deadline không báo200 sai; pending delivery khi không có MQTT_HOST phải failed.
   - Absolute publish deadline bao cả socket writes/disconnect, không chỉ PUBACK. Mọi requestHEAD authfail không chạmDB/provider; unsupported method405/Allow/no-store phù hợp hợp đồng.
   - Migration SQL thật có trong `.next/server/**.nft.json`/deployment trace; không chỉ dựa vào config include.
4. Firmware: rerun affected wake hosttest rồi hai build sau SNTP gate; nếu cần chạy lại cả6hosttest. Không sửa tiếp khi không có lỗi cụ thể.
5. Chạy tuần tự các kiểm tra cuối:

```sh
pnpm build
pnpm test:unit
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test:integration
python3 tests/firmware/native/weather_test.py
python3 tests/firmware/native/wake_session_test.py
python3 tests/firmware/native/buttons_test.py
python3 tests/firmware/native/power_test.py
python3 tests/firmware/native/clock_test.py
python3 tests/firmware/native/navigation_test.py
python3 tests/firmware/native/render_clock.py --preview /tmp/bmo-clock-preview/index.html
/Users/apple/.platformio/penv/bin/pio run -d firmware -e esp32cam -e esp32cam_bench
git diff --check
```

`pnpm test:unit` gồm production HTTP test mới nên cần build hiện tại trước. Các integration fixture cần mở localhost và đọc process identity; sandbox có thể gây `listen EPERM`/`STATE_IDENTITY_UNAVAILABLE`, phải chạy với quyền môi trường phù hợp. PlatformIO cần quyền ghi cache `~/.platformio`; lỗi sandbox không phải lỗi firmware. Playwright cần Chromium hoặc Chrome đã cài, xem README; không tự nâng version.

6. Main review cuối theo5Review Focus trong plan, kiểm tra code/test thật; sửa lỗi có regression test. Rà UI desktop/mobile screenshot và OLED preview.
7. Hoàn thiện `docs/CLOCK_WEATHER_IMPLEMENTATION.md` với command/result thực chạy, các phần chưa chứng minh, quyết định khác plan. Chỉnh trạng thái plan theo evidence, không tự tick hardware/production PASS. Báo output tiếng Việt ngắn cho người dùng, link báo cáo/runbook.

## 5. Những điều tuyệt đối chưa được chứng minh

- Dòng điện/thời lượng pin toàn board; GPIO12/15 pull-up/bootstrapping và từng nút wake; ngủ≥30phút không radio wake; retained tới ESP thật.
- Mốc tắt radio20s và **thời gian worker TLS đang block kết thúc** phải đo physical fault bench. Main tắt radio ởdeadline, nhưng một TLS call có thể cần thêm thời gian unwind. Host state-machine test không chứng minh TLS thật.
- Vercel production với remote Turso/brokerTLS, HEAD quaCDN/DeploymentProtection, monitor thực gửi auth/HEAD, ba chu kỳ15phút, ACL/retained qua brokerrestart.
- Chưa toàn bộ full-suite cuối, chưa independent final signoff. Không tuyên bố “hoàn tất mọi thứ/đã tiết kiệm X% pin”. Không đánh dấu Phase2live-provider hoặc toànPhase4/5 complete.

## 6. Artifacts và recovery

- `/tmp/bmo-clock-firmware-worklog.md`.
- `/tmp/bmo-clock-preview/index.html` và4PNG.
- `/tmp/bmo-weather-desktop.png`, `/tmp/bmo-weather-mobile.png` đã tồn tại, main chưa inspect.
- Logs nêu ở bảng trên. `/tmp` có thể mất; khi thiếu, **rerun kiểm tra**, không dựa vào tênfile làm bằng chứng.
- Scratch ledger `.superpowers/sdd/2026-11-15-clock-weather-on-wake/progress.md` có preflight/ownership; ưu tiên checkpoint này mới hơn.
- Không có commit feature để cherry-pick; cần giữ cả **modified + untracked** trong working tree. Các thay đổi CAD trước đó do người dùng/phiên khác có thể đã commit trong lúc làm; không can thiệp.

## 7. Prompt để gửi AGY

Copy nội dung [2026-11-15-clock-weather-AGY-PROMPT.md](2026-11-15-clock-weather-AGY-PROMPT.md) vào AGY. Checkpoint này là tài liệu chuyển tiếp, không phải yêu cầu Codex tự tiếp tục sau khi xuất.
