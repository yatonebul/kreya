import { generateCaption } from '@/lib/caption-generator';
import { publishToInstagram } from '@/lib/instagram-publish';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, imageUrl } = req.body;

  if (!prompt || !imageUrl) {
    return res.status(400).json({ error: 'Missing prompt or imageUrl' });
  }

  try {
    const caption = await generateCaption(prompt);
    const result = await publishToInstagram(caption, imageUrl);

    return res.status(200).json({
      success: true,
      postId: result.postId,
      caption,
    });
  } catch (error: any) {
    console.error('Publishing failed:', error.message);
    return res.status(500).json({ error: error.message });
  }
}