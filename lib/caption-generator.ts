import Anthropic from '@anthropic-ai/sdk';

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
}

const MODEL = 'claude-sonnet-4-6';
const FORMAT_RULE = 'Keep it under 2000 characters. Include 3-5 relevant hashtags. Do not include quotes around the caption.';

export async function generateCaption(prompt: string, profileContext?: string): Promise<string> {
  const msg = await getAnthropic().messages.create({
    model: MODEL,
    max_tokens: 400,
    ...(profileContext ? { system: profileContext } : {}),
    messages: [{
      role: 'user',
      content: `Write a short, engaging Instagram caption for: "${prompt}". ${FORMAT_RULE}`,
    }],
  });
  return msg.content[0].type === 'text' ? msg.content[0].text : 'Default caption';
}

export async function refineCaption(
  currentCaption: string,
  instruction: string,
  profileContext?: string
): Promise<string> {
  const msg = await getAnthropic().messages.create({
    model: MODEL,
    max_tokens: 400,
    ...(profileContext ? { system: profileContext } : {}),
    messages: [{
      role: 'user',
      content: `Current Instagram caption:\n\n${currentCaption}\n\nEdit instruction: "${instruction}"\n\nRewrite it accordingly. ${FORMAT_RULE}`,
    }],
  });
  return msg.content[0].type === 'text' ? msg.content[0].text : currentCaption;
}
