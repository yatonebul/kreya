import { Anthropic } from '@anthropic-ai/sdk';

export type Mood = 'energetic' | 'calm' | 'romantic' | 'dramatic' | 'humorous' | 'inspirational' | 'melancholic';

export type MoodMusic = {
  mood: Mood;
  musicUrl: string;
  title: string;
  artist: string;
};

// Freesound search queries per mood
const MOOD_QUERIES: Record<Mood, string> = {
  energetic: 'upbeat electronic music background',
  calm: 'calm ambient background music',
  romantic: 'romantic acoustic background music',
  dramatic: 'dramatic cinematic background music',
  humorous: 'playful fun background music',
  inspirational: 'inspirational uplifting background music',
  melancholic: 'melancholic sad background music',
};

// archive.org fallback (Kevin MacLeod CC-licensed) — used if Freesound fails
const FALLBACK_TRACKS: Record<Mood, MoodMusic> = {
  energetic:     { mood: 'energetic',     musicUrl: 'https://archive.org/download/Kevin_MacLeod_Discography/Kevin%20MacLeod%20-%20Carefree.mp3',               title: 'Carefree',              artist: 'Kevin MacLeod' },
  calm:          { mood: 'calm',          musicUrl: 'https://archive.org/download/Kevin_MacLeod_Discography/Kevin%20MacLeod%20-%20Relaxing%20Piano%20Music.mp3', title: 'Relaxing Piano Music',  artist: 'Kevin MacLeod' },
  romantic:      { mood: 'romantic',      musicUrl: 'https://archive.org/download/Kevin_MacLeod_Discography/Kevin%20MacLeod%20-%20Scheherazade.mp3',            title: 'Scheherazade',          artist: 'Kevin MacLeod' },
  dramatic:      { mood: 'dramatic',      musicUrl: 'https://archive.org/download/Kevin_MacLeod_Discography/Kevin%20MacLeod%20-%20Cipher.mp3',                  title: 'Cipher',                artist: 'Kevin MacLeod' },
  humorous:      { mood: 'humorous',      musicUrl: 'https://archive.org/download/Kevin_MacLeod_Discography/Kevin%20MacLeod%20-%20Sneaky%20Snitch.mp3',         title: 'Sneaky Snitch',         artist: 'Kevin MacLeod' },
  inspirational: { mood: 'inspirational', musicUrl: 'https://archive.org/download/Kevin_MacLeod_Discography/Kevin%20MacLeod%20-%20Inspired.mp3',                title: 'Inspired',              artist: 'Kevin MacLeod' },
  melancholic:   { mood: 'melancholic',   musicUrl: 'https://archive.org/download/Kevin_MacLeod_Discography/Kevin%20MacLeod%20-%20Wallpaper.mp3',               title: 'Wallpaper',             artist: 'Kevin MacLeod' },
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

async function selectMusicForMood(mood: Mood): Promise<MoodMusic | null> {
  const token = process.env.FREESOUND_API_KEY;
  if (token) {
    try {
      const query = encodeURIComponent(MOOD_QUERIES[mood]);
      const url = `https://freesound.org/apiv2/search/text/?query=${query}&token=${token}&page_size=10&fields=id,name,username,previews&filter=duration:[5+TO+120]`;
      console.log('[mood-music] Freesound request:', url.replace(token, 'REDACTED'));
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) {
        console.warn('[mood-music] Freesound HTTP error:', res.status, res.statusText);
      } else {
        const data = await res.json();
        const results: any[] = data.results ?? [];
        // Pick a random result that has an HQ mp3 preview
        const candidates = results.filter(r => r.previews?.['preview-hq-mp3']);
        if (candidates.length > 0) {
          const pick = candidates[Math.floor(Math.random() * candidates.length)];
          const musicUrl: string = pick.previews['preview-hq-mp3'];
          console.log('[mood-music] Freesound picked:', pick.name, 'by', pick.username, musicUrl);
          return { mood, musicUrl, title: pick.name, artist: pick.username };
        }
        console.warn('[mood-music] Freesound returned no usable results for mood:', mood);
      }
    } catch (e) {
      console.warn('[mood-music] Freesound fetch failed, falling back to archive.org:', e);
    }
  } else {
    console.warn('[mood-music] FREESOUND_API_KEY not set, using archive.org fallback');
  }

  const fallback = FALLBACK_TRACKS[mood];
  if (!fallback) return null;

  // Verify the fallback URL is reachable before returning it
  try {
    const check = await fetch(fallback.musicUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(3000),
    });
    if (!check.ok) {
      console.warn('[mood-music] fallback URL unreachable (HTTP', check.status, ') for mood:', mood);
      return null;
    }
  } catch (e) {
    console.warn('[mood-music] fallback HEAD check failed for mood:', mood, e);
    return null;
  }

  return fallback;
}

export async function getMusicForCaption(
  caption: string,
  brandContext?: string,
): Promise<MoodMusic | null> {
  const { mood } = await detectMood(caption, brandContext);
  return selectMusicForMood(mood);
}
