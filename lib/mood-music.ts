import { Anthropic } from '@anthropic-ai/sdk';

export type Mood = 'energetic' | 'calm' | 'romantic' | 'dramatic' | 'humorous' | 'inspirational' | 'melancholic';

export type MoodMusic = {
  mood: Mood;
  musicUrl: string;
  title: string;
  artist: string;
};

// Incompetech (Kevin MacLeod) CC-licensed music - direct URLs, high quality, always working
const MOOD_TRACKS: Record<Mood, MoodMusic[]> = {
  energetic: [
    { mood: 'energetic', musicUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Carefree.mp3', title: 'Carefree', artist: 'Kevin MacLeod' },
    { mood: 'energetic', musicUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Sneaky%20Snitch.mp3', title: 'Sneaky Snitch', artist: 'Kevin MacLeod' },
    { mood: 'energetic', musicUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Take%20the%20Plunge.mp3', title: 'Take the Plunge', artist: 'Kevin MacLeod' },
  ],
  calm: [
    { mood: 'calm', musicUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Ambient%20Bloom.mp3', title: 'Ambient Bloom', artist: 'Kevin MacLeod' },
    { mood: 'calm', musicUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Peaceful%20Meadow.mp3', title: 'Peaceful Meadow', artist: 'Kevin MacLeod' },
    { mood: 'calm', musicUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Unmatched.mp3', title: 'Unmatched', artist: 'Kevin MacLeod' },
  ],
  romantic: [
    { mood: 'romantic', musicUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Lover.mp3', title: 'Lover', artist: 'Kevin MacLeod' },
    { mood: 'romantic', musicUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Scheherazade.mp3', title: 'Scheherazade', artist: 'Kevin MacLeod' },
  ],
  dramatic: [
    { mood: 'dramatic', musicUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Epic%20Cinematic.mp3', title: 'Epic Cinematic', artist: 'Kevin MacLeod' },
    { mood: 'dramatic', musicUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Dramatic%20Impact.mp3', title: 'Dramatic Impact', artist: 'Kevin MacLeod' },
  ],
  humorous: [
    { mood: 'humorous', musicUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Silly%20Fun.mp3', title: 'Silly Fun', artist: 'Kevin MacLeod' },
    { mood: 'humorous', musicUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Poppy%20Fun.mp3', title: 'Poppy Fun', artist: 'Kevin MacLeod' },
  ],
  inspirational: [
    { mood: 'inspirational', musicUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Inspiring%20Moment.mp3', title: 'Inspiring Moment', artist: 'Kevin MacLeod' },
    { mood: 'inspirational', musicUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Motivational%20Uplifter.mp3', title: 'Motivational Uplifter', artist: 'Kevin MacLeod' },
  ],
  melancholic: [
    { mood: 'melancholic', musicUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Melancholia.mp3', title: 'Melancholia', artist: 'Kevin MacLeod' },
    { mood: 'melancholic', musicUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Sentimental%20Value.mp3', title: 'Sentimental Value', artist: 'Kevin MacLeod' },
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
 * Select music for mood from Incompetech library
 */
function selectMusicForMood(mood: Mood): MoodMusic | null {
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
