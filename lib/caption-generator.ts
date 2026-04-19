import Anthropic from '@anthropic-ai/sdk';

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
}

const MODEL = 'claude-sonnet-4-6';
const BASE_SYSTEM = 'You are a social media copywriter. Output ONLY the Instagram caption text — nothing else. No notes, no team instructions, no "---" separators, no headers, no meta-commentary. The output will be copy-pasted directly to Instagram as-is.';
const FORMAT_RULE = 'Keep it under 2000 characters. Include 3-5 relevant hashtags. No quotes around the caption.';

function buildSystem(profileContext?: string) {
  return profileContext ? `${BASE_SYSTEM}\n\n${profileContext}` : BASE_SYSTEM;
}

export async function generateCaption(
  prompt: string,
  profileContext?: string,
  recentCaptions?: string[]
): Promise<string> {
  let userContent = `Write a short, engaging Instagram caption for: "${prompt}". ${FORMAT_RULE}`;

  if (recentCaptions?.length) {
    const history = recentCaptions.map((c, i) => `${i + 1}. ${c.slice(0, 300)}`).join('\n');
    userContent = `Recent posts (avoid repeating the same themes, phrases, or hashtags):\n${history}\n\n${userContent}`;
  }

  const msg = await getAnthropic().messages.create({
    model: MODEL,
    max_tokens: 400,
    system: buildSystem(profileContext),
    messages: [{ role: 'user', content: userContent }],
  });
  return msg.content[0].type === 'text' ? msg.content[0].text : 'Default caption';
}

export async function generateImagePrompt(topic: string): Promise<string> {
  const msg = await getAnthropic().messages.create({
    model: MODEL,
    max_tokens: 120,
    system: 'You are an image prompt writer for Flux AI. Output ONLY the image prompt — no explanation, no quotes. When people appear, describe them from behind, in silhouette, or at a distance — never close-up faces. Focus on cinematic scenes, environments, mood, and composition.',
    messages: [{
      role: 'user',
      content: `Write a vivid, photorealistic, Instagram-worthy image generation prompt for this topic: "${topic}". Emphasise cinematic lighting, colour palette, and sharp composition. Under 80 words.`,
    }],
  });
  return msg.content[0].type === 'text' ? msg.content[0].text : topic;
}

export async function refineCaption(
  currentCaption: string,
  instruction: string,
  profileContext?: string
): Promise<string> {
  const msg = await getAnthropic().messages.create({
    model: MODEL,
    max_tokens: 400,
    system: buildSystem(profileContext),
    messages: [{
      role: 'user',
      content: `Current Instagram caption:\n\n${currentCaption}\n\nEdit instruction: "${instruction}"\n\nRewrite it accordingly. ${FORMAT_RULE}`,
    }],
  });
  return msg.content[0].type === 'text' ? msg.content[0].text : currentCaption;
}
