import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// Generates 3 fresh post ideas based on the brand profile + last few
// captions (so suggestions don't repeat themes the user just covered).
// Output is a string array, ready to drop into a WA bullet list.
export async function suggestPostTopics(args: {
  brandName?: string | null;
  niche?: string | null;
  tone?: string | null;
  recentCaptions?: string[];
}): Promise<string[]> {
  const { brandName, niche, tone, recentCaptions } = args;

  const profile = [
    brandName && `Brand: ${brandName}`,
    niche && `Niche: ${niche}`,
    tone && `Tone: ${tone}`,
  ].filter(Boolean).join('. ');

  const recentBlock = recentCaptions?.length
    ? `\n\nRecent posts (avoid repeating these themes):\n${recentCaptions.slice(0, 5).map(c => `- ${c.slice(0, 120)}`).join('\n')}`
    : '';

  const system =
    'You generate 3 distinct Instagram post ideas. Each idea is 1 short sentence — ' +
    'punchy, specific to the brand, NOT generic ("share a tip"). ' +
    'Return ONLY a JSON array of 3 strings — no prose, no markdown, no code fences.';

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system,
    messages: [{
      role: 'user',
      content: `${profile || 'No brand context yet.'}${recentBlock}\n\nReturn 3 post idea strings.`,
    }],
  });

  const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === 3 && parsed.every(s => typeof s === 'string')) {
      return parsed.map((s: string) => s.trim()).filter(Boolean);
    }
  } catch {}
  // Fallback: parse line-by-line
  const lines = raw.split(/\n+/).map(l => l.replace(/^[\s\d.)\-*•"']+/, '').replace(/["']+$/, '').trim()).filter(l => l.length > 8);
  return lines.slice(0, 3);
}
