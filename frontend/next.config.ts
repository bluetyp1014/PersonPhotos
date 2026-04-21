import type { NextConfig } from "next";

const nextConfig: any = {
  images: {
    unoptimized: true, // 靜態匯出不支援 Next.js 的預設圖片優化，必須設為 True
  },
  experimental: {
    // 🚀 加上這一行，允許所有的 Cloudflare 隧道網域
    allowedDevOrigins: ["*.trycloudflare.com"],
  },
};

export default nextConfig;
