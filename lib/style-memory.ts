import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function fetchRecentInstagramCaptions(
  igUserId: string,
  accessToken: string,
  limit = 50,
): Promise<string[]> {
  const url = `https://graph.instagram.com/v21.0/${igUserId}/media?fields=caption,media_type,timestamp&limit=${limit}&access_token=${accessToken}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!Array.isArray(data?.data)) return [];
  return data.data
    .map((m: { caption?: string }) => (m.caption ?? '').trim())
    .filter((c: string) => c.length > 20);
}

async function summarizeStyle(captions: string[]): Promise<string> {
  if (captions.length < 3) return '';
  const sample = captions.slice(0, 50)
    .map((c, i) => `${i + 1}. ${c.slice(0, 280)}`)
    .join('\n\n');
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 280,
    system:
      "You analyze Instagram caption history to extract the writer's voice. " +
      'Output 2–4 dense sentences describing their tone, sentence rhythm, ' +
      'punctuation/emoji habits, hashtag patterns, and recurring themes. ' +
      'No preamble, no bullet points, no labels — just the style description ' +
      'that will be injected as a system prompt for future caption generation.',
    messages: [{
      role: 'user',
      content: `Recent captions:\n\n${sample}\n\nWrite the style guide.`,
    }],
  });
  return msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
}

// Pulls the user's recent IG captions, summarizes their voice via Haiku,
// and persists to user_profiles.learned_style. Safe to call repeatedly.
export async function learnStyleFromInstagram(
  whatsappPhone: string,
  igUserId: string,
  accessToken: string,
): Promise<{ ok: boolean; captionsFound: number }> {
  try {
    const captions = await fetchRecentInstagramCaptions(igUserId, accessToken);
    if (captions.length < 3) return { ok: false, captionsFound: captions.length };

    const learnedStyle = await summarizeStyle(captions);
    if (!learnedStyle) return { ok: false, captionsFound: captions.length };

    const { error } = await getSupabase()
      .from('user_profiles')
      .upsert(
        { whatsapp_phone: whatsappPhone, learned_style: learnedStyle },
        { onConflict: 'whatsapp_phone' },
      );
    if (error) {
      console.warn('[style-memory] DB write failed (run migration?)', error.message);
      return { ok: false, captionsFound: captions.length };
    }
    return { ok: true, captionsFound: captions.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[style-memory] failed:', msg);
    return { ok: false, captionsFound: 0 };
  }
}
