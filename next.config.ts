import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.4.32", "https://192.168.4.32:3000", "*.local"],
  experimental: {
    viewTransition: true,
  },
};

export default nextConfig;
