import { Anthropic } from '@anthropic-ai/sdk';

export type Mood = 'energetic' | 'calm' | 'romantic' | 'dramatic' | 'humorous' | 'inspirational' | 'melancholic';

export type MoodMusic = {
  mood: Mood;
  musicUrl: string;
  title: string;
  artist: string;
};

// Curated free music tracks from Pexels (public domain / CC0)
// Each mood has 3-5 tracks to vary
const MOOD_TRACKS: Record<Mood, MoodMusic[]> = {
  energetic: [
    {
      mood: 'energetic',
      musicUrl: 'https://www.pexels.com/download/6489/pexels-ali-arazo-6489.mp3',
      title: 'Summer Breeze',
      artist: 'Ali Arazo',
    },
    {
      mood: 'energetic',
      musicUrl: 'https://www.pexels.com/download/1409986/pexels-life-of-pix-1409986.mp3',
      title: 'Upbeat Music',
      artist: 'Life of Pix',
    },
  ],
  calm: [
    {
      mood: 'calm',
      musicUrl: 'https://www.pexels.com/download/3721392/pexels-simon-sun-3721392.mp3',
      title: 'Ambient Relaxation',
      artist: 'Simon Sun',
    },
    {
      mood: 'calm',
      musicUrl: 'https://www.pexels.com/download/4950476/pexels-michael-shaw-4950476.mp3',
      title: 'Peaceful Meditation',
      artist: 'Michael Shaw',
    },
  ],
  romantic: [
    {
      mood: 'romantic',
      musicUrl: 'https://www.pexels.com/download/1256662/pexels-nico-santos-1256662.mp3',
      title: 'Love in the Air',
      artist: 'Nico Santos',
    },
  ],
  dramatic: [
    {
      mood: 'dramatic',
      musicUrl: 'https://www.pexels.com/download/5278666/pexels-graham-reynolds-5278666.mp3',
      title: 'Epic Journey',
      artist: 'Graham Reynolds',
    },
  ],
  humorous: [
    {
      mood: 'humorous',
      musicUrl: 'https://www.pexels.com/download/3373879/pexels-kevin-macleod-3373879.mp3',
      title: 'Funky Fun',
      artist: 'Kevin MacLeod',
    },
  ],
  inspirational: [
    {
      mood: 'inspirational',
      musicUrl: 'https://www.pexels.com/download/5063699/pexels-zitherwind-5063699.mp3',
      title: 'Rise Up',
      artist: 'Zitherwind',
    },
  ],
  melancholic: [
    {
      mood: 'melancholic',
      musicUrl: 'https://www.pexels.com/download/3730823/pexels-david-renda-3730823.mp3',
      title: 'Sad Piano',
      artist: 'David Renda',
    },
  ],
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
 * Select a random track for the given mood.
 */
export function selectMusicForMood(mood: Mood): MoodMusic | null {
  const tracks = MOOD_TRACKS[mood];
  if (!tracks || !tracks.length) return null;
  return tracks[Math.floor(Math.random() * tracks.length)];
}

/**
 * Full pipeline: caption → detect mood → select music
 */
export async function getMusicForCaption(
  caption: string,
  brandContext?: string,
): Promise<MoodMusic | null> {
  const { mood } = await detectMood(caption, brandContext);
  return selectMusicForMood(mood);
}
