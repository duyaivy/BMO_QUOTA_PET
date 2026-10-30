import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Preserve the repository-maintained agent guidance during local development.
  agentRules: false,
};

export default nextConfig;
