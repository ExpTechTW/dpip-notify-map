import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";
const basePath = isProduction ? `/history` : "";

const nextConfig: NextConfig = {
  basePath: basePath,
  assetPrefix: basePath,
  output: "standalone",
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'raw.githubusercontent.com',
        pathname: '/ExpTechTW/DPIP/**',
      },
    ],
  },
};

export default nextConfig;