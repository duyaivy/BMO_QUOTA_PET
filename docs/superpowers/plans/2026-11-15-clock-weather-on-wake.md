# Đồng hồ và thời tiết chỉ lấy khi thức — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm clock đầu nhóm biểu cảm, cho ESP ngủ đến khi bấm nút, lấy giờ/thời tiết một lần khi thức; server Vercel cập nhật thời tiết mỗi 15 phút.

**Architecture:** Người dùng chọn địa điểm tại `/devices` → lưu Turso; uptime monitor HEAD có token mỗi 15 phút → Vercel lấy Open-Meteo → cache Turso → MQTT outbox → broker retained. ESP boot/thức → Wi-Fi + SNTP → nhận config/quota/weather retained → tắt mạng, clock tự chạy → sau 5 phút không tương tác tắt OLED và light-sleep chỉ thức bằng nút. Server và ESP có lịch hoạt động độc lập.

**Tech Stack:** Next.js App Router Node.js runtime, TypeScript/Zod, Drizzle/libSQL/Turso, MQTT/TLS, Arduino ESP32/PlatformIO, Adafruit SSD1306/GFX.

**Spec:** [Thiết kế theo yêu cầu đã chốt](../specs/2026-11-15-clock-weather-wake-design.md). Đọc cả spec trước khi thực hiện; bản lựa chọn cũ chỉ còn là lịch sử phương án.

**Trạng thái:** Bản cập nhật 2 theo yêu cầu uptime HEAD và địa điểm trên web; các quyết định kỹ thuật còn lại đã chọn theo ủy quyền, **CHƯA TRIỂN KHAI**. Các lệnh và kết quả mong đợi dưới đây là hướng dẫn cho lượt thực hiện, chưa phải bằng chứng đã chạy. Thực hiện lần lượt; lượt hiện tại chỉ sửa tài liệu.

## Global Constraints

- Không tự thức định kỳ để lấy thời tiết. Chỉ boot/thức do nút mới bắt đầu một phiên mạng; đổi trang không mở phiên mới.
- Ngủ sau **5 phút** không tương tác; phiên mạng tối đa **20 giây** và kết thúc sớm khi đủ dữ liệu.
- Server gọi API theo lịch **15 phút**; cache và công việc chờ phải bền vững ngoài RAM/đĩa local của Vercel.
- Uptime monitor dùng **HEAD**; GET chỉ hỗ trợ kiểm tra thủ công, cùng auth/due/lease; không thêm weather cron vào Vercel.
- Địa điểm chọn trên web `/devices`, một địa điểm chung theo mô hình single-owner; lưu DB bằng revision CAS, không dùng biến môi trường tọa độ.
- Token ngẫu nhiên **32 byte**, server lưu SHA-256 tại `BMO_WEATHER_TRIGGER_TOKEN_SHA256`; ưu tiên Bearer header, hỗ trợ query token nếu monitor chỉ cấu hình URL.
- Weather ≤**512 byte UTF-8**; snapshot/config giữ giới hạn **8 KiB**. Weather hết hạn sau **60 phút** từ dataAt, không từ fetchedAt.
- UTC trên wire; HH:MM 24h, UTC+7, T2–T7/CN và DD/MM trên OLED.
- Giữ nguyên ID các biểu cảm, config/snapshot v1, TLS CA verification và các semantics quota hiện có.
- Dùng Node.js 24.18.0 và pnpm 11.24.0 theo repo; không tự nâng dependency/toolchain. Đối chiếu bản Node được Vercel hỗ trợ khi deploy.
- Chỉ thay đổi tính năng clock/weather/power được duyệt; không sửa các file CAD, không tự chạy phase khác, deploy/cài scheduler/flash.

## Review Focus

1. Giữ nút hoặc bấm khi đang chuyển sleep không gây vòng thức liên tục/click giả — Task 6/7.
2. Hạn 20 giây phải bao gồm DNS, TCP/TLS/SNTP; connect đồng bộ không được chặn nút/vẽ đến hết timeout — Task 5.
3. Monitor HEAD retry/đa vùng/cold start không gọi provider trước 900 giây hoặc báo thành công khi token sai — Task 2/4.
4. Hai tab lưu/đổi địa điểm giữa fetch hoặc mất retained không làm dữ liệu cũ sống lại — Task 2A/2/3/4A/5.
5. Đồng hồ qua ngày/tháng/năm nhuận và thiết bị không có giờ không hiển thị ngày/thời tiết giả — Task 5/7.

## Cấu hình kích hoạt đã chọn

- Uptime monitor gọi `HEAD https://<production-domain>/api/internal/weather/refresh` mỗi **15 phút**, timeout **30 giây hoặc lớn hơn**. Token đặt trong Bearer header; nếu monitor không hỗ trợ header thì dùng query `?token=<secret>`.
- Trên Vercel chỉ đặt digest SHA-256 của token; không đổi `CRON_SECRET` maintenance hiện tại. Không thêm lịch weather native cron hoặc dùng ping để giữ Function sống.
- Người dùng tìm/chọn địa điểm trên web; mặc định chưa cấu hình, không tự điền vị trí. Không cần cung cấp tọa độ trước để duyệt/thực hiện bằng fixture.
- Broker dùng hạ tầng MQTT ngoài Vercel; bổ sung topic weather vào ACL, kiểm chứng retained persistence. Enable chỉ device đã cập nhật firmware qua `BMO_WEATHER_DEVICE_IDS`.

