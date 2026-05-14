import { createClient } from '@supabase/supabase-js';
import type { SocialAdapter, MediaAsset, PublicationPayload, PublicationReceipt } from './types';

const GRAPH = 'https://graph.facebook.com/v21.0';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function getFacebookToken(whatsappPhone: string): Promise<{ pageId: string; token: string }> {
  const phones = whatsappPhone.startsWith('+')
    ? [whatsappPhone, whatsappPhone.slice(1)]
    : [whatsappPhone, `+${whatsappPhone}`];

  const { data } = await getSupabase()
    .from('facebook_accounts')
    .select('page_id, access_token, token_expires_at')
    .in('whatsapp_phone', phones)
    .eq('is_active', true)
    .maybeSingle();

  if (!data?.access_token) throw new Error('No Facebook page connected for this user');

  if (data.token_expires_at && new Date(data.token_expires_at) < new Date()) {
    throw new Error('Facebook page token expired — reconnect your Facebook account');
  }

  return { pageId: data.page_id, token: data.access_token };
}

// Poll until video status is READY (max 2 min, 24 × 5s).
async function pollVideoStatus(videoId: string, token: string): Promise<void> {
  for (let i = 0; i < 24; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const res  = await fetch(`${GRAPH}/${videoId}?fields=status&access_token=${token}`);
    const body = await res.json();
    const code = body?.status?.processing_progress;
    const vs   = body?.status?.video_status;
    if (vs === 'ready') return;
    if (vs === 'error') throw new Error(`Facebook video processing failed: ${JSON.stringify(body.status)}`);
    console.log(`[facebook-adapter] video ${videoId} status=${vs} progress=${code}`);
  }
  throw new Error('Facebook video processing timed out after 2 minutes');
}

async function publishReel(pageId: string, token: string, videoUrl: string, description: string): Promise<string> {
  // Phase 1: start upload session
  const startRes = await fetch(
    `${GRAPH}/${pageId}/video_reels?upload_phase=start&access_token=${token}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) },
  );
  const startBody = await startRes.json();
  if (!startRes.ok || !startBody.video_id) {
    throw new Error(`Facebook reels start failed: ${JSON.stringify(startBody)}`);
  }
  const { video_id, upload_url } = startBody as { video_id: string; upload_url: string };

  // Phase 2: upload video binary from source URL
  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) throw new Error(`Failed to fetch video for Facebook upload: ${videoRes.status}`);
  const videoBuffer = await videoRes.arrayBuffer();

  const uploadRes = await fetch(upload_url, {
    method: 'POST',
    headers: { 'Authorization': `OAuth ${token}`, 'Content-Type': 'video/mp4' },
    body: videoBuffer,
  });
  if (!uploadRes.ok) {
    throw new Error(`Facebook reels upload failed: ${uploadRes.status}`);
  }

  // Phase 3: finish and publish
  const finishRes = await fetch(
    `${GRAPH}/${pageId}/video_reels?access_token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        upload_phase:  'finish',
        video_id,
        video_state:   'PUBLISHED',
        description:   description.slice(0, 2200),
        share_to_feed: true,
      }),
    },
  );
  const finishBody = await finishRes.json();
  if (!finishRes.ok || !finishBody.success) {
    throw new Error(`Facebook reels finish failed: ${JSON.stringify(finishBody)}`);
  }

  await pollVideoStatus(video_id, token);
  return video_id;
}

async function publishFeedVideo(pageId: string, token: string, videoUrl: string, description: string): Promise<string> {
  const res = await fetch(`${GRAPH}/${pageId}/videos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: token,
      file_url:     videoUrl,
      description:  description.slice(0, 2200),
      published:    true,
    }),
  });
  const body = await res.json();
  if (!res.ok || !body.id) {
    throw new Error(`Facebook feed video failed: ${JSON.stringify(body)}`);
  }
  await pollVideoStatus(body.id, token);
  return body.id as string;
}

export class FacebookAdapter implements SocialAdapter {
  readonly platform = 'facebook' as const;

  async validate(assets: MediaAsset[], caption: string): Promise<{ ok: boolean; error?: string }> {
    if (assets.length === 0) return { ok: false, error: 'At least one asset is required' };
    const hasVideo = assets.some(a => a.is_video);
    if (!hasVideo) return { ok: false, error: 'Facebook Reels requires a video' };
    if (assets.length > 1) return { ok: false, error: 'Facebook posting supports one video at a time' };
    if (caption.length > 2200) return { ok: false, error: 'Facebook caption exceeds 2,200 characters' };
    return { ok: true };
  }

  async format(
    assets: MediaAsset[],
    caption: string,
    surface: string,
    whatsappPhone: string,
  ): Promise<PublicationPayload> {
    return {
      platform:      'facebook',
      assets,
      caption,
      surface:       surface as PublicationPayload['surface'],
      whatsappPhone,
    };
  }

  async publish(payload: PublicationPayload): Promise<PublicationReceipt> {
    const { assets, caption, surface, whatsappPhone } = payload;

    try {
      const { pageId, token } = await getFacebookToken(whatsappPhone);
      const asset = assets.find(a => a.is_video) ?? assets[0];

      let postId: string;
      if (surface === 'feed') {
        postId = await publishFeedVideo(pageId, token, asset.url, caption);
      } else {
        // 'reels' or 'facebook-reels'
        postId = await publishReel(pageId, token, asset.url, caption);
      }

      const postUrl = `https://www.facebook.com/video/${postId}`;

      await getSupabase().from('social_audit_log').insert({
        action:  'publish_facebook',
        status:  'success',
        details: { post_id: postId, surface, whatsapp_phone: whatsappPhone },
      });

      return { platform: 'facebook', postId, postUrl, status: 'published' };
    } catch (err: any) {
      await getSupabase().from('social_audit_log').insert({
        action:  'publish_facebook',
        status:  'failed',
        details: { error: err.message, whatsapp_phone: whatsappPhone },
      });
      return { platform: 'facebook', postId: '', status: 'failed', error: err.message };
    }
  }
}
