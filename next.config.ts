import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Preserve the repository-maintained agent guidance during local development.
  agentRules: false,
  experimental: {
    // Match the quota refresh interval for fully prefetched pages.
    staleTimes: { static: 30 },
  },
  outputFileTracingIncludes: {
    "/**": ["./drizzle/*.sql"],
  },
};

export default nextConfig;
