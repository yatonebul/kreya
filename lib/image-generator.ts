export function buildImageUrl(prompt: string): string {
  const seed = Math.floor(Math.random() * 1_000_000);
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1080&height=1080&nologo=true&model=flux&seed=${seed}`;
}
