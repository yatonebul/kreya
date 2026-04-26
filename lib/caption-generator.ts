import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const BASE_SYSTEM = 'You are a social media copywriter. Output ONLY the Instagram caption text — nothing else. No notes, no team instructions, no "---" separators, no headers, no meta-commentary. The output will be copy-pasted directly to Instagram as-is.';

export type CaptionSurface = 'feed' | 'reels' | 'carousel';

const SURFACE_GUIDE: Record<CaptionSurface, string> = {
  feed:
    'Format: 1 strong opening line, then 2-4 short lines, then 3-5 relevant hashtags. ' +
    'Length: aim for 150-300 characters of body copy.',
  reels:
    'This is a Reel caption — Reels live or die on the first 3 words. ' +
    'Format: punchy hook in the very first line (a question, a contradiction, a number, or a curiosity gap) — keep total body under 125 characters. ' +
    'No long explanations: the video carries the story, the caption only earns the tap. ' +
    'End with 3 relevant hashtags max.',
  carousel:
    'This is a carousel caption (multiple slides). ' +
    'Format: hook line that promises the payoff inside the carousel, then a 1-line tease of what slides 2-N reveal, then 3-5 hashtags. ' +
    'Keep body under 220 characters — the slides carry the depth, not the caption.',
};

function buildSystem(profileContext?: string, surface: CaptionSurface = 'feed') {
  const parts = [BASE_SYSTEM, SURFACE_GUIDE[surface]];
  if (profileContext) parts.push(profileContext);
  return parts.join('\n\n');
}

export async function generateCaption(
  prompt: string,
  profileContext?: string,
  recentCaptions?: string[],
  surface: CaptionSurface = 'feed',
): Promise<string> {
  const recentBlock = recentCaptions?.length
    ? `\n\nRecent posts (avoid repeating same themes, phrases, hashtags):\n${recentCaptions.map(c => `- ${c.slice(0, 100)}`).join('\n')}`
    : '';

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: surface === 'reels' ? 220 : 400,
    system: buildSystem(profileContext, surface),
    messages: [{
      role: 'user',
      content: `Write an engaging Instagram ${surface === 'reels' ? 'Reel' : 'caption'} for: "${prompt}".${recentBlock}`,
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
  recentCaptions?: string[],
  surface: CaptionSurface = 'feed',
): Promise<string[]> {
  const recentBlock = recentCaptions?.length
    ? `\n\nRecent posts (avoid repeating themes/phrases/hashtags):\n${recentCaptions.map(c => `- ${c.slice(0, 100)}`).join('\n')}`
    : '';

  const variantSystem =
    `${buildSystem(profileContext, surface)}\n\n` +
    `Return ONLY a JSON array of exactly 3 strings — no prose, no markdown, no code fences. ` +
    `Each string is a complete Instagram ${surface === 'reels' ? 'Reel caption' : 'caption'}. ` +
    `The 3 variants MUST take genuinely different angles:\n` +
    `1) hook-led — opens with a question or curiosity gap\n` +
    `2) story-led — anecdote or emotional moment\n` +
    `3) CTA-led — direct invitation to act, save, or comment`;

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: surface === 'reels' ? 600 : 900,
    system: variantSystem,
    messages: [{
      role: 'user',
      content: `Write 3 distinct Instagram ${surface === 'reels' ? 'Reel captions' : 'caption variants'} for: "${prompt}".${recentBlock}\n\nFormat: ["caption1", "caption2", "caption3"]`,
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

export type CarouselSpin = {
  caption: string;
  slides: { headline: string; body: string; imagePrompt: string }[];
};

// Turns a published post into a 5-slide narrative carousel. The original
// caption is the seed: we re-tell the same idea with a hook → setup →
// payoff → key insight → CTA arc, each slide getting a headline (10-15
// chars max so it fits any aspect), body (1 line), and an image prompt
// for cinematic background art.
export async function generateCarouselSpin(
  sourceCaption: string,
  profileContext?: string,
): Promise<CarouselSpin | null> {
  const system =
    `${buildSystem(profileContext, 'carousel')}\n\n` +
    `Return ONLY a JSON object — no prose, no markdown, no code fences.\n` +
    `Shape: { "caption": string, "slides": [ { "headline": string, "body": string, "imagePrompt": string } x5 ] }\n` +
    `- 5 slides exactly. Arc: hook → setup → payoff → insight → CTA.\n` +
    `- headline: 10-15 chars max, all-caps optional, designed to read on a 1080x1080 image.\n` +
    `- body: ONE short line (under 90 chars), expands the headline.\n` +
    `- imagePrompt: one cinematic background scene per slide. People shown from behind / silhouette only — never close-up faces. No text inside the image (the headline overlay handles that).\n` +
    `- caption: the IG carousel caption itself, ~200 chars body + 3-5 hashtags. Hooks readers to swipe.`;

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1200,
    system,
    messages: [{
      role: 'user',
      content: `Source post caption (turn this into a 5-slide carousel):\n\n${sourceCaption}\n\nReturn the JSON.`,
    }],
  });

  const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed?.caption &&
      Array.isArray(parsed.slides) &&
      parsed.slides.length === 5 &&
      parsed.slides.every((s: any) => typeof s.headline === 'string' && typeof s.body === 'string' && typeof s.imagePrompt === 'string')
    ) {
      return parsed as CarouselSpin;
    }
  } catch {}
  return null;
}

export type ReelSpin = {
  hook: string;
  scenes: { visual: string; voiceover: string; textOverlay: string }[];
  caption: string;
};

// Storyboard for the user to film. We deliberately keep this AS TEXT
// (no draft created) because IG Reels need real video and we can't
// AI-generate video at quality yet — the highest-leverage repurpose is
// a structured 12-second script the creator can shoot on their phone in
// 2 minutes. After they film and send the video back, the standard
// /post → preview → approve flow handles publishing.
export async function generateReelScriptSpin(
  sourceCaption: string,
  profileContext?: string,
): Promise<ReelSpin | null> {
  const system =
    `${buildSystem(profileContext, 'reels')}\n\n` +
    `Return ONLY a JSON object — no prose, no markdown, no code fences.\n` +
    `Shape: { "hook": string, "scenes": [ { "visual": string, "voiceover": string, "textOverlay": string } x3 ], "caption": string }\n` +
    `- hook: the first 3 words spoken on camera or shown as a text overlay. Has to stop a thumb mid-scroll.\n` +
    `- 3 scenes total, ~4 seconds each (12s Reel). Each scene: visual (what the camera shows), voiceover (what the creator says, in their natural voice), textOverlay (1-3 word kinetic caption).\n` +
    `- caption: the Reel caption (under 125 chars body + max 3 hashtags). Hook-led.`;

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    system,
    messages: [{
      role: 'user',
      content: `Source post caption (turn this into a 12-second Reel storyboard the creator can film today):\n\n${sourceCaption}\n\nReturn the JSON.`,
    }],
  });

  const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed?.hook &&
      parsed?.caption &&
      Array.isArray(parsed.scenes) &&
      parsed.scenes.length === 3 &&
      parsed.scenes.every((s: any) => typeof s.visual === 'string' && typeof s.voiceover === 'string' && typeof s.textOverlay === 'string')
    ) {
      return parsed as ReelSpin;
    }
  } catch {}
  return null;
}
