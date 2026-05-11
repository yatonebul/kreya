import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendText, sendPostPublishedActions } from '@/lib/whatsapp-send';
import { getAdaptersForPlatforms } from '@/lib/adapters';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();

  const { data: posts, error } = await supabase
    .from('pending_posts')
    .select('*')
    .eq('state', 'scheduled')
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true });

  if (error) {
    console.error('[publish-scheduled] DB error', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!posts?.length) {
    return NextResponse.json({ ok: true, published: 0 });
  }

  const results: { id: string; status: string; platforms?: string[]; error?: string }[] = [];

  for (const post of posts) {
    try {
      // Respect target_platforms — default to instagram-only for backward compat.
      const targetPlatforms: string[] = (post.target_platforms as string[] | null)?.length
        ? (post.target_platforms as string[])
        : ['instagram'];

      const assets = Array.isArray(post.media_items) && (post.media_items as any[]).length > 0
        ? (post.media_items as any[]).map((item: any) => ({ url: item.url, is_video: !!item.is_video }))
        : [{ url: post.image_url, is_video: !!post.is_video }];

      const adapters = getAdaptersForPlatforms(targetPlatforms);
      const receipts = await Promise.allSettled(
        adapters.map(async adapter => {
          const validation = await adapter.validate(assets, post.caption ?? '');
          if (!validation.ok) throw new Error(`${adapter.platform}: ${validation.error}`);
          const payload = await adapter.format(assets, post.caption ?? '', post.surface ?? 'feed', post.whatsapp_phone);
          return adapter.publish(payload);
        }),
      );

      const published: string[] = [];
      const failed: string[] = [];
      const dbUpdates: Record<string, unknown> = {
        state: 'published',
        published_at: new Date().toISOString(),
      };

      for (const [i, result] of receipts.entries()) {
        const platform = targetPlatforms[i] ?? 'unknown';
        if (result.status === 'fulfilled' && result.value.status === 'published') {
          published.push(platform);
          if (platform === 'instagram') {
            dbUpdates.ig_post_id  = result.value.postId;
            dbUpdates.ig_post_url = result.value.postUrl ?? null;
          } else if (platform === 'tiktok') {
            dbUpdates.tiktok_post_id = result.value.postId;
          }
        } else {
          const err = result.status === 'rejected'
            ? (result.reason as Error)?.message
            : result.value.error;
          failed.push(`${platform}: ${err ?? 'failed'}`);
        }
      }

      if (published.length > 0) {
        await supabase.from('pending_posts').update(dbUpdates).eq('id', post.id);
        if (post.sibling_id) {
          await supabase.from('pending_posts').update({ state: 'discarded' }).eq('id', post.sibling_id);
        }

        const igUrl = dbUpdates.ig_post_url as string | undefined;
        const linkLine = igUrl ? `\n\n🔗 ${igUrl}` : '';
        const platformList = published.map(p => p === 'instagram' ? 'Instagram' : 'TikTok').join(' + ');
        await sendText(post.whatsapp_phone, `🎉 Your scheduled post is live on ${platformList}!${linkLine}`);

        if (failed.length > 0) {
          await sendText(post.whatsapp_phone, `⚠️ Some platforms failed:\n${failed.join('\n')}`);
        }

        await sendPostPublishedActions(post.whatsapp_phone, post.id, post.image_url, false);
        results.push({ id: post.id, status: 'published', platforms: published });
      } else {
        // All platforms failed — leave in scheduled state so cron retries
        console.error('[publish-scheduled] all platforms failed for', post.id, failed);
        await sendText(post.whatsapp_phone, `⚠️ Scheduled post failed to publish:\n${failed.join('\n')}`);
        results.push({ id: post.id, status: 'failed', error: failed.join('; ') });
      }
    } catch (err: any) {
      console.error('[publish-scheduled] unexpected error', post.id, err.message);
      await sendText(post.whatsapp_phone, `⚠️ Scheduled post failed: ${err.message}`).catch(() => {});
      results.push({ id: post.id, status: 'failed', error: err.message });
    }
  }

  return NextResponse.json({
    ok: true,
    published: results.filter(r => r.status === 'published').length,
    results,
  });
}