Tên hãng monitor và cấu hình thật được kiểm chứng ở bước kích hoạt riêng; không giả định khả năng đặt header, timeout hoặc retry của một sản phẩm chưa được nêu. Các giá trị secret thật chỉ nhập khi kích hoạt, không ghi vào plan. Chỉ smoke production mới chứng minh HEAD đi qua CDN/protection và tới Function.

## File map

| Phạm vi                | File mới                                                                                       | File sửa                                                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Hợp đồng               | `src/contracts/weather/index.ts`, `firmware/include/weather.h`                                 | `src/contracts/mqtt/index.ts`, `firmware/include/contracts.h`                                                        |
| Cache/provider         | `src/server/weather/{config,provider,repository,refresh}.ts`, `drizzle/0006_weather_cache.sql` | `src/server/db/schema.ts`                                                                                            |
| MQTT/weather lifecycle | `src/server/weather/projection.ts`                                                             | `src/server/mqtt/{outbox,drain,publisher}.ts`, `src/server/devices/repository.ts`, `src/server/maintenance/index.ts` |
| Vercel job             | `src/app/api/internal/weather/refresh/route.ts`, `docs/WEATHER_SCHEDULING.md`                  | `.env.example`, `docs/DEPLOYMENT_GUIDE.md`, `next.config.ts` nếu cần đóng gói migration                              |
| Phiên mạng             | `firmware/include/wake_session.h`, `firmware/src/wake_session.cpp`, `firmware/src/weather.cpp` | `firmware/{include,src}/{wifi_manager,mqtt_client}.*`, `firmware/include/config.example.h`, `firmware/src/main.cpp`  |
| Sleep/nút              | —                                                                                              | `firmware/{include,src}/{power_manager,buttons}.*`                                                                   |
| Clock                  | `firmware/include/clock_renderer.h`, `firmware/src/clock_renderer.cpp`                         | `firmware/{include,src}/navigation.*`, `firmware/src/main.cpp`                                                       |

Tên migration 0006 dùng nếu vẫn trống ở lúc triển khai; giữ thứ tự hiện tại và không đổi checksum migration đã chạy. UI chọn địa điểm là card mới trong trang `/devices`, không tạo app/trang cấu hình mới.

Bổ sung file map cho yêu cầu mới:

| Phạm vi         | File mới                                                                                                                        | File sửa                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Địa điểm server | `src/server/weather/{locations,settings}.ts`, `src/app/api/weather/locations/route.ts`, `src/app/api/settings/weather/route.ts` | `src/contracts/weather/index.ts`, `src/server/db/schema.ts`, cùng migration weather |
| Địa điểm web    | `src/components/weather/weather-settings.tsx`, `tests/browser/weather.spec.ts`                                                  | `src/app/(protected)/devices/page.tsx`, `tests/fixtures` setup hiện có khi cần      |
| Auth monitor    | `src/server/weather/trigger-auth.ts`                                                                                            | `src/app/api/internal/weather/refresh/route.ts`, `.env.example`, docs scheduling    |

Thứ tự thực hiện: **Task 1 → 2A → 3 → 2 → 4 → 4A → 5 → 6 → 7 → 8**. Task 2A tạo cả schema settings/cache; Task 3 hoàn thiện enqueue/delivery để Task 2 có thể commit observation và enqueue qua interface đã tồn tại. Các task có hậu tố giữ số để đọc lại các liên kết bản trước. Trong lượt thực hiện dùng `superpowers:executing-plans`, làm tuần tự trong phiên; không cần hỏi lại cách chia việc đã được giao quyết định.

---

### Task 1: Chốt hợp đồng nhỏ cho server và ESP

**Files:** tạo `src/contracts/weather/index.ts`, `firmware/include/weather.h`; sửa `src/contracts/mqtt/index.ts`, `firmware/include/contracts.h`; test `tests/weather/contracts.test.ts`, `tests/firmware/native/weather_test.py`.

**Interfaces:** xuất `DeviceWeatherV1`, `deviceWeatherSchema`, `MAX_WEATHER_PAYLOAD_BYTES=512`; `buildDeviceTopic(deviceId,'weather')` và parser hỗ trợ topic mới. C++ `WeatherSnapshot` dùng buffer cố định, enum condition và temperature nullable; `bool parseWeatherPayload(const uint8_t* payload, size_t length, const char* expectedDeviceId, WeatherSnapshot& out)` không sửa out nếu invalid.

- [ ] Viết test schema các trường/nullable theo spec, wrong device/version, unknown fields, 513 byte, UTF-8 byte count, nhiệt độ ngoài [-100,70], revision không an toàn; test v1 quota/config cũ vẫn hợp lệ.
- [ ] Chạy `pnpm exec vitest run tests/weather/contracts.test.ts tests/mqtt/contracts.test.ts` và `python3 tests/firmware/native/weather_test.py`, xác nhận ca mới đỏ vì thiếu implementation.
- [ ] Cài TS schema và C++ parser; giới hạn revision C++ dùng kiểu đủ chứa safe integer TS, không thu hẹp xuống uint32 âm thầm. Thêm `weather` vào union topic, không thêm kind clock vào screens v1.
- [ ] Thêm browser-safe schema/types cho `WeatherLocationChoice`, `WeatherSettingsView`, `SaveWeatherLocationInput={expectedRevision:number,locationId:number}`; settings chưa chọn có `location:null`, `revision:1`, không gửi token/digest xuống browser. Các nullable/status/giới hạn phải thống nhất spec và Task 2A.
- [ ] Chạy lại hai lệnh, yêu cầu PASS; kiểm tra malformed không làm mất cache tốt. Commit riêng hợp đồng.

