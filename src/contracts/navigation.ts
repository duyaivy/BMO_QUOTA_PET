// Browser-safe UI metadata. Usage event schemas belong to Phase 1C.
export const navigationItems = [
  {
    href: "/",
    label: "Overview",
    description: "Your personal quota workspace",
  },
  {
    href: "/settings/providers",
    label: "Providers",
    description: "Local source compatibility",
  },
  {
    href: "/collectors",
    label: "Collectors",
    description: "Observation and delivery",
  },
  { href: "/devices", label: "Devices", description: "Your desk companion" },
  { href: "/status", label: "Status", description: "Application operations" },
  {
    href: "/login",
    label: "Owner login",
    description: "Owner password access",
  },
] as const;
