# BMO / DUT + tai mèo — concept

Yêu cầu: hai bên có BMO và DUT, hai tai mèo rỗng để luồn móc khóa.
Đã diễn giải “hai bên mặt lưng” thành hai mặt hông đối diện: bên trái BMO,
bên phải DUT (trái/phải khi nhìn từ phía trước). Chữ nổi Arial Bold cao danh
nghĩa 6.5 mm, nhô 0.7 mm, nối liền với vỏ.

Hai tai có envelope ban đầu rộng 14 mm, dày 5 mm, đặt ở X=±15 mm.
Mỗi tai ăn vào nóc 1.2 mm, mép được bo 0.9 mm. Lỗ tam giác xuyên suốt theo
chiều trước–sau, bo 0.5 mm; đã kiểm tra trụ thử Ø3 mm đi xuyên được. Chiều cao
toàn vỏ sau bo khoảng 78.95 mm, so với thân cũ 68 mm.

Đã chạy kiểm tra trên 17 chi tiết / 136 cặp, không phát sinh giao thể tích vật lý;
chỉ lớp minh họa OLED chồng kính như bản trước. Vỏ, chữ và hai tai là một solid
hợp lệ. Xem `cat-ears-audit.json`. Hai ảnh góc đối diện đã được mở kiểm tra trực
quan, xác nhận chữ không ngược và lỗ tai nhìn xuyên được.

File: `BMO_DUT_CAT_EARS_CONCEPT.FCStd`. Ảnh: `cat-ears-front.png`,
`cat-ears-bmo.png`, `cat-ears-dut.png`. Bản trước được giữ riêng.

Đây là thử dáng, chưa xuất STL. Trụ Ø3 mm chỉ xác nhận đường xuyên hình học,
không chứng minh luồn được một khoen cụ thể: cần kiểm tra đường kính trong của
khoen, chiều dày dây khoen, đường đưa khoen vào và tải treo thực tế. Chưa thử
độ bền chân tai, ảnh hưởng hướng lớp in hoặc kéo giật. Các hạn chế về linh kiện,
giữ board và dung sai trong `REVIEW.md` vẫn áp dụng.

Dựng bằng `scripts/bmo_cat_ears_concept.py` trong FreeCAD MCP. Nếu renderer vừa
đổi workbench chưa cập nhật kịp, chạy `scripts/preview_bmo_cat_ears.py` ở lần gọi
MCP kế tiếp để làm mới và xuất ảnh.
