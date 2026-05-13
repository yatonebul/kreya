import { Anthropic } from '@anthropic-ai/sdk';

export type Mood = 'energetic' | 'calm' | 'romantic' | 'dramatic' | 'humorous' | 'inspirational' | 'melancholic';

export type MoodMusic = {
  mood: Mood;
  musicUrl: string;
  title: string;
  artist: string;
};

// Map moods to Freesound search keywords
const MOOD_KEYWORDS: Record<Mood, string> = {
  energetic: 'upbeat energetic electronic dance',
  calm: 'ambient peaceful relaxing meditation',
  romantic: 'romantic love soft piano',
  dramatic: 'epic dramatic orchestral cinematic',
  humorous: 'funny playful comedy upbeat',
  inspirational: 'inspirational motivational uplifting triumphant',
  melancholic: 'sad melancholic emotional piano',
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
 * Fetch music from Freesound API for the given mood
 * Uses Freesound's free tier to search for CC-licensed audio
 */
async function getFreesoundMusicForMood(mood: Mood): Promise<MoodMusic | null> {
  const apiKey = process.env.FREESOUND_API_KEY;
  if (!apiKey) {
    console.warn('[mood-music] FREESOUND_API_KEY not configured, music will be unavailable');
    return null;
  }

  const keywords = MOOD_KEYWORDS[mood];
  const url = `https://freesound.org/api/v2/search/text/?query=${encodeURIComponent(keywords)}&token=${apiKey}&page_size=5&sort=rating&filter=duration:[30 TO 600]`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error('[mood-music] Freesound API error:', res.status);
      return null;
    }

    const data = await res.json() as any;
    const results = data.results || [];
    if (!results.length) {
      console.log('[mood-music] no Freesound results for mood:', mood);
      return null;
    }

    // Pick a random track from top results for variety
    const track = results[Math.floor(Math.random() * Math.min(results.length, 3))];
    if (!track.previews?.['preview-hq-mp3']) {
      console.log('[mood-music] track has no preview URL:', track.id);
      return null;
    }

    return {
      mood,
      musicUrl: track.previews['preview-hq-mp3'],
      title: track.name || 'Freesound Music',
      artist: track.username || 'Freesound Creator',
    };
  } catch (err) {
    console.error('[mood-music] Freesound API failed:', err);
    return null;
  }
}

/**
 * Full pipeline: caption → detect mood → fetch music from Freesound
 */
export async function getMusicForCaption(
  caption: string,
  brandContext?: string,
): Promise<MoodMusic | null> {
  const { mood } = await detectMood(caption, brandContext);
  return getFreesoundMusicForMood(mood);
}
