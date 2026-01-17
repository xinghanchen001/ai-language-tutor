import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Required for Electron file:// protocol
  assetPrefix: './',
  trailingSlash: true,
  // Required for Electron file:// protocol
  assetPrefix: './',
  trailingSlash: true,
};

export default nextConfig;
