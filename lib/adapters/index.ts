import { InstagramAdapter } from './instagram-adapter';
import { TikTokAdapter } from './tiktok-adapter';
import type { Platform, SocialAdapter } from './types';

export type { Platform, SocialAdapter, MediaAsset, PublicationPayload, PublicationReceipt } from './types';

const registry = new Map<Platform, SocialAdapter>([
  ['instagram', new InstagramAdapter()],
  ['tiktok', new TikTokAdapter()],
]);

export function getAdapter(platform: Platform): SocialAdapter {
  const adapter = registry.get(platform);
  if (!adapter) throw new Error(`No adapter registered for platform: ${platform}`);
  return adapter;
}

export function getAdaptersForPlatforms(platforms: string[]): SocialAdapter[] {
  return (platforms as Platform[])
    .filter(p => registry.has(p))
    .map(p => registry.get(p)!);
}