### Task 2A: Tìm và lưu địa điểm trên server

**Files:** `src/server/weather/{config,locations,settings}.ts`, `src/app/api/weather/locations/route.ts`, `src/app/api/settings/weather/route.ts`, `src/server/db/schema.ts`, cùng `drizzle/0006_weather_cache.sql`; test `tests/weather/{locations,settings,settings-route}.test.ts`.

**Interfaces:** `searchWeatherLocations(query:string,signal:AbortSignal):Promise<WeatherLocationChoice[]>`; `resolveWeatherLocation(locationId:number,signal:AbortSignal):Promise<WeatherLocationChoice>`; `readWeatherSettings():Promise<WeatherSettingsView>`; `saveWeatherLocation(input:unknown):Promise<{settings:WeatherSettingsView;changed:boolean}>`. Route mutation chỉ trả `result.settings`; cờ changed dùng nội bộ để Task 4 đăng ký after-save. Choice gồm provider `open-meteo`, ID, name, admin1/country optional, countryCode, latitude/longitude, timezone. View gồm revision, location nullable, status `unconfigured|pending|fresh|stale|error`, dataAt/fetchedAt/lastJobAt nullable và nhiệt độ/condition nullable; UI tự ghi rõ device offline chưa chắc đã nhận.

**HTTP:** GET `/api/weather/locations?q=<name>` → `{data:choices}`; GET `/api/settings/weather` → `{data:view}`; POST `/api/settings/weather` body chỉ `{expectedRevision,locationId}` → `{data:view}`. Dùng response/error envelope repo; 401/403 auth, 400 invalid, 409 conflict, 429 rate limit, 503 upstream tạm lỗi.

- [ ] Viết test admin/CSRF/origin bắt buộc; thiếu auth không gọi geocoder; query 2/101 ký tự và ID sai bị từ chối; tên trùng trả mô tả để phân biệt; provider thiếu results trả []; provider timeout/quá 32 KiB trả 503; lưu không nhận tọa độ do browser tự gửi.
- [ ] Viết test reload/cold-start giữ địa điểm; hai expectedRevision giống nhau chỉ một save thắng; resolve lỗi không đổi cấu hình cũ; save cùng ID no-op; đổi location lúc worker đang fetch vô hiệu kết quả worker cũ. 31 request tìm/resolve trong phút cùng session trả 429, session khác có budget riêng.
- [ ] Chạy `pnpm exec vitest run tests/weather/locations.test.ts tests/weather/settings.test.ts tests/weather/settings-route.test.ts`; xác nhận ca mới đỏ.
- [ ] Tạo `weather_settings` singleton id=1/revision=1/location null khi migrate; locationRevision dùng chung revision cấu hình địa điểm. Tạo luôn bảng `weather_cache` gồm locationRevision, observation JSON nullable, dataAt/fetchedAt/lastJobAt nullable, nextAttemptAt, leaseOwner/leaseExpiresAt và lastErrorCode nullable; Task 2/3 dùng schema này. Thêm config `BMO_WEATHER_ENABLED=false`, `BMO_WEATHER_DEVICE_IDS=[]` trong `config.ts`.
- [ ] Cài geocoding search dùng `https://geocoding-api.open-meteo.com/v1/search`, count=5/language=vi; resolve ID qua `/v1/get?id=<id>`. Host cố định, không follow redirect sang host khác, timeout 5 giây/body 32 KiB; chuẩn hóa những trường optional trước trả client.
- [ ] Reuse `adminRead`, `adminMutation` trong `src/server/http.ts` để đọc/lưu; bổ sung helper rate-limit riêng weather dùng DB và hash session, không đổi rate limiter login. GET proxy cũng requireAdmin trước network. Settings POST gọi resolve với budget chung rate-limit, validate provider record, sau đó giao dịch CAS + bỏ cache/lease cũ + enqueue unavailable cho device allowlist đã enabled. Ở bước này dùng `enqueueOutboxMessage/getNextOutboxRevision` sẵn có với schema Task 1; Task 3 gom vào `enqueueDeviceWeather` chung. Không giữ DB transaction qua HTTP resolve.
- [ ] Save trả pending sau khi giao dịch commit; **Task 4** mới nối `after()` tới runner thực đã hoàn thiện. Không tạo stub runner hoặc gọi API weather trong Task 2A. Cookie/CSRF/admin chỉ dùng ở boundary, scheduler không dùng cookie.
- [ ] Chạy lại ba suite và migration first/repeat: PASS. Commit địa điểm server.

### Task 2: Cache bền vững, lấy API và chiếu bản tin weather

**Files:** các file `src/server/weather/*.ts` trong file map; `drizzle/0006_weather_cache.sql`, `src/server/db/schema.ts`; test `tests/weather/{provider,repository,refresh}.test.ts`.

