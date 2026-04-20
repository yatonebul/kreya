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
