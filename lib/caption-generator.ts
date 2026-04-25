import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const BASE_SYSTEM = 'You are a social media copywriter. Output ONLY the Instagram caption text — nothing else. No notes, no team instructions, no "---" separators, no headers, no meta-commentary. The output will be copy-pasted directly to Instagram as-is.';

function buildSystem(profileContext?: string) {
  return profileContext ? `${BASE_SYSTEM}\n\n${profileContext}` : BASE_SYSTEM;
}

export async function generateCaption(
  prompt: string,
  profileContext?: string,
  recentCaptions?: string[]
): Promise<string> {
  const recentBlock = recentCaptions?.length
    ? `\n\nRecent posts (avoid repeating same themes, phrases, hashtags):\n${recentCaptions.map(c => `- ${c.slice(0, 100)}`).join('\n')}`
    : '';

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    system: buildSystem(profileContext),
    messages: [{
      role: 'user',
      content: `Write an engaging Instagram caption for: "${prompt}". Include 3-5 relevant hashtags.${recentBlock}`,
    }],
  });

  return msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
}

// Returns 3 distinct caption angles (hook / story / CTA) in a single call.
// Falls back to [single] if Claude doesn't return valid JSON; caller treats
// length===1 as "no variants available" and skips the swap UX.
export async function generateCaptionVariants(
  prompt: string,
  profileContext?: string,
  recentCaptions?: string[]
): Promise<string[]> {
  const recentBlock = recentCaptions?.length
    ? `\n\nRecent posts (avoid repeating themes/phrases/hashtags):\n${recentCaptions.map(c => `- ${c.slice(0, 100)}`).join('\n')}`
    : '';

  const variantSystem =
    `${buildSystem(profileContext)}\n\n` +
    `Return ONLY a JSON array of exactly 3 strings — no prose, no markdown, no code fences. ` +
    `Each string is a complete Instagram caption with 3-5 hashtags. ` +
    `The 3 variants MUST take genuinely different angles:\n` +
    `1) hook-led — opens with a question or curiosity gap\n` +
    `2) story-led — anecdote or emotional moment\n` +
    `3) CTA-led — direct invitation to act, save, or comment`;

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 900,
    system: variantSystem,
    messages: [{
      role: 'user',
      content: `Write 3 distinct Instagram caption variants for: "${prompt}".${recentBlock}\n\nFormat: ["caption1", "caption2", "caption3"]`,
    }],
  });

  const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === 3 && parsed.every(s => typeof s === 'string' && s.trim().length > 0)) {
      return parsed.map((s: string) => s.trim());
    }
  } catch {}

  // Fallback: try to recover 3 blocks separated by blank lines
  const blocks = raw.split(/\n{2,}/).map(b => b.replace(/^[\s\d.)\-*"']+/, '').replace(/["']+$/, '').trim()).filter(b => b.length > 20);
  if (blocks.length >= 3) return blocks.slice(0, 3);

  // Worst case — return the raw output as a single caption; caller will skip swap UX
  return raw ? [raw] : [];
}

export async function generateImagePrompt(topic: string): Promise<string> {
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 120,
    system: 'You generate concise image prompts for AI image generation. People shown from behind or silhouette — never close-up face. Focus on cinematic, atmospheric scenes. Output ONLY the prompt, no explanation.',
    messages: [{ role: 'user', content: `Image prompt for: ${topic}` }],
  });

  return msg.content[0].type === 'text' ? msg.content[0].text.trim() : topic;
}

export async function refineCaption(
  currentCaption: string,
  instruction: string,
  profileContext?: string
): Promise<string> {
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    system: buildSystem(profileContext),
    messages: [{
      role: 'user',
      content: `Current caption:\n${currentCaption}\n\nInstruction: ${instruction}\n\nRewrite the caption applying the instruction. Output ONLY the new caption.`,
    }],
  });

  return msg.content[0].type === 'text' ? msg.content[0].text.trim() : currentCaption;
}
