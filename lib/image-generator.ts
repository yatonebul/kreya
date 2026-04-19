const NEGATIVE = 'blurry, distorted face, ugly, deformed, low quality, watermark, text, logo';

export type ImageStyle = 'realistic' | 'anime' | '3d' | 'artistic';

const MODEL_MAP: Record<ImageStyle, string> = {
  realistic: 'flux-realism',
  anime: 'flux-anime',
  '3d': 'flux-3d',
  artistic: 'flux',
};

export function detectStyle(instruction: string): ImageStyle {
  if (/\b(anime|cartoon|illustrat\w+)\b/i.test(instruction)) return 'anime';
  if (/\b(3d|render|cgi|three.?d)\b/i.test(instruction)) return '3d';
  if (/\b(artistic|painterly|oil paint|watercolou?r|abstract)\b/i.test(instruction)) return 'artistic';
  return 'realistic';
}

export function buildImageUrl(prompt: string, style: ImageStyle = 'realistic'): string {
  const seed = Math.floor(Math.random() * 1_000_000);
  const model = MODEL_MAP[style];
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1080&height=1080&nologo=true&model=${model}&seed=${seed}&negative=${encodeURIComponent(NEGATIVE)}`;
}
