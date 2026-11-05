// Browser-safe UI metadata. Usage event schemas belong to Phase 1C.
export const navigationItems = [
  {
    href: "/",
    label: "Tổng quan",
    description: "Không gian làm việc hạn mức cá nhân",
  },
  {
    href: "/settings/providers",
    label: "Nhà cung cấp",
    description: "Khả năng tương thích nguồn cục bộ",
  },
  {
    href: "/collectors",
    label: "Bộ thu thập",
    description: "Quan sát và truyền dữ liệu",
  },
  {
    href: "/devices",
    label: "Thiết bị",
    description: "Thú cưng bàn làm việc của bạn",
  },
  { href: "/status", label: "Trạng thái", description: "Vận hành ứng dụng" },
  {
    href: "/login",
    label: "Đăng nhập quản trị",
    description: "Truy cập bằng mật khẩu chủ sở hữu",
  },
] as const;
