import type { NextConfig } from "next";
import { NEXT_PROXY_CLIENT_MAX_BODY_SIZE } from "./src/lib/server/requestLimits";

const nextConfig: NextConfig = {
  experimental: {
    proxyClientMaxBodySize: NEXT_PROXY_CLIENT_MAX_BODY_SIZE,
  },
  serverExternalPackages: ["pdf-parse"],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
