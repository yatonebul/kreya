import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { publishToInstagram } from '@/lib/instagram-publish';
import { sendText } from '@/lib/whatsapp-send';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
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

  const results: { id: string; status: string; error?: string }[] = [];

  for (const post of posts) {
    try {
      const result = await publishToInstagram(post.whatsapp_phone, post.caption, post.image_url, post.is_video ?? false);

      await supabase.from('pending_posts')
        .update({ state: 'published', ig_post_id: result.postId, ig_post_url: result.postUrl ?? null })
        .eq('id', post.id);

      if (post.sibling_id) {
        await supabase.from('pending_posts').update({ state: 'discarded' }).eq('id', post.sibling_id);
      }

      const linkLine = result.postUrl ? `\n\n🔗 ${result.postUrl}` : '';
      await sendText(post.whatsapp_phone, `🎉 Your scheduled post is live!${linkLine}`);

      results.push({ id: post.id, status: 'published' });
    } catch (err: any) {
      console.error('[publish-scheduled] failed', post.id, err.message);
      await sendText(post.whatsapp_phone, `⚠️ Scheduled post failed to publish: ${err.message}`).catch(() => {});
      results.push({ id: post.id, status: 'failed', error: err.message });
    }
  }

  return NextResponse.json({ ok: true, published: results.filter(r => r.status === 'published').length, results });
}
