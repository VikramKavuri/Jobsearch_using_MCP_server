import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the build lean and serverless-friendly. No image optimization or
  // server actions are needed for this app.
  reactStrictMode: true,
};

export default nextConfig;
