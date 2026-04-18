import Anthropic from '@anthropic-ai/sdk';

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
}

export async function generateCaption(prompt: string): Promise<string> {
  const anthropic = getAnthropic();
  const modelToUse = 'claude-sonnet-4-6';

  const msg = await anthropic.messages.create({
    model: modelToUse,
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `Write a short, engaging Instagram caption based on this: "${prompt}". Keep it under 2000 characters. Include 3-5 relevant hashtags. Do not include quotes around the caption.`
    }],
  });

  return msg.content[0].type === 'text' ? msg.content[0].text : 'Default caption';
}