**Interfaces:** dùng settings của Task 2A; `WeatherLocation={latitude:number,longitude:number,revision:number}`; `fetchCurrentWeather(location:WeatherLocation, signal:AbortSignal):Promise<WeatherObservation>`; observation gồm condition, temperatureC, isDay, dataAt. `refreshWeather(options?:{nowMs?:number; fetchImpl?:typeof fetch; deadlineMs?:number}):Promise<WeatherRefreshResult>` trả status `updated|unchanged|not_due|busy|unconfigured|disabled|failed`, fetchedAt và số bản tin enqueue, không trả secret.

- [ ] Viết regression: hai invocation tranh cùng lease chỉ một gọi provider; timeout/429/5xx/JSON hỏng không đổi bản tốt; source timestamp cũ/tương lai không thay cache; đổi locationRevision khi fetch đang chạy loại kết quả lease cũ. Thành công lặp cùng dataAt không kéo dài validUntil.
- [ ] Chạy `pnpm exec vitest run tests/weather/provider.test.ts tests/weather/repository.test.ts tests/weather/refresh.test.ts`, xác nhận đỏ trước cài đặt.
- [ ] Dùng config và `weather_cache` từ Task 2A, không thêm env LATITUDE/LONGITUDE/LOCATION_REVISION. Đọc địa điểm Task 2A, chưa có thì trả unconfigured, không gọi API. Cài durable CAS, lease **45 giây**, compare token/locationRevision khi ghi. Claim đặt nextAttemptAt ít nhất startedAt+900000 ngay trước HTTP để duplicate kể cả sau crash không gọi lại sớm.
- [ ] Cài provider với HTTPS host cố định `api.open-meteo.com`, current fields theo spec, UTC, timeout **5 giây**, response ≤**32 KiB** trước parse. Mapping WMO sang tám condition trong spec; kiểm tra đơn vị Celsius/boolean và timestamps. Không gọi HTTP trong DB transaction.
- [ ] Cài refresh: nextAttemptAt = startedAt+15 phút cho success hoặc failure; không lặp trong một invocation. Lưu fetchedAt theo thời gian hoàn tất thực, không thay dataAt. Trong giao dịch commit observation và enqueue weather cho device allowlist còn enabled; dùng dataAt+60 phút, không tăng tuổi theo receipt. Chấp nhận dữ liệu nguồn không đổi, vẫn reconciliation khi cần. Save đổi địa điểm tạo generation mới được lấy lượt đầu ngay; save lại cùng ID không bypass gate. Thêm test duplicate HEAD/GET ở startedAt+899999 không gọi API; +900000 thì được gọi nếu lease rảnh.
- [ ] Chạy lại tests và migration lần đầu/lặp trên DB tạm: PASS, không duplicate. Commit cache/provider và mô tả nguồn/attribution.

### Task 3: Retained delivery, retire và khôi phục trên Vercel

**Files:** `src/server/weather/projection.ts`, `src/server/mqtt/{outbox,drain,publisher}.ts`, `src/server/devices/repository.ts`, `src/server/maintenance/index.ts`; test `tests/weather/delivery.test.ts`, `tests/mqtt/{outbox,drain}.test.ts`, `tests/devices/lifecycle.test.ts`.

**Interfaces:** `enqueueDeviceWeather(tx:Transaction,deviceId:string,nowMs:number):Promise<string|null>`; `reconcileWeatherDelivery(nowMs:number):Promise<number>` phục hồi weather cho thiết bị allowlist còn enabled, queue unavailable nếu chưa có nguồn hợp lệ; mở rộng `DrainOptions` với `deadlineMs?:number`, `topicKinds?:MqttTopicKind[]`.

- [ ] Viết test retained nhận khi subscriber thức sau hai lần refresh; duplicate/out-of-order; retire có weather tombstone; allowlist xóa thiết bị thì tombstone khi reconcile; device mới nhận cache hiện có; broker mất retained thì job lần sau republish bản hiện tại.
- [ ] Viết test outbox bị backlog quota/broker timeout không làm job weather vượt deadline; lease bị mất không acknowledge/overwrite bản mới; dữ liệu địa điểm cũ không thể publish sau địa điểm mới. Chạy suites nêu trên để xác nhận ca mới đỏ.
- [ ] Mở rộng topic-aware projection/retire/reconciliation, không giới hạn tất cả outbox xuống 512 byte. Reconciliation mỗi lượt refresh bảo đảm bản weather mới nhất lại đến broker, kể cả upstream trả cùng dữ liệu; revision nguồn và retry không được thay dataAt.
- [ ] Thêm absolute deadline vào drain/publisher path: kiểm tra thời gian thực trước mỗi I/O và giới hạn từng timeout theo budget còn lại; giữ lease bằng token và fencing/renewal khi cần. Retry là durable pending, không nối nhiều đợt trong Function. Job weather ưu tiên `topicKinds:['weather']`, một thiết bị trong phạm vi bản đầu.
- [ ] Chạy `pnpm exec vitest run tests/weather/delivery.test.ts tests/mqtt/outbox.test.ts tests/mqtt/drain.test.ts tests/devices/lifecycle.test.ts`: PASS. Commit delivery/lifecycle.

### Task 4: Endpoint HEAD có token cho uptime monitor trên Vercel

