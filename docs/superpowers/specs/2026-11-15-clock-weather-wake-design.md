# Đồng hồ BMO: ngủ đến khi bấm nút, thời tiết server mỗi 15 phút

Ngày: 2026-11-15, bản cập nhật 2. **Chủ dự án đã chọn uptime monitor gọi HEAD có token và chọn địa điểm trên web; giao các quyết định còn lại cho người lập plan. Chưa triển khai.**

Tài liệu này thay thế lịch đánh thức định kỳ của hướng B trong [bản lựa chọn trước](2026-11-15-clock-weather-options.md). Những lựa chọn A/C và chu kỳ ESP tự thức 30 phút không còn là hướng thực hiện.

## Yêu cầu đã chốt

- Ưu tiên pin ESP; thiết bị ngủ đến khi người dùng đánh thức, **không tự thức định kỳ để lấy thời tiết**.
- Mỗi lần thức: bật Wi-Fi, đồng bộ giờ, lấy bản thời tiết server đã chuẩn bị, rồi ngắt mạng khi hoàn tất hoặc hết thời gian chờ.
- Giờ lấy bằng SNTP/NTP qua mạng Wi-Fi; bản thân Wi-Fi không cung cấp giờ. Sau đồng bộ, ESP tự giữ giờ.
- Server chạy trên **Vercel**, gọi API thời tiết bên thứ ba theo lịch **15 phút** độc lập với trạng thái ngủ của ESP.
- Scheduler ngoài là uptime monitor, kích hoạt bằng **HEAD** có token; hỗ trợ thêm GET cho kiểm tra thủ công.
- Người dùng đã đăng nhập chọn địa điểm thời tiết trên web, không cấu hình tọa độ bằng biến môi trường.
- Đồng hồ số HH:MM, thứ/ngày/tháng, icon thời tiết; là màn hình đầu nhóm biểu cảm theo giả định đã nêu trước.
- Lượt hiện tại chỉ viết thiết kế và plan; không đổi code sản phẩm, deploy, cấu hình cron/broker hay flash.

## Các quyết định kỹ thuật đã chọn theo ủy quyền

