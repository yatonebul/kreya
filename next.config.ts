import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep FFmpeg binaries out of the webpack bundle — they're loaded at runtime
  serverExternalPackages: ['fluent-ffmpeg', 'ffmpeg-static'],
  // Vercel's file tracer only follows JS imports; the ffmpeg binary is a
  // plain file referenced by path string, so we must declare it explicitly.
  outputFileTracingIncludes: {
    '/api/webhooks/whatsapp':       ['./node_modules/ffmpeg-static/**/*', './node_modules/next/dist/compiled/@vercel/og/**/*'],
    '/api/video/render-reel':       ['./node_modules/ffmpeg-static/**/*', './node_modules/next/dist/compiled/@vercel/og/**/*'],
    '/api/posts/[postId]/rerender': ['./node_modules/ffmpeg-static/**/*', './node_modules/next/dist/compiled/@vercel/og/**/*'],
    '/api/posts/update-timeline':   ['./node_modules/ffmpeg-static/**/*', './node_modules/next/dist/compiled/@vercel/og/**/*'],
  },
};

export default nextConfig;
