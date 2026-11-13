# BMO seated / smooth arms / duyaivy

## Thay đổi theo ảnh tham khảo

- Đóng hai lỗ chân cũ ở mặt trước. Chuyển khớp chân xuống đáy, X=±10,
  Y=-7 mm; toàn bộ thân, nắp, nút và linh kiện cùng nâng 7 mm, giữ bố trí tương đối.
- Chân vươn trước 16 mm, Ø5.4 mm; bàn chân envelope 7 × 4.6 × 12 mm trước khi
  cắt đáy 1 mm. Mặt đế phẳng có diện tích khoảng 24.14 mm² mỗi bên.
- Cổ chân/khớp hông có vai đỡ chạm đáy thân tại Z=7. Chốt Ø3.6, lỗ Ø4.1 mm;
  vẫn là lắp dán/thử, chưa có khóa chống tuột hoặc xác minh tải của mối nối.
- Tay Ø3.6 mm dùng đường Bézier bậc ba thay đường spline nội suy trước, lòng bàn
  tay ellipsoid bo mềm và các đầu ngón tròn. Tạo thêm khe theo đường cong vai
  để tránh tay giao vỏ. Tăng độ mịn tessellation khi xem trong FreeCAD.
- Hai bàn tay đặt ra ngoài và hơi lùi sau, tâm mặt tựa khoảng X=±32, Y=8 mm.
  Mỗi lòng bàn tay có mặt tiếp xúc phẳng khoảng 16.63 mm² tại Z=0.
- Khắc chìm `duyaivy` ở phần dưới nắp lưng, chữ Arial Bold cao danh nghĩa
  2.5 mm, sâu 0.4 mm, nằm phía trên/bên cạnh cửa USB. Chưa thử độ rõ chữ khi in.
- Giữ BMO/DUT hai hông và tai mèo rỗng. Cao toàn cụm khoảng 85.95 mm.

## Kiểm tra đã chạy

17 chi tiết, mỗi chi tiết một solid hợp lệ; kiểm tra 136 cặp, không giao thể tích
vật lý >0.001 mm³. Ngoại lệ duy nhất là lớp minh họa vùng sáng OLED chồng kính.
Cả bốn mặt tựa có mặt phẳng Z=0 đo trực tiếp từ CAD; tay/chân không xuyên bàn.

Vùng đỡ dùng bao lồi của các đỉnh thật trên mặt tiếp xúc. Vì chưa lấy mẫu toàn
bộ cạnh cong, đây là vùng đỡ bảo thủ nằm trong vùng tựa thực, không phải đường
bao chính xác của toàn bộ các mặt đế.

Ước tính khối lượng bằng thể tích nhựa × 0.00124 g/mm³ và các khối lượng linh kiện
**giả định** ghi đầy đủ trong `seated-signature-audit.json`. Khối lượng ước tính
74.64 g, trọng tâm khoảng (-0.08,-0.47,39.29) mm. Hình chiếu trọng tâm nằm trong
vùng đỡ, cách cạnh gần nhất khoảng 8.47 mm. Kiểm tra thêm 9 vị trí hình chiếu
X∈{-5,0,5}, Y∈{-4,0,4} mm đều nằm trong vùng đỡ, biên nhỏ nhất 4 mm.

Đây là đánh giá tĩnh cho bàn phẳng và mối nối cứng. Chưa tính dây/tụ bổ sung,
khối lượng thật, infill, độ võng tay, ma sát, sai số in, lực bấm nút, kéo khoen
hoặc va chạm. Chưa thể khẳng định sản phẩm lắp thật sẽ không lật; cần thử mẫu
in và các khớp chịu tải. Các hạn chế về OLED/pin/nguồn/giữ board trong REVIEW.md
vẫn áp dụng. Chưa xuất STL.

## File và tái tạo

- CAD: `BMO_SEATED_DUYAIVY_CONCEPT.FCStd`; bản trước giữ nguyên.
- Ảnh: `seated-front.png`, `seated-dut.png`, `seated-bmo.png`, `seated-back.png`,
  `seated-side.png`. Đã mở xem ảnh DUT, mặt sau và mặt bên.
- Dựng: `scripts/bmo_seated_signature_concept.py` qua FreeCAD MCP.
- Xuất ảnh ở lượt MCP kế tiếp: `scripts/preview_bmo_seated.py`.

Script dựng mở lại source để tránh áp dụng dịch chuyển hai lần; nó đóng phiên
source đang mở mà không lưu thay đổi trong bộ nhớ. Chỉ chạy khi không có chỉnh
sửa thủ công chưa lưu trên source cần giữ.
