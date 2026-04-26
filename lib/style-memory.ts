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

type StyleAnalysis = {
  learnedStyle: string;
  suggestedNiche?: string;
  suggestedTone?: string;
};

// Single Haiku call returns the voice summary plus a suggested niche/tone
// label so we can offer the user a one-tap brand profile update afterwards.
async function analyzeStyle(captions: string[]): Promise<StyleAnalysis | null> {
  if (captions.length < 3) return null;
  const sample = captions.slice(0, 50)
    .map((c, i) => `${i + 1}. ${c.slice(0, 280)}`)
    .join('\n\n');
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    system:
      "You analyze Instagram caption history to extract the writer's voice. " +
      'Respond in EXACTLY this format (3 lines, no extra prose):\n' +
      'STYLE: <2-4 dense sentences on tone, rhythm, emoji/hashtag habits, recurring themes>\n' +
      'NICHE: <2-4 word niche, e.g. "fitness coaching", "travel photography", "indie tech">\n' +
      'TONE: <2-4 word tone, e.g. "casual & playful", "polished & pro", "bold & edgy">',
    messages: [{
      role: 'user',
      content: `Recent captions:\n\n${sample}\n\nAnalyze.`,
    }],
  });
  const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
  if (!raw) return null;

  const styleMatch = raw.match(/STYLE:\s*([\s\S]+?)(?=\nNICHE:|\nTONE:|$)/i);
  const nicheMatch = raw.match(/NICHE:\s*(.+)/i);
  const toneMatch  = raw.match(/TONE:\s*(.+)/i);

  const learnedStyle = styleMatch?.[1]?.trim() ?? raw;
  const suggestedNiche = nicheMatch?.[1]?.trim().replace(/^[-•"\s]+|["'\s]+$/g, '') || undefined;
  const suggestedTone  = toneMatch?.[1]?.trim().replace(/^[-•"\s]+|["'\s]+$/g, '')  || undefined;
  return { learnedStyle, suggestedNiche, suggestedTone };
}

// Pulls the user's recent IG captions, summarizes their voice via Haiku,
// and persists learned_style to the matched IG account row (per-account
// brand profile). Falls back to user_profiles if the account row isn't
// found (shouldn't happen after OAuth callback).
export async function learnStyleFromInstagram(
  whatsappPhone: string,
  igUserId: string,
  accessToken: string,
): Promise<{
  ok: boolean;
  captionsFound: number;
  account?: string;
  suggestedNiche?: string;
  suggestedTone?: string;
}> {
  try {
    const captions = await fetchRecentInstagramCaptions(igUserId, accessToken);
    if (captions.length < 3) return { ok: false, captionsFound: captions.length };

    const analysis = await analyzeStyle(captions);
    if (!analysis) return { ok: false, captionsFound: captions.length };

    const supabase = getSupabase();
    const { data: account } = await supabase
      .from('instagram_accounts')
      .select('id, account_name')
      .eq('instagram_user_id', igUserId)
      .maybeSingle();

    if (account) {
      const { error } = await supabase
        .from('instagram_accounts')
        .update({ learned_style: analysis.learnedStyle })
        .eq('id', account.id);
      if (error) {
        console.warn('[style-memory] account write failed', error.message);
        return { ok: false, captionsFound: captions.length };
      }
      return {
        ok: true,
        captionsFound: captions.length,
        account: account.account_name,
        suggestedNiche: analysis.suggestedNiche,
        suggestedTone: analysis.suggestedTone,
      };
    }

    // Legacy fallback: write to phone-keyed row
    const { error } = await supabase
      .from('user_profiles')
      .upsert(
        { whatsapp_phone: whatsappPhone, learned_style: analysis.learnedStyle },
        { onConflict: 'whatsapp_phone' },
      );
    if (error) {
      console.warn('[style-memory] DB write failed (run migration?)', error.message);
      return { ok: false, captionsFound: captions.length };
    }
    return {
      ok: true,
      captionsFound: captions.length,
      suggestedNiche: analysis.suggestedNiche,
      suggestedTone: analysis.suggestedTone,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[style-memory] failed:', msg);
    return { ok: false, captionsFound: 0 };
  }
}

