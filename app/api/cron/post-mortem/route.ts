import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendText } from '@/lib/whatsapp-send';
import { fetchPostInsights, buildPostMortem, formatPostMortemMessage } from '@/lib/instagram-insights';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function phoneVariants(phone: string): string[] {
  return phone.startsWith('+') ? [phone, phone.slice(1)] : [phone, `+${phone}`];
}

// Auth: same Bearer ${CRON_SECRET} as the token-refresh cron.
// Schedule: hourly is plenty (we look 22h–48h back, so a missed run still
// catches the post on the next tick).
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();

  const now = Date.now();
  const windowStart = new Date(now - 48 * 3600 * 1000).toISOString(); // 48h ago
  const windowEnd   = new Date(now - 22 * 3600 * 1000).toISOString(); // 22h ago

  const { data: posts, error } = await supabase
    .from('pending_posts')
    .select('id, ig_post_id, ig_post_url, whatsapp_phone, published_at')
    .eq('state', 'published')
    .is('post_mortem_sent_at', null)
    .not('ig_post_id', 'is', null)
    .gte('published_at', windowStart)
    .lte('published_at', windowEnd)
    .limit(25);

  if (error) {
    console.error('[post-mortem] DB error', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!posts?.length) {
    return NextResponse.json({ ok: true, sent: 0, message: 'No posts due for post-mortem' });
  }

  const results: { id: string; status: string; error?: string }[] = [];

  for (const post of posts) {
    try {
      // Look up the user's active IG account for the access token
      const { data: account } = await supabase
        .from('instagram_accounts')
        .select('access_token')
        .in('whatsapp_phone', phoneVariants(post.whatsapp_phone))
        .eq('is_active', true)
        .maybeSingle();

      if (!account?.access_token) {
        results.push({ id: post.id, status: 'skipped', error: 'no_active_account' });
        continue;
      }

      const metrics = await fetchPostInsights(post.ig_post_id, account.access_token);
      if (!metrics) {
        results.push({ id: post.id, status: 'skipped', error: 'insights_unavailable' });
        continue;
      }

      const mortem = buildPostMortem(metrics);
      const message = formatPostMortemMessage(mortem, post.ig_post_url);

      await sendText(post.whatsapp_phone, message);
      await supabase
        .from('pending_posts')
        .update({ post_mortem_sent_at: new Date().toISOString() })
        .eq('id', post.id);

      results.push({ id: post.id, status: 'sent' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[post-mortem] ${post.id} failed:`, msg);
      results.push({ id: post.id, status: 'failed', error: msg });
    }
  }

  return NextResponse.json({
    ok: true,
    sent: results.filter(r => r.status === 'sent').length,
    results,
  });
}