1. **Giữ thời gian tự tắt 5 phút như hiện tại**, tính bằng thời gian hoạt động thực; chuyển từ chỉ tắt OLED sang OLED off + ngắt MQTT/Wi-Fi + light-sleep CPU. Không có timer thức trong trạng thái ngủ này. Hai nút GPIO 15/12 active-low là nguồn thức; cần bench xác minh pull-up/wake. Light-sleep giữ RAM nên ít thay đổi hơn deep-sleep; hiệu quả pin phải đo cả board. [Espressif Sleep Modes](https://docs.espressif.com/projects/esp-idf/en/v4.4/esp32/api-reference/system/sleep_modes.html).
2. Mỗi lần boot bình thường/thức do nút chỉ chạy **một phiên lấy dữ liệu**, tổng ngân sách mạng **20 giây** từ khi bật mạng, kết thúc sớm nếu đủ dữ liệu. Không tự retry sau khi phiên kết thúc; lần thức kế tiếp thử lại. Thời gian provisioning Wi-Fi do người dùng chủ động mở được xử lý riêng.
3. Khi đang sáng, đồng hồ tự đổi phút; không lấy thời tiết lại mỗi 15 phút trên ESP. Nếu người dùng giữ thiết bị thức lâu, dữ liệu thời tiết có thể hết hạn và được đánh dấu cũ; lần thức tiếp mới lấy lại. Việc đổi trang/bấm tiếp không mở phiên mạng mới.
4. Nhận weather **qua MQTT retained** chung phiên với config/quota. “Lấy từ server khi thức” được thực hiện bằng nhận bản server đã publish lên broker; không thêm HTTPS request từ ESP lên Vercel. Tiết kiệm thêm một kết nối TLS và không phải bổ sung xác thực HTTP thiết bị. Broker là dịch vụ ngoài Vercel, giữ retained trong lúc ESP ngủ.
5. Server: tác vụ Node.js có giới hạn, cache bền vững Turso + outbox; không dùng tiến trình nền thường trực, RAM instance hoặc SQLite file trên Vercel làm nguồn dữ liệu bền vững. Không đặt broker/subscriber thường trực trong Function. [Vercel Functions lifecycle](https://vercel.com/docs/functions).
6. Scheduler chốt **uptime monitor bên ngoài**, HEAD mỗi 15 phút; không thêm weather cron vào `vercel.json` dù dùng gói Vercel nào. Maintenance hằng ngày hiện có giữ nguyên. Monitor có thể phát retry hoặc kiểm tra nhiều vùng; database giới hạn lần gọi provider, không dựa vào số request monitor.
7. Endpoint `/api/internal/weather/refresh` khai báo rõ HEAD và GET; cùng xác thực và logic job, khác body. Token ngẫu nhiên 32 byte, ưu tiên `Authorization: Bearer <token>`. Nếu monitor không đặt được header thì cho `?token=<token>`; server chỉ lưu SHA-256 token trong `BMO_WEATHER_TRIGGER_TOKEN_SHA256`. Token tĩnh/hash gửi trong request đều là thông tin xác thực có thể dùng lại; không cần HMAC timestamp mà monitor không tự tạo được. Không dùng CRON_SECRET hoặc session admin cho route này.
8. Provider **Open-Meteo**, current `temperature_2m,weather_code,is_day`, UTC, tọa độ lấy từ cấu hình web đã lưu. Chu kỳ gọi 15 phút không đảm bảo mô hình có giá trị khác sau mỗi lần gọi. Có nguồn/ghi nhận attribution trên web và docs. [Open-Meteo API](https://open-meteo.com/en/docs).

## Hợp đồng uptime monitor và Vercel

Next.js hỗ trợ khai báo HEAD riêng trong route handler. HEAD có thể chạy xử lý ứng dụng nhưng response không có body; đây là endpoint kích hoạt nội bộ được xác thực, không dùng route health công khai làm tác vụ. [Next.js Route Handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route).

- HEAD/GET cùng xác thực token **trước DB/provider**. Hash SHA-256 token đưa vào so sánh constant-time với digest cấu hình. Thiếu cấu hình digest trả 503; thiếu/sai token trả 401; không chấp nhận header sai rồi tự rơi xuống query token đúng, không chấp nhận query token trùng hoặc đồng thời hai nguồn token.
- HEAD: `new Response(null, {status,headers})`; không xây JSON rồi hy vọng framework tự bỏ body. GET: JSON diagnostics an toàn. POST và phương thức khác không kích hoạt job, trả 405; OPTIONS chỉ mô tả phương thức.
- Cả hai: `Cache-Control: private, no-store, max-age=0`, `CDN-Cache-Control: no-store`, `Vercel-CDN-Cache-Control: no-store`, `Referrer-Policy: no-referrer`; route force-dynamic, không redirect/login challenge. Kiểm chứng HEAD thực sự tới Function trên production, không chỉ dựa vào nhận 200 từ CDN.
- Headers diagnostics không chứa dữ liệu riêng: `X-BMO-Weather-Result`, `X-Request-Id`; status 200 cho updated/unchanged/not_due/busy/unconfigured/disabled, 503 cho lỗi provider/DB/publish, 401 cho token sai. HEAD busy/not_due vẫn healthy vì không cần chạy lại; 200 không đảm bảo weather fresh — web hiển thị riêng độ mới và lần job cuối.
- Function Node.js `maxDuration=30`; tổng deadline job 25 giây, provider timeout 5 giây; await việc chính và publish có giới hạn trước response, không trả 200 rồi bỏ promise chạy tự do. Monitor đặt timeout **30 giây hoặc lớn hơn**, không tự retry liên tục; server gate theo due/lease vẫn bảo vệ nếu monitor retry.
- Token chỉ được lưu ở phần cấu hình monitor và biến server digest; không trả token lên web, không đưa token vào docs/git/log. Query là phương án tương thích; URL có thể xuất hiện trong log của nền tảng/monitor, nên che khi chia sẻ và đổi token nếu lộ. Không hứa code ứng dụng có thể che được access log do nền tảng quản lý.
- Monitor gọi domain production chuẩn HTTPS trực tiếp. Nếu Deployment Protection chặn trước Function thì token weather không vượt được lớp đó; dùng quyền automation của Vercel khi thực sự cần, giữ lớp auth weather. Không bật weather trên preview hoặc đồng thời thêm Vercel cron. [Vercel Deployment Protection](https://vercel.com/docs/deployment-protection).
- Theo lịch monitor mỗi 15 phút; durable due tối thiểu 900 giây giữa hai **lần bắt đầu** gọi API cùng địa điểm, kể cả retry. 96 lượt/ngày là mức bình thường khi cấu hình ổn định; đổi địa điểm có thể phát sinh lượt đầu riêng. Không bảo đảm refresh đúng giây nếu monitor/API/broker chậm.

## Người dùng chọn địa điểm trên web

Giữ mô hình single-owner của repo: card **“Thời tiết trên BMO”** tại `/devices`, một địa điểm chung cho các BMO được bật weather. Chưa mở đăng ký hay nhiều tài khoản, chưa chọn địa điểm riêng cho từng thiết bị.

1. Chưa thiết lập: hiện “Chưa chọn địa điểm”, ô tìm và nút tìm; monitor không gọi weather API khi chưa có địa điểm.
2. Gõ tên thành phố/tỉnh (3–100 ký tự), tìm bằng nút hoặc Enter. Server proxy Geocoding Open-Meteo, `count=5`, `language=vi`; kết quả có tên, tỉnh/bang, quốc gia để phân biệt tên trùng. Không tìm theo mỗi phím gõ, không dùng GPS/quyền vị trí trình duyệt. [Open-Meteo Geocoding](https://open-meteo.com/en/docs/geocoding-api).
3. Chọn một kết quả bằng radio rồi nhấn **“Lưu địa điểm”**; không lưu tự động chỉ vì chọn. Server nhận provider location ID và expectedRevision, tự resolve ID thành dữ liệu chuẩn, không tin tọa độ/tên tùy ý từ browser.
4. Lưu thành công: DB lưu provider ID, tên hiển thị, tọa độ, country/admin, timezone thông tin, revision; tăng locationRevision **chỉ khi địa điểm đổi**, CAS conflict trả 409. Một địa điểm chung nhưng thay đổi phải được lưu bền vững qua deploy/cold start.
5. Đổi địa điểm: giao dịch vô hiệu observation cũ và lease cũ, enqueue weather unavailable thuộc revision mới cho device hợp lệ. Trigger lượt fetch đầu có giới hạn bằng Next.js `after()` sau response, có cùng durable lease/due/refresh với monitor; lần monitor tiếp phục hồi nếu job sau-save thất bại. Không làm browser chờ lấy weather; “Đã lưu, đang chờ cập nhật” là trạng thái hợp lệ.
6. Web hiển thị địa điểm đã lưu, tình trạng chưa có dữ liệu/mới/cũ/lỗi, thời điểm dữ liệu và lần lấy thành công; tải lại giữ lựa chọn. Hiện câu “BMO nhận cập nhật khi bạn đánh thức thiết bị”. Không đưa trạng thái broker PUBACK thành “ESP đã nhận”.
7. API tìm/lưu yêu cầu admin session; mutation dùng origin + CSRF + strict JSON như hiện có. Search/resolve giới hạn timeout 5 giây, body 32 KiB, host cố định; quota tìm/resolve tổng **30 request/phút/session** bằng DB rate-limit, response no-store. Client bỏ qua response tìm cũ nếu tìm mới đã chạy; lỗi mạng không xóa địa điểm đã lưu hoặc lựa chọn nháp.
8. Đồng hồ giữ **UTC+7** trong bản đầu; chọn địa điểm thay đổi thời tiết, không tự thay giờ ESP theo timezone thành phố. Ghi rõ “Giờ thiết bị: Việt Nam (UTC+7)” ở card; timezone địa điểm chỉ để mô tả, không gửi bộ quy tắc DST lên ESP.

## Màn hình và nút

- Boot bình thường vào Clock. A chuyển Clock → Happy → các biểu cảm hiện có → Clock. Không đổi số ID các biểu cảm.
- B mở quota như hiện tại. A từ quota/end-of-list trở về Clock; tự về nhóm A sau thông báo quota cũng về Clock.
- Nhấn A hoặc B khi ngủ: chỉ thức và hiện Clock, không đồng thời chuyển trang; chờ thả nút rồi debounce lại để tránh click giả/wake lặp khi giữ nút.
- HH:MM 24h, UTC+7; dòng ngày dùng T2–T7/CN và DD/MM. Icon thời tiết đơn sắc tĩnh; có nhiệt độ °C nhỏ. Đây là các lựa chọn kỹ thuật theo ủy quyền của chủ dự án.
- Chỉ vẽ lại clock khi đổi phút/ngày, dữ liệu/trạng thái đổi, chuyển trang hoặc thức máy. Không nháy dấu hai chấm, không chạy animation thời tiết, dùng framebuffer OLED hiện có.
- Khi chưa có giờ đáng tin: `--:--`, không hiện ngày giả. Mất nguồn xóa cơ sở giờ; light-sleep vẫn giữ giờ nhưng có thể trôi, đồng bộ lại khi thức.
- Icon/trị số thời tiết hết hạn: hiện trạng thái không rõ và `--`. Không dùng thời điểm nhận MQTT hoặc retry để làm mới tuổi dữ liệu.

## Hợp đồng thời tiết và cache

- Topic mới: `bmo/v1/devices/<deviceId>/weather`; JSON tối đa **512 byte UTF-8**, retained, publisher QoS 1. Giữ nguyên config/snapshot v1; clock là trang nội bộ nhóm PET.
- `DeviceWeatherV1`: `schemaVersion:1`, `deviceId`, `revision` integer dương an toàn, `locationRevision` integer dương, `status:'ok'|'unavailable'`, `condition:'clear'|'partly_cloudy'|'cloudy'|'rain'|'storm'|'fog'|'snow'|'unknown'`, `temperatureC:number|null`, `isDay:boolean|null`, `dataAt:ISO UTC|null`, `validUntil:ISO UTC|null`.
- `ok` yêu cầu dataAt/validUntil/isDay và nhiệt độ hữu hạn trong [-100,70]; `unavailable` yêu cầu các giá trị thời tiết nullable và condition unknown. Validity đã chọn: `validUntil = dataAt + 60 phút`. Thời gian dữ liệu quá tương lai >5 phút so với giờ đã đồng bộ bị từ chối; quá hạn không hiển thị như mới.
- Cache server lưu dataAt gốc, fetchedAt, nextAttemptAt, lease token/expiry và locationRevision; revision MQTT độc lập bền vững theo device/topic. Trùng dữ liệu nguồn thì không phát revision mới vô ích, nhưng phải enqueue bản hiện tại cho thiết bị mới và hỗ trợ khôi phục retained.
- Một địa điểm chung chọn trên web, lưu DB `weather_settings`, không dùng biến môi trường tọa độ/locationRevision; server quản lý revision, browser không tự đặt revision tiếp theo. Lưu lại cùng provider ID là no-op, không reset TTL/due và không gọi weather API lại.
- Chỉ cấp thời tiết cho thiết bị đã nâng firmware: danh sách `BMO_WEATHER_DEVICE_IDS` phía server, mặc định rỗng. UI chọn địa điểm có trong phạm vi; kéo thả clock riêng và multi-location chưa bao gồm.
- ESP giữ cache trong RAM; không ghi flash mỗi phút. Reconnect chấp nhận retained hiện tại, bỏ bản cũ/trùng trong cùng thời gian chạy; tombstone xóa cache. Khi đổi địa điểm, thứ tự revision/topic và cơ chế supersession phải bảo đảm bản địa điểm cũ không ghi đè retained mới.

## Lỗi và giới hạn

- Wi-Fi/SNTP/MQTT lỗi: UI vẫn phản hồi, hết 20 giây tắt mạng, không đánh thức để retry. Không tự mở portal sau lỗi; chỉ provisioning lần đầu/chủ động reset mới mở portal.
- Cần giờ hợp lệ trước TLS certificate validation; không bỏ kiểm chứng CA để vượt lỗi SNTP. Nếu SNTP lỗi nhưng có giờ nội bộ đã được đồng bộ trước đó thì có thể tiếp tục TLS theo chính sách giờ của firmware; weather chỉ fresh khi giờ đủ tin cậy.
- Cron trễ/lỗi: cache vẫn có thời hạn; tác vụ kế tiếp retry có giới hạn. Không hứa đúng từng giây. Mục tiêu 96 lượt theo lịch/ngày/địa điểm, chưa tính retry; ESP không gây thêm lượt gọi provider.
- API lỗi giữ bản tốt cũ, không thay dataAt. Bản đã hết hạn tự mất hiệu lực trên ESP, không cần bản tin đánh dấu cũ đúng phút.
- Thêm weather không được khiến config/quota bị chặn sau 512 byte: giới hạn 512 chỉ áp dụng weather; quota vẫn 8 KiB như hợp đồng hiện có.
- Quota chỉ cập nhật cùng phiên mạng khi thức; cached quota phải giữ semantics stale/reset/configRevision hiện có.

## Những gì còn phải xác nhận khi triển khai

Khả năng monitor cấu hình header/query token, timeout ít nhất 30 giây, cách nó retry và HEAD thực tế; broker/ACL/retained persistence; dòng pin toàn board và đánh thức bằng cả hai nút. Địa điểm sẽ do người dùng tự chọn trên web, không cần hỏi trước. Deep-sleep là lựa chọn tối ưu tiếp nếu phép đo cho thấy cần, không tự đưa vào bản đầu; đặc biệt tránh dùng EXT1 ALL_LOW cho hai nút active-low rồi mong một nút bất kỳ có thể đánh thức.

## Điều kiện nghiệm thu

Thiết bị ngủ qua ít nhất hai chu kỳ 15 phút mà không bật radio; bấm một trong hai nút thức và chỉ có một phiên mạng; hết 20 giây đóng mạng dù lỗi; sau 5 phút không bấm lại thì ngủ. HEAD có token kích hoạt weather khi due, HEAD lặp không gọi provider trước 900 giây; HEAD sai token không chạm DB/provider và mọi response HEAD không có body. Chọn/lưu địa điểm trên web tồn tại sau reload/cold start, conflict và đổi địa điểm giữa fetch không cho kết quả cũ ghi đè. Server cập nhật weather khi ESP ngủ; lần thức sau nhận retained mới, còn clock tự chạy không có tick MQTT. Build/host tests, broker fixtures và đo bench được báo riêng; chỉ đo thực tế mới được kết luận thời lượng pin.
