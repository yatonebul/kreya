import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { suggestPostTopics } from '@/lib/topic-suggester';
import { sendText } from '@/lib/whatsapp-send';

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const IDLE_DAYS_THRESHOLD = 3;          // skip if user posted in the last N days
const NUDGE_COOLDOWN_DAYS  = 5;         // skip if we already nudged in the last N days
const MAX_USERS_PER_RUN    = 50;        // soft cap to keep cron run-time bounded

// Daily sweep — finds creators who've gone quiet (no published post in
// 3+ days AND last nudge was 5+ days ago), generates 3 brand-specific
// topic ideas via Haiku, and WhatsApps them. Per-account brand voice
// flows in via the active IG row.
//
// Schedule via pg_cron (vercel.json is full at Hobby tier):
//   SELECT cron.schedule('kreya-idle-nudge', '0 9 * * *',
//     $$ SELECT net.http_get(url := '...api/cron/idle-nudge',
//        headers := '{"Authorization":"Bearer YOUR_CRON_SECRET"}'::jsonb); $$);
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const idleCutoff   = new Date(Date.now() - IDLE_DAYS_THRESHOLD * 86_400_000).toISOString();
  const nudgeCutoff  = new Date(Date.now() - NUDGE_COOLDOWN_DAYS  * 86_400_000).toISOString();

  // Eligible profiles — completed onboarding, not nudged recently
  const { data: profiles, error: profErr } = await supabase
    .from('user_profiles')
    .select('whatsapp_phone, brand_name, niche, tone, last_idle_nudge_at, onboarding_step')
    .gte('onboarding_step', 4)
    .or(`last_idle_nudge_at.is.null,last_idle_nudge_at.lt.${nudgeCutoff}`)
    .limit(MAX_USERS_PER_RUN);

  if (profErr) {
    console.error('[idle-nudge] profile query failed:', profErr.message);
    return NextResponse.json({ error: profErr.message }, { status: 500 });
  }
  if (!profiles?.length) {
    return NextResponse.json({ ok: true, nudged: 0, message: 'no eligible users' });
  }

  const results: { phone: string; status: string }[] = [];

  for (const p of profiles) {
    const phone = p.whatsapp_phone;
    // Skip if user posted recently
    const { data: recent } = await supabase
      .from('pending_posts')
      .select('id')
      .eq('whatsapp_phone', phone)
      .eq('state', 'published')
      .gt('published_at', idleCutoff)
      .limit(1)
      .maybeSingle();
    if (recent) {
      results.push({ phone, status: 'recent_post' });
      continue;
    }

    // Recent caption corpus for "don't repeat these" anchoring
    const { data: lastPosts } = await supabase
      .from('pending_posts')
      .select('caption')
      .eq('whatsapp_phone', phone)
      .eq('state', 'published')
      .order('published_at', { ascending: false })
      .limit(5);
    const recentCaptions = (lastPosts ?? []).map(r => r.caption).filter(Boolean) as string[];

    const ideas = await suggestPostTopics({
      brandName: p.brand_name,
      niche:     p.niche,
      tone:      p.tone,
      recentCaptions,
    });

    if (ideas.length < 1) {
      results.push({ phone, status: 'no_ideas' });
      continue;
    }

    const numbered = ideas.map((idea, i) => `*${i + 1}.* ${idea}`).join('\n');
    const send = await sendText(
      phone,
      `👋 Hey — it's been a few days. Here are 3 ideas for your next post:\n\n${numbered}\n\nReply with the number you like, or send me a voice note for something fresh.`,
    );

    if (send.ok) {
      await supabase
        .from('user_profiles')
        .update({ last_idle_nudge_at: new Date().toISOString() })
        .eq('whatsapp_phone', phone);
      results.push({ phone, status: 'nudged' });
    } else {
      // 131030 = dev allowlist constraint, expected during pre-App-Review
      results.push({ phone, status: send.code === 131030 ? 'allowlist' : 'send_failed' });
    }
  }

  return NextResponse.json({
    ok: true,
    checked: profiles.length,
    nudged: results.filter(r => r.status === 'nudged').length,
    results,
  });
}
