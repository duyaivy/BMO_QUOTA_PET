BMO — BẢN NẮP LƯNG ĐƠN GIẢN, BỎ THANH/KHAY GIỮ MẠCH VÀ PIN

Dùng bộ này thay cho bộ reinforced cũ.
File thiết kế chính: BMO_SIMPLE_BACK.FCStd (FreeCAD, gồm cả linh kiện tham chiếu).
BMO_PRINT_ASSEMBLY.step và 7 STEP riêng chỉ gồm các chi tiết nhựa cần in.
7 STL đã kiểm tra kín, mỗi file một khối; đơn vị mm, scale 100%.

ĐÃ SỬA
- Xoá cụm thanh ngang, hai thanh dẫn ESP32, khay và gân giữ pin trong nắp lưng.
- Giữ nguyên vị trí/hình dáng 14 chi tiết linh kiện so với bản trước.
- Giữ mặt nắp, lỗ bắt vít, cửa sạc, vị trí giữ công tắc.
- Giữ tay/khớp chân đã gia cố, bỏ bệ chống ngã dưới thân.
- Giữ màu ba nút trang trí: tam giác cyan, tròn trên xanh lam, tròn nhỏ xanh lá.
- D-pad vàng và nút tròn đỏ là nút chức năng.

IN MÀU
BMO_MAIN_BODY và BMO_BACK_COVER: xanh mint.
BMO_DPAD_YELLOW: vàng; BMO_BUTTON_RED: đỏ.
BMO_DECOR_TRIANGLE_CYAN: cyan; BMO_DECOR_UPPER_BLUE: xanh lam;
BMO_DECOR_SMALL_GREEN: xanh lá.
STL không lưu màu; tên file và preview là hướng dẫn gán màu.
Thân và ba vùng màu trang trí dùng chung tọa độ, nhập thành một cụm nhiều phần
trong slicer để giữ đúng vị trí. Hai nút thật và nắp lưng là chi tiết lắp rời.
Các STL giữ tọa độ lắp ráp, shop chủ động chọn hướng in và support theo máy.
Không tự thay scale để sửa độ khít.

LẮP RÁP
Nắp có 4 lỗ thông đường kính 2,3 mm, hốc đầu vít đường kính 4,2 mm sâu 1 mm.
Thân chính có 4 lỗ mồi danh nghĩa 1,7 mm đồng trục, để vít tạo ren trong nhựa.
Không có ren kim loại hoặc insert. Thợ cần chọn vít tạo ren cho nhựa tương ứng
và thử độ khít trên vật liệu in; chưa thử bắt vít thật. rear-screw-audit.json
ghi kiểm tra 6 mm cuối lỗ nhận vít và độ thông của lỗ nắp.
Pin và các mạch không còn khay định vị in liền nắp. Cố định bằng đệm/băng dính
phù hợp hoặc dây giữ tại vị trí tham chiếu trong CAD và ảnh mặt cắt.
Linh kiện điện tử trong CAD chỉ để tham chiếu, không in chúng.
Giá FR4 của hai nút thật vẫn là vật tư lắp riêng, không thuộc bộ nhựa in.
Chưa kiểm chứng lắp linh kiện thật, độ bền hoặc cân bằng khi bỏ bệ dưới.

PREVIEW.html gồm ảnh lắp hoàn chỉnh, mặt trong nắp lưng và mặt cắt linh kiện.
Ảnh mặt cắt chỉ minh hoạ bố trí; không phải chi tiết in bị cắt đôi.
revision-report.json ghi đối chiếu linh kiện; mesh-validation.json ghi kiểm tra STL.
