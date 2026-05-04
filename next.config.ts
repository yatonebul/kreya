import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep FFmpeg binaries out of the webpack bundle — they're loaded at runtime
  serverExternalPackages: ['fluent-ffmpeg', 'ffmpeg-static'],
};

export default nextConfig;
