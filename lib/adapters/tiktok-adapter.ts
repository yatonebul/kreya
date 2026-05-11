import { createClient } from '@supabase/supabase-js';
import { ensureTikTokAspectRatio } from '@/lib/tiktok-media';
import type { SocialAdapter, MediaAsset, PublicationPayload, PublicationReceipt } from './types';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function getTikTokToken(whatsappPhone: string): Promise<string> {
  const phones = whatsappPhone.startsWith('+')
    ? [whatsappPhone, whatsappPhone.slice(1)]
    : [whatsappPhone, `+${whatsappPhone}`];

  const { data } = await getSupabase()
    .from('tiktok_accounts')
    .select('open_id, access_token, refresh_token, token_expires_at, refresh_expires_at')
    .in('whatsapp_phone', phones)
    .eq('is_active', true)
    .maybeSingle();

  if (!data?.access_token) throw new Error('No TikTok account connected for this user');

  const now = new Date();
  const accessExpired = data.token_expires_at && new Date(data.token_expires_at) < now;

  if (accessExpired) {
    // Attempt silent refresh if we have a refresh token and it hasn't expired
    const refreshExpired = data.refresh_expires_at && new Date(data.refresh_expires_at) < now;
    if (!data.refresh_token || refreshExpired) {
      throw new Error('TikTok access token expired — reconnect your TikTok account');
    }

    const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key:    process.env.TIKTOK_CLIENT_KEY!,
        client_secret: process.env.TIKTOK_CLIENT_SECRET!,
        grant_type:    'refresh_token',
        refresh_token: data.refresh_token,
      }),
    });
    const body = await res.json();
    if (!res.ok || !body.access_token) {
      throw new Error('TikTok token refresh failed — reconnect your TikTok account');
    }

    const newAccessExpiry = new Date(Date.now() + body.expires_in * 1000).toISOString();
    const newRefreshExpiry = body.refresh_expires_in
      ? new Date(Date.now() + body.refresh_expires_in * 1000).toISOString()
      : data.refresh_expires_at;

    await getSupabase()
      .from('tiktok_accounts')
      .update({
        access_token:       body.access_token,
        refresh_token:      body.refresh_token ?? data.refresh_token,
        token_expires_at:   newAccessExpiry,
        refresh_expires_at: newRefreshExpiry,
      })
      .eq('open_id', data.open_id);

    return body.access_token as string;
  }

  return data.access_token;
}

// Polls TikTok publish status until complete or failed (max 2 min).
async function pollPublishStatus(publishId: string, token: string): Promise<void> {
  const endpoint = 'https://open.tiktokapis.com/v2/post/publish/status/fetch/';
  for (let i = 0; i < 24; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ publish_id: publishId }),
    });
    const body = await res.json();
    const status = body?.data?.status;
    if (status === 'PUBLISH_COMPLETE') return;
    if (status === 'FAILED') throw new Error(`TikTok publish failed: ${body?.data?.fail_reason ?? 'unknown'}`);
  }
  throw new Error('TikTok publish timed out after 2 minutes');
}

export class TikTokAdapter implements SocialAdapter {
  readonly platform = 'tiktok' as const;

  async validate(assets: MediaAsset[], caption: string): Promise<{ ok: boolean; error?: string }> {
    if (assets.length === 0) return { ok: false, error: 'At least one asset is required' };
    const hasVideo = assets.some(a => a.is_video);
    if (!hasVideo) return { ok: false, error: 'TikTok requires a video — photos are not supported for direct posting' };
    if (assets.length > 1) return { ok: false, error: 'TikTok posting supports one video at a time' };
    if (caption.length > 2200) return { ok: false, error: 'TikTok caption exceeds 2,200 characters' };
    return { ok: true };
  }

  async format(
    assets: MediaAsset[],
    caption: string,
    surface: string,
    whatsappPhone: string,
  ): Promise<PublicationPayload> {
    return { platform: 'tiktok', assets, caption, surface: surface as PublicationPayload['surface'], whatsappPhone };
  }

  async publish(payload: PublicationPayload): Promise<PublicationReceipt> {
    const { assets, caption, whatsappPhone } = payload;

    try {
      const token = await getTikTokToken(whatsappPhone);
      const asset = assets.find(a => a.is_video) ?? assets[0];

      // Ensure 9:16 — applies FFmpeg pillar-box if needed
      const videoUrl = await ensureTikTokAspectRatio(asset.url);

      const res = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({
          post_info: {
            title: caption.slice(0, 2200),
            privacy_level: 'PUBLIC_TO_EVERYONE',
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
            is_aigc: true,            // always hardcoded per brief
          },
          source_info: {
            source: 'PULL_FROM_URL',
            video_url: videoUrl,
          },
        }),
      });

      const body = await res.json();
      if (!res.ok || body?.error?.code !== 'ok') {
        throw new Error(`TikTok init failed: ${JSON.stringify(body?.error ?? body)}`);
      }

      const publishId: string = body.data?.publish_id;
      if (!publishId) throw new Error('TikTok returned no publish_id');

      await pollPublishStatus(publishId, token);

      await getSupabase().from('social_audit_log').insert({
        action: 'publish_tiktok',
        status: 'success',
        details: { publish_id: publishId, whatsapp_phone: whatsappPhone },
      });

      return { platform: 'tiktok', postId: publishId, status: 'published' };
    } catch (err: any) {
      await getSupabase().from('social_audit_log').insert({
        action: 'publish_tiktok',
        status: 'failed',
        details: { error: err.message, whatsapp_phone: whatsappPhone },
      });
      return { platform: 'tiktok', postId: '', status: 'failed', error: err.message };
    }
  }
}
