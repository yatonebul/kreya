import { createClient } from '@supabase/supabase-js';
import { fetchPostInsights } from './instagram-insights';

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function phoneVariants(phone: string): string[] {
  return phone.startsWith('+') ? [phone, phone.slice(1)] : [phone, `+${phone}`];
}

// Aggregates published-post engagement by hour-of-day across the user's
// last 60 days, then returns the hour where their posts have, on average,
// reached the most people. Falls back to a sane default (Tuesday 7pm
// local) when there's not enough history to compute meaningfully.
//
// Heuristic: weighs (likes + comments*2 + saves*3) / reach to bias
// towards engagement quality rather than raw reach (which can be
// inflated by a single viral outlier).
export type BestTime = {
  weekday: number;       // 0 = Sunday … 6 = Saturday
  hour: number;          // 0-23 in user's IG account local time (we store UTC, but most creators post relative to their audience)
  weekdayLabel: string;
  hourLabel: string;
  sampleSize: number;
  source: 'history' | 'default';
};

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatHour(h: number): string {
  if (h === 0)  return '12am';
  if (h < 12)   return `${h}am`;
  if (h === 12) return '12pm';
  return `${h - 12}pm`;
}

export async function findBestTimeForUser(phone: string): Promise<BestTime> {
  const supabase = getSupabase();
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86_400_000).toISOString();

  const { data: account } = await supabase
    .from('instagram_accounts')
    .select('access_token')
    .in('whatsapp_phone', phoneVariants(phone))
    .eq('is_active', true)
    .maybeSingle();

  const { data: posts } = await supabase
    .from('pending_posts')
    .select('published_at, ig_post_id')
    .eq('whatsapp_phone', phone)
    .eq('state', 'published')
    .gt('published_at', sixtyDaysAgo)
    .not('published_at', 'is', null);

  if (!posts?.length || posts.length < 3 || !account?.access_token) {
    // Fall back to evergreen "good time": Tuesday 7pm. Buffer's 2024 cross-niche data points to this.
    return {
      weekday: 2, hour: 19,
      weekdayLabel: 'Tuesday', hourLabel: '7pm',
      sampleSize: posts?.length ?? 0,
      source: 'default',
    };
  }

  // Bucket: weekday-hour → cumulative engagement score + sample count
  const buckets = new Map<string, { score: number; count: number; weekday: number; hour: number }>();

  for (const post of posts) {
    if (!post.published_at || !post.ig_post_id) continue;
    const d = new Date(post.published_at);
    const weekday = d.getUTCDay();
    const hour    = d.getUTCHours();
    const key     = `${weekday}-${hour}`;

    // Only fetch insights for posts we don't already have cached. For
    // MVP we re-fetch each time (cheap, IG caches responses) — a future
    // optimisation is to store insights snapshots per post.
    const insights = await fetchPostInsights(post.ig_post_id, account.access_token);
    const reach = insights?.reach ?? insights?.views ?? 0;
    if (reach === 0) continue;

    const engagement = (insights?.likes ?? 0) + (insights?.comments ?? 0) * 2 + (insights?.saved ?? 0) * 3;
    const score = engagement / reach;

    const existing = buckets.get(key) ?? { score: 0, count: 0, weekday, hour };
    existing.score += score;
    existing.count += 1;
    buckets.set(key, existing);
  }

  if (!buckets.size) {
    return {
      weekday: 2, hour: 19,
      weekdayLabel: 'Tuesday', hourLabel: '7pm',
      sampleSize: posts.length,
      source: 'default',
    };
  }

  const ranked = [...buckets.values()]
    .map(b => ({ ...b, avg: b.score / b.count }))
    .filter(b => b.count >= 1) // keep low bar — most users post a handful
    .sort((a, b) => b.avg - a.avg);

  const top = ranked[0];
  return {
    weekday: top.weekday,
    hour: top.hour,
    weekdayLabel: WEEKDAY_LABELS[top.weekday],
    hourLabel: formatHour(top.hour),
    sampleSize: posts.length,
    source: 'history',
  };
}

// Resolves a BestTime + the current moment into the next concrete
// Date instance. Always returns something in the future (rolls over a
// week if the slot has already passed today).
export function nextOccurrenceOfBestTime(best: BestTime): Date {
  const now    = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), best.hour, 0, 0, 0));
  let dayDelta = best.weekday - target.getUTCDay();
  if (dayDelta < 0 || (dayDelta === 0 && target <= now)) dayDelta += 7;
  target.setUTCDate(target.getUTCDate() + dayDelta);
  return target;
}
