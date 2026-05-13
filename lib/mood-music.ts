import { Anthropic } from '@anthropic-ai/sdk';

export type Mood = 'energetic' | 'calm' | 'romantic' | 'dramatic' | 'humorous' | 'inspirational' | 'melancholic';

export type MoodMusic = {
  mood: Mood;
  musicUrl: string;
  title: string;
  artist: string;
};

// Map moods to Pixabay search keywords
const MOOD_KEYWORDS: Record<Mood, string> = {
  energetic: 'upbeat energetic dance',
  calm: 'calm peaceful ambient',
  romantic: 'romantic love soft',
  dramatic: 'epic dramatic orchestral',
  humorous: 'fun playful comedy',
  inspirational: 'inspirational motivational uplifting',
  melancholic: 'sad melancholic emotional',
};

/**
 * Detect mood from caption + brand context using Claude.
 * Returns primary mood + confidence.
 */
export async function detectMood(
  caption: string,
  brandContext?: string,
): Promise<{ mood: Mood; confidence: number }> {
  const anthropic = new Anthropic();

  const systemPrompt = `You are a mood detection expert for social media content.
Analyze captions and determine the primary mood.

Available moods: energetic, calm, romantic, dramatic, humorous, inspirational, melancholic

Respond with JSON: { "mood": "...", "confidence": 0.0-1.0 }`;

  const userPrompt = `Caption: "${caption}"
${brandContext ? `Brand context: ${brandContext}` : ''}

What mood does this convey?`;

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 100,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  try {
    const text = msg.content[0]?.type === 'text' ? msg.content[0].text : '';
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const result = JSON.parse(match[0]);
      return {
        mood: (result.mood || 'calm') as Mood,
        confidence: result.confidence ?? 0.5,
      };
    }
  } catch (e) {
    console.error('[mood-music] parse failed:', e);
  }

  return { mood: 'calm', confidence: 0.3 };
}

/**
 * Fetch music from Pixabay API for the given mood
 */
async function getPixabayMusicForMood(mood: Mood): Promise<MoodMusic | null> {
  const apiKey = process.env.PIXABAY_MUSIC_API_KEY;
  if (!apiKey) {
    console.warn('[mood-music] PIXABAY_MUSIC_API_KEY not configured, music will be unavailable');
    return null;
  }

  const keywords = MOOD_KEYWORDS[mood];
  const url = `https://pixabay.com/api/videos/?key=${apiKey}&q=${encodeURIComponent(keywords)}&min_duration=300&max_duration=600&order=popular&per_page=3`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Pixabay API: ${res.status}`);

    const data = await res.json() as any;
    const hits = data.hits || [];
    if (!hits.length) {
      console.log('[mood-music] no results for mood:', mood);
      return null;
    }

    const video = hits[Math.floor(Math.random() * Math.min(hits.length, 3))];
    const audioUrl = video.videos?.medium?.url;
    if (!audioUrl) return null;

    return {
      mood,
      musicUrl: audioUrl,
      title: video.tags?.[0] || 'Pixabay Music',
      artist: video.user || 'Pixabay',
    };
  } catch (err) {
    console.error('[mood-music] Pixabay API failed:', err);
    return null;
  }
}

/**
 * Full pipeline: caption → detect mood → fetch music from Pixabay
 */
export async function getMusicForCaption(
  caption: string,
  brandContext?: string,
): Promise<MoodMusic | null> {
  const { mood } = await detectMood(caption, brandContext);
  return getPixabayMusicForMood(mood);
}