**Files:** `src/app/api/internal/weather/refresh/route.ts`, `src/server/weather/trigger-auth.ts`, `.env.example`, `docs/WEATHER_SCHEDULING.md`, `docs/DEPLOYMENT_GUIDE.md`; test `tests/weather/{trigger-auth,route}.test.ts`, `tests/weather/http.test.ts`. Không thêm weather cron vào `vercel.json`.

**Interfaces:** `verifyWeatherTrigger(request:Request):'authorized'|'unauthorized'|'misconfigured'`; `runWeatherJob(options?:{deadlineMs?:number}):Promise<WeatherJobResult>` trong `src/server/weather/refresh.ts`, dùng refresh/reconciliation/drain của Task 2/3. WeatherJobResult status gồm updated/unchanged/not_due/busy/unconfigured/disabled/failed, requestId, thời điểm observation/job và publishedCount; không trả secret. Export HEAD/GET rõ ràng; `runtime='nodejs'`, `dynamic='force-dynamic'`, `maxDuration=30`.

| Request/kết quả                      | Status | Body HEAD       | Header                                    |
| ------------------------------------ | ------ | --------------- | ----------------------------------------- |
| Token sai/thiếu                      | 401    | rỗng            | no-store; không chạy DB/provider          |
| Digest config thiếu/sai format       | 503    | rỗng            | result=misconfigured                      |
| Updated/unchanged                    | 200    | rỗng            | result=updated/unchanged                  |
| Chưa đến 900 giây/có lease đang chạy | 200    | rỗng            | result=not_due/busy                       |
| Chưa chọn địa điểm/chưa bật weather  | 200    | rỗng            | result=unconfigured/disabled              |
| Provider/DB/publish lỗi              | 503    | rỗng            | result=failed                             |
| POST hoặc phương thức ngoài hợp đồng | 405    | theo chuẩn HTTP | Allow: GET, HEAD, OPTIONS; không chạy job |

GET giữ cùng status/logic, thêm JSON diagnostics. OPTIONS không kích hoạt và trả Allow. Header mọi response: `Cache-Control: private, no-store, max-age=0`, `CDN-Cache-Control: no-store`, `Vercel-CDN-Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-BMO-Weather-Result`, `X-Request-Id`; không có token, URL đầy đủ hoặc tọa độ trong diagnostics monitor.

- [ ] Viết auth tests token Bearer/query hợp lệ; token sai/rỗng/>256 ký tự, digest env sai format, query trùng, header sai kèm query đúng, hai nguồn token; không chấp nhận CRON_SECRET hoặc BMO_MAINTENANCE_SECRET thay token riêng. So sánh digest cố định 32 byte bằng timingSafeEqual.
- [ ] Viết route tests HEAD/GET tương đương nghiệp vụ, HEAD body luôn rỗng cả lỗi; unauthorized không gọi DB/provider; POST không chạy; no-store đầy đủ; disabled/unconfigured không fetch; duplicate HEAD rồi GET và HEAD nhiều vùng chỉ một fetch; không log token cả khi lỗi. Test fake-clock tại 899999/900000 ms và provider/lease failure.
- [ ] Chạy `pnpm exec vitest run tests/weather/trigger-auth.test.ts tests/weather/route.test.ts`; xác nhận đỏ trước cài đặt.
- [ ] Cài auth: lấy đúng một nguồn token, SHA256 supplied token, so digest env `BMO_WEATHER_TRIGGER_TOKEN_SHA256` là 64 hex. Token 32 byte ngẫu nhiên base64url được tạo **khi kích hoạt**, không sinh token thật trong lượt lập plan. Token hash lưu server, token raw nhập monitor; gửi hash của một giá trị dễ đoán không thay thế secret mạnh.
- [ ] Cài `runWeatherJob` với deadline chung **25 giây**: đọc due/lease và refresh, sau đó reconciliation/drain weather với thời gian còn lại. Invocation hợp lệ nhưng not_due vẫn có thể retry công việc outbox due, không gọi provider lại. Dùng một short lease job để monitor dày không lặp republish liên tục; sửa Task 3 reconciliation để chỉ republish latest khi refresh lượt 15 phút/khôi phục due, không mỗi HEAD. Mọi ghi sau fetch dùng fencing token/locationRevision.
- [ ] Nối route POST settings của Task 2A: chỉ save làm đổi địa điểm mới đăng ký `after(async()=>await runWeatherJob({deadlineMs:Date.now()+25000}))`; cấu hình route settings Node.js/maxDuration=30 phù hợp. Repository trả cờ changed nội bộ cho route nhưng không lộ token; no-op không đăng ký job. Monitor và after-save dùng cùng due/lease, after-save bị ngắt vẫn phục hồi ở monitor kế tiếp.
- [ ] Cài explicit HEAD `return new Response(null,...)`, GET JSON; await job trước response; response HEAD không phụ thuộc đọc body. Khi request monitor ngắt kết nối sớm, durable due/outbox vẫn giữ kết quả đã commit; lần gọi sau phục hồi. Không trả 200 cho publish thất bại và không coi 200 not_due là chứng nhận dữ liệu mới.
- [ ] Runbook cấu hình monitor: HEAD, interval 15 phút, timeout ≥30 giây, production HTTPS URL chuẩn không redirect, header `Authorization: Bearer <token>`. Fallback URL `https://<domain>/api/internal/weather/refresh?token=<token>` khi thiếu custom header; không bật cả hai. Kiểm tra hãng monitor thực sự gửi token ở HEAD và không đổi sang GET ở redirect.
- [ ] Ghi flow rotate token bằng thay cấu hình monitor và digest server trong cùng đợt bảo trì; không giữ token cũ vô hạn. Header ưu tiên để tránh token trong URL logs; app log chỉ requestId/status, không Request.url/header. Không hiển thị token hay digest trên web.
- [ ] Ghi yêu cầu Turso remote, bundle migration SQL, vùng Function gần DB/broker, Node version, outbound TLS/ACL; preview không dùng production secrets/DB/broker và job disabled. Deployment Protection nếu chặn trước Function cần automation bypass riêng của nền tảng; weather token vẫn phải hợp lệ, không gỡ auth dashboard.
- [ ] Chạy HTTP thật bằng server production tạm với digest/token test cố định: HEAD hai lần có cùng due window chỉ một provider call, response body length 0, GET cùng logic, HEAD sai token 401, không cache dù URL lặp. `pnpm exec vitest run tests/weather/http.test.ts` được cấu hình launch server/DB/broker tạm tự đóng, không trỏ production.
- [ ] Chạy auth/route/HTTP tests, `pnpm typecheck`, `pnpm lint`, `pnpm build`; PASS. Kiểm tra trace migration SQL; bổ sung `outputFileTracingIncludes` trong `next.config.ts` nếu thiếu. Commit endpoint/docs; chưa deploy.

