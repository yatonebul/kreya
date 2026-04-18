import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function generateCaption(prompt: string): Promise<string> {
  console.log('Generating caption...');

  let modelToUse = 'claude-sonnet-4-6';

  try {
    const modelsPage = await anthropic.models.list();
    const bestSonnet = modelsPage.data.find(m =>
      m.id.includes('sonnet') && !m.id.includes('legacy')
    );
    if (bestSonnet) {
      modelToUse = bestSonnet.id;
    }
  } catch (listError) {
    console.warn('Could not fetch model list, using fallback:', modelToUse);
  }

  console.log(`Generating caption with ${modelToUse}...`);
  const msg = await anthropic.messages.create({
    model: modelToUse,
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `Write a short, engaging Instagram caption based on this: "${prompt}".
                Keep it under 2000 characters. Include 3-5 relevant hashtags.
                Do not include quotes around the caption.`
    }],
  });

  const caption = msg.content[0].type === 'text' ? msg.content[0].text : 'Default caption';
  console.log('Generated Caption:', caption);
  return caption;
}
