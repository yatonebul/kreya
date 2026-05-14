export type Platform = 'instagram' | 'tiktok' | 'facebook';

export interface MediaAsset {
  url: string;
  is_video: boolean;
  mime_type?: string;
}

export interface PublicationPayload {
  platform: Platform;
  assets: MediaAsset[];
  caption: string;
  surface: 'feed' | 'reels' | 'story' | 'carousel' | 'facebook-reels';
  whatsappPhone: string;
  metadata?: Record<string, unknown>;
}

export interface PublicationReceipt {
  platform: Platform;
  postId: string;
  postUrl?: string;
  status: 'published' | 'failed' | 'pending';
  error?: string;
}

export interface SocialAdapter {
  platform: Platform;
  validate(assets: MediaAsset[], caption: string): Promise<{ ok: boolean; error?: string }>;
  format(assets: MediaAsset[], caption: string, surface: string, whatsappPhone: string): Promise<PublicationPayload>;
  publish(payload: PublicationPayload): Promise<PublicationReceipt>;
}