Ví dụ assertion bắt buộc trong `tests/weather/route.test.ts` (test harness inject fake clock/provider):

```ts
expect(headResponse.status).toBe(200);
expect(await headResponse.text()).toBe("");
expect(headResponse.headers.get("X-BMO-Weather-Result")).toBe("updated");
expect(secondHead.headers.get("X-BMO-Weather-Result")).toBe("not_due");
expect(fetchWeatherMock).toHaveBeenCalledTimes(1);
expect(unauthorizedHead.status).toBe(401);
expect(dbAccessForUnauthorizedRequest).toBe(0);
```

### Task 4A: Card tìm/chọn/lưu địa điểm trên web

**Files:** tạo `src/components/weather/weather-settings.tsx`, `tests/browser/weather.spec.ts`; sửa `src/app/(protected)/devices/page.tsx`; dùng API/schema Task 1/2A/4 và UI primitives hiện có. Không thay DeviceEditor quota/screens schema.

**Interfaces:** `WeatherSettings({initialSettings}:{initialSettings:WeatherSettingsView})`; page đọc server `readWeatherSettings()` trong route đã bảo vệ và truyền initialSettings. Không import server-only vào component client.

**Luồng UI:** card “Thời tiết trên BMO”; ô có label “Tìm thành phố hoặc tỉnh”, nút “Tìm địa điểm”; radio results hiển thị name/admin1/country; nút “Lưu địa điểm”. Địa điểm đã lưu/status/dataAt/fetchedAt hiển thị riêng khỏi lựa chọn nháp; thêm “Giờ thiết bị: Việt Nam (UTC+7)”, “BMO nhận cập nhật khi bạn đánh thức thiết bị”, attribution Open-Meteo.

- [ ] Viết Playwright: tìm hai nơi trùng tên chọn đúng tỉnh/quốc gia, lưu/reload giữ lựa chọn; chưa chọn không save; empty/error geocoder có thông báo; stale search không đè kết quả mới; keyboard/Enter/radio/mobile dùng được. Provider được mock qua fixture phía server, không gọi geocoder thật trong suite.
- [ ] Viết test hai tab lưu revision cũ trả 409: không tự ghi đè, giữ lựa chọn nháp, tải bản mới và yêu cầu người dùng bấm lưu lại. Lưu cùng ID không trigger provider; UI pending sau-save không báo “ESP đã nhận”. Thiếu session về login, CSRF fail không ghi DB.
- [ ] Chạy `pnpm build` rồi `pnpm exec playwright test tests/browser/weather.spec.ts`, xác nhận ca mới đỏ trước cài UI.
- [ ] Cài form tìm bằng submit, chỉ tìm khi query 3–100 ký tự; AbortController/request sequence bỏ response cũ, không query mỗi phím. Nút save lấy CSRF theo pattern DeviceEditor, gửi duy nhất expectedRevision/locationId; xử lý 409/429/503 bằng thông báo ngắn, không xóa cấu hình đã lưu.
- [ ] Sau save refresh view; nếu pending, poll `/api/settings/weather` mỗi **5 giây**, tối đa **30 giây** chỉ lúc tab visible và pending, dừng khi terminal/unmount; poll chỉ đọc DB không gọi provider. Khi job chậm hơn thì hiện “Đã lưu địa điểm, đang chờ lần cập nhật tiếp theo”, người dùng có thể tải lại, không poll vô hạn.
- [ ] Hiển thị loading/disabled/empty states và role status cho kết quả thao tác; format giờ web theo UTC+7. Không lộ digest/token hay nội dung kỹ thuật MQTT trong form chọn địa điểm. Page load/reload không gọi provider và không tự thay địa điểm.
- [ ] Chạy `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm exec playwright test tests/browser/weather.spec.ts`: PASS. Chụp ảnh desktop/mobile cho review khi triển khai. Commit UI địa điểm.

