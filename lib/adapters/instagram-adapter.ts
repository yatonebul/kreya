import {
  publishToInstagram,
  publishCarouselToInstagram,
  publishStoryToInstagram,
  type CarouselItem,
} from '@/lib/instagram-publish';
import type { SocialAdapter, MediaAsset, PublicationPayload, PublicationReceipt } from './types';

export class InstagramAdapter implements SocialAdapter {
  readonly platform = 'instagram' as const;

  async validate(assets: MediaAsset[], caption: string): Promise<{ ok: boolean; error?: string }> {
    if (assets.length === 0) return { ok: false, error: 'At least one asset is required' };
    if (assets.length > 10) return { ok: false, error: 'Instagram carousel supports max 10 items' };
    if (caption.length > 2200) return { ok: false, error: 'Instagram caption exceeds 2,200 characters' };
    return { ok: true };
  }

  async format(
    assets: MediaAsset[],
    caption: string,
    surface: string,
    whatsappPhone: string,
  ): Promise<PublicationPayload> {
    return { platform: 'instagram', assets, caption, surface: surface as PublicationPayload['surface'], whatsappPhone };
  }

  async publish(payload: PublicationPayload): Promise<PublicationReceipt> {
    const { assets, caption, surface, whatsappPhone } = payload;

    try {
      if (surface === 'story') {
        const asset = assets[0];
        const result = await publishStoryToInstagram(whatsappPhone, asset.url, asset.is_video);
        return { platform: 'instagram', postId: result.postId, postUrl: result.postUrl, status: 'published' };
      }

      if (surface === 'carousel' || assets.length > 1) {
        const items: CarouselItem[] = assets.map(a => ({ url: a.url, isVideo: a.is_video }));
        const result = await publishCarouselToInstagram(whatsappPhone, caption, items);
        return { platform: 'instagram', postId: result.postId, postUrl: result.postUrl, status: 'published' };
      }

      const asset = assets[0];
      const result = await publishToInstagram(
        whatsappPhone,
        caption,
        asset.url,
        asset.is_video,
        surface === 'reels' ? 'reels' : 'feed',
      );
      return { platform: 'instagram', postId: result.postId, postUrl: result.postUrl, status: 'published' };
    } catch (err: any) {
      return { platform: 'instagram', postId: '', status: 'failed', error: err.message };
    }
  }
}