### Task 5: Một phiên lấy dữ liệu khi ESP thức

**Files:** `wake_session.h/.cpp`, `weather.cpp`, `wifi_manager.h/.cpp`, `mqtt_client.h/.cpp`, `config.example.h`, `main.cpp`; test `tests/firmware/native/wake_session_test.py`, mở rộng `weather_test.py`.

**Interfaces:** `BMOWakeSession::begin(uint32_t nowMs)`, `update(uint32_t nowMs)`, `isFinished() const`; `BMOConnectionManager::startWakeConnection()`, `stopForSleep()`; `BMOMqttClient::startWakeConnection()`, `stopForSleep()`, `hasWeather() const`, `getWeather() const`. Session states WIFI → TIME → MQTT → COMPLETE hoặc DEADLINE; Arduino time wrap phải an toàn.

- [ ] Viết fake-clock test chỉ boot/thức mở session; chuyển trang/đổi phút không mở session; hoàn tất sớm; deadline 20 giây kể cả chưa có giờ, DNS hỏng, TLS stall; disconnect có chủ đích không bị loop tự reconnect; giữ quota cache/matching configRevision; expired weather và timestamp quá tương lai.
- [ ] Chạy `python3 tests/firmware/native/wake_session_test.py` và `python3 tests/firmware/native/weather_test.py`, xác nhận đỏ.
- [ ] Tách provisioning ban đầu/chủ động reset khỏi connect khi thức. Vô hiệu autoReconnect/periodic reconnect ngoài session; không chờ getLocalTime trong vòng render. UTC+7 cho local display, UTC epoch cho TLS/validity. Không tự mở captive portal khi wake thất bại.
- [ ] Subscribe weather cùng config/snapshot, QoS theo khả năng PubSubClient; theo dõi đủ valid config, matching snapshot và weather terminal response/unavailable hoặc deadline. Không đợi mãi nếu topic chưa có retained. Cache cũ có thể hiện ngay với độ tươi đúng; chờ cập nhật không chặn UI.
- [ ] Xử lý I/O đồng bộ PubSubClient/WiFiClientSecure: đặt timeout theo budget còn lại, chạy connect/TLS trong một FreeRTOS worker có giới hạn; main task tiếp tục nút/vẽ, chỉ main sở hữu UI/cache và nhận kết quả qua queue cố định. Một worker/session, không cấp phát task lặp vô hạn; close transport ở deadline, không xóa task khi đang giữ mutex/TLS. Chứng minh worker dừng bounded bằng fault injection trước bench; không xem `setSocketTimeout(3)` là đã giới hạn mọi DNS/TLS.
- [ ] Chạy tests host và `~/.platformio/penv/bin/pio run -d firmware -e esp32cam -e esp32cam_bench`: PASS. Commit wake session.

### Task 6: Ngủ CPU đến khi nút đánh thức

**Files:** `power_manager.h/.cpp`, `buttons.h/.cpp`, `main.cpp`, tích hợp wake session; test `tests/firmware/native/power_test.py`.

**Interfaces:** `BMOPowerManager::shouldEnterSleep(uint32_t nowMs) const`, `enterButtonSleep()`, `BMOButtonManager::consumeWakePress()`; main gọi begin session đúng một lần sau sleep return. `SCREEN_TIMEOUT_MS=300000` được giữ.

- [ ] Viết test idle 5 phút theo wall time, không theo millis dừng trong sleep; bấm cập nhật activity; giữ nút trì hoãn sleep đến lúc thả; wake press bị consume tới release; chỉ một session sau wake. Test ngủ 45 phút không có event network/timer, không log/loop polling khi đã ngủ.
- [ ] Chạy `python3 tests/firmware/native/power_test.py`, xác nhận đỏ; cài sleep sequence: chờ worker đã đóng mạng → MQTT close/Wi-Fi off → OLED off → GPIO wake LOW cho A/B → light-sleep. Đảm bảo không còn nguồn timer wake từ cấu hình cũ; dùng gpio light-sleep wake phù hợp core, không dùng EXT1 ALL_LOW cho hai nút.
- [ ] Sau wake: OLED on, reset debounce/activity, consume wake press; clock lấy thời gian hệ thống hiện tại, bắt đầu session mới, không chạy lại splash/provisioning. Dùng monotonic clock còn chính xác qua light-sleep cho inactivity/deadlines và kiểm chứng trên core thực tế.
- [ ] Chạy test host và hai build PlatformIO: PASS. Kiểm tra phần cứng GPIO 12/15/pull-up/boot straps, giữ LED GPIO4/33 ở trạng thái tắt; commit power policy. Nếu wake không đạt trên board, báo blocker phần cứng, không âm thầm quay lại polling Wi-Fi.

### Task 7: Clock renderer và điều hướng nhóm biểu cảm

**Files:** `clock_renderer.h/.cpp`, `navigation.h/.cpp`, `main.cpp`; test `tests/firmware/native/{clock_test.py,navigation_test.py,render_clock.py}`; docs `firmware/README.md`.

**Interfaces:** `BMOClockRenderer::renderIfChanged(time_t now,const WeatherSnapshot* weather,bool force)`; `BMONavigationController::showClock()`; `CLOCK` là mode riêng trong nhóm A, không đổi enum face IDs.

- [ ] Viết test boot Clock, A Clock→Happy→…→Clock, B Clock→quota, A từ quota/end→Clock, quota rỗng/quay về; nút wake không chuyển trang. Date test UTC+7 qua 23:59/đầu tháng/năm/29-02 và epoch chưa sync.
- [ ] Viết test đếm flush: không render clock 30 FPS; một flush khi đổi phút/trạng thái, không flush khi ngủ/ẩn, force redraw ngay khi wake/time correction. Weather expired hiện unknown; không tạo ngày giả khi time unknown.
- [ ] Chạy tests host mới và `python3 tests/firmware/native/navigation_test.py`, xác nhận ca mới đỏ; cài font/layout HH:MM lớn, thứ/DD/MM nhỏ, icon 16×16 tĩnh/nhiệt độ. Dùng framebuffer hiện có, buffer cố định; không gọi face maximizing/scaling cho clock, không cấp phát chuỗi mỗi frame.
- [ ] Render preview bằng C++ production/GFX như harness faces hiện có, lưu ra `/tmp/bmo-clock-preview/index.html`; kiểm tra 128×64 không tràn ở 00:00/23:59 và -100/70°C. Chạy host tests, hai build PlatformIO: PASS. Commit clock/nav/docs.

### Task 8: Kiểm chứng tích hợp và ghi bằng chứng pin

**Files:** `tests/weather/integration.test.ts`, `tests/fixtures/device-simulator.ts`, `firmware/BENCH_TEST.md`, `docs/WEATHER_SCHEDULING.md`, `docs/IMPLEMENTATION_PHASES.md` và `docs/ARCHITECTURE_DECISIONS.md` đúng phạm vi được duyệt.

- [ ] Thêm kiểm chứng chọn địa điểm web → geocoder fixture → save DB → first fetch/HEAD monitor → Turso tạm → outbox → broker fixture → subscriber ngủ/thức; sleep qua hai refresh rồi nhận latest; API/broker lỗi, retained trống/old location, retire, duplicate HEAD và config race. Test route HTTP thật với secret placeholder và database tạm.
- [ ] Chạy `pnpm exec vitest run tests/weather` rồi `pnpm test:unit`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test:integration`; chạy các host test firmware ở Task 1/5/6/7 và hai env PlatformIO. Suite browser kiểm tra form mới và regression dashboard/device hiện có; không viết test markup thừa.
- [ ] Bench: đo clock sáng, animation, OLED off nhưng Wi-Fi còn bật (baseline), light-sleep với Wi-Fi off, wake/TLS peak; giữ nguồn/pin/độ sáng giống nhau. Ngủ ít nhất 30 phút, chứng minh không radio wake định kỳ; bấm từng nút và giữ nút; thử không Wi-Fi/NTP/broker, kiểm tra UI và giới hạn 20 giây.
- [ ] Sau khi được phép deploy/kích hoạt riêng: smoke Vercel production + remote Turso + broker TLS; chọn địa điểm trên web, kiểm chứng HEAD từ monitor có auth thật/no-cache/body rỗng, log ít nhất ba lượt 15 phút và retry không fetch sớm; lần ESP thức nhận retained mới. Kiểm tra timeout monitor và Deployment Protection trước khi tuyên bố scheduler hoạt động. Không dùng URL preview/cookie admin làm auth cho scheduler hoặc ESP. Không chạy activation trong lượt lập plan.
- [ ] Ghi riêng evidence local/fixture/build/bench/production; chỉ đánh dấu mục roadmap thực sự đã kiểm chứng. Không đổi Phase 2 live-provider hay tuyên bố toàn Phase 4 hoàn tất do thêm clock. Commit báo cáo đúng phạm vi.

## Tự rà soát plan

- [x] Bỏ lịch ESP tự thức lấy thời tiết; giữ 5 phút tắt màn hình và bổ sung sleep CPU/mạng.
- [x] Server 15 phút bằng uptime monitor HEAD, không còn lựa chọn weather cron Vercel mâu thuẫn.
- [x] Có nguồn giờ, clock/date/navigation, hợp đồng weather, cache, outbox/retained, lỗi/offline/đổi địa điểm/retire.
- [x] Địa điểm được tìm/chọn/lưu trên web; có revision conflict, rate limit, dữ liệu cũ và lỗi geocoder.
- [x] Token Bearer/query, digest server, HEAD response rỗng và due/lease bền vững có test riêng.
- [x] Những giá trị chưa do chủ dự án yêu cầu được chọn theo ủy quyền và ghi rõ trong spec.
- [x] Review Focus có regression ở các task tương ứng; hợp đồng interface thống nhất, task có lệnh kiểm chứng.
- [x] Không thực thi code/test sản phẩm hoặc kích hoạt hạ tầng khi viết plan. Kết quả PASS trong task là điều kiện tương lai.

**Điểm duyệt chính:** uptime monitor HEAD có token mỗi 15 phút; chọn địa điểm trên web; weather qua MQTT retained chung phiên quota; light-sleep chỉ nút thức; timeout mạng 20 giây; giữ tự ngủ 5 phút; weather TTL 60 phút. Chủ dự án chỉ cần duyệt nội dung plan, không phải chọn lại các quyết định kỹ thuật đã giao. Sau khi duyệt mới bắt đầu thực hiện.
