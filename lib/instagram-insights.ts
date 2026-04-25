// Lightweight wrapper over the IG Graph Insights endpoint.
// Returns a flat metrics object plus a one-line takeaway suitable for the
// 24h post-mortem WhatsApp digest.

export interface PostMetrics {
  reach: number;
  likes: number;
  comments: number;
  saved: number;
  views: number;
}

export interface PostMortem {
  metrics: PostMetrics;
  topMetric: { label: string; value: number };
  takeaway: string;
}

const METRIC_LABELS: Record<keyof PostMetrics, string> = {
  reach:    'Reach',
  views:    'Views',
  likes:    'Likes',
  comments: 'Comments',
  saved:    'Saves',
};

// Some metrics are only available on certain media types or for accounts
// over a follower threshold; missing ones come back zeroed rather than
// blowing up the digest.
export async function fetchPostInsights(
  igMediaId: string,
  accessToken: string,
): Promise<PostMetrics | null> {
  const metricList = ['reach', 'likes', 'comments', 'saved', 'views'].join(',');
  const url = `https://graph.instagram.com/v21.0/${igMediaId}/insights?metric=${metricList}&access_token=${accessToken}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!Array.isArray(data?.data)) return null;

    const out: PostMetrics = { reach: 0, views: 0, likes: 0, comments: 0, saved: 0 };
    for (const item of data.data as { name: string; values?: { value?: number }[] }[]) {
      const value = item.values?.[0]?.value ?? 0;
      if (item.name in out) {
        out[item.name as keyof PostMetrics] = value;
      }
    }
    return out;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[instagram-insights] fetch failed', msg);
    return null;
  }
}

// Heuristic takeaway: pick the strongest signal and translate it into a
// nudge. No baseline comparison yet — added once we have post_metrics
// history rolled up.
export function buildPostMortem(metrics: PostMetrics): PostMortem {
  const reachOrViews = metrics.reach || metrics.views || 0;
  const saveRate     = reachOrViews > 0 ? metrics.saved / reachOrViews : 0;
  const likeRate     = reachOrViews > 0 ? metrics.likes / reachOrViews : 0;
  const commentRate  = reachOrViews > 0 ? metrics.comments / reachOrViews : 0;

  // Pick the standout metric for the headline
  const candidates: { key: keyof PostMetrics; value: number }[] = [
    { key: 'reach',    value: metrics.reach },
    { key: 'views',    value: metrics.views },
    { key: 'likes',    value: metrics.likes },
    { key: 'comments', value: metrics.comments },
    { key: 'saved',    value: metrics.saved },
  ];
  const ranked = candidates.filter(m => m.value > 0).sort((a, b) => b.value - a.value);

  const topMetricKey = ranked[0]?.key ?? 'reach';
  const topMetric = { label: METRIC_LABELS[topMetricKey], value: ranked[0]?.value ?? 0 };

  let takeaway: string;
  if (reachOrViews === 0) {
    takeaway = 'Insights are still warming up — check again tomorrow for fuller numbers.';
  } else if (saveRate >= 0.05) {
    takeaway = 'Strong save rate 💾 — instructional / how-to content is working. Lean in next time.';
  } else if (commentRate >= 0.02) {
    takeaway = 'Comments are rolling in 💬 — keep posting prompts that invite a reply.';
  } else if (likeRate >= 0.05) {
    takeaway = 'Healthy like rate ❤️ — voice is landing. Try one Reel this week to widen reach.';
  } else {
    takeaway = 'Reach is OK but engagement is light — try a stronger hook in the first line next time.';
  }

  return { metrics, topMetric, takeaway };
}

export function formatPostMortemMessage(mortem: PostMortem, postUrl?: string | null): string {
  const { metrics, topMetric, takeaway } = mortem;
  const lines: string[] = [];
  lines.push(`📊 *24h check-in*`);
  if (postUrl) lines.push(`🔗 ${postUrl}`);
  lines.push('');
  lines.push(`*${topMetric.label}:* ${formatNumber(topMetric.value)}`);
  const otherMetrics: (keyof PostMetrics)[] = ['reach', 'views', 'likes', 'comments', 'saved'];
  const seen = new Set<string>([topMetric.label]);
  for (const key of otherMetrics) {
    const label = METRIC_LABELS[key];
    if (seen.has(label)) continue;
    if ((metrics[key] ?? 0) === 0) continue;
    lines.push(`${label}: ${formatNumber(metrics[key])}`);
    seen.add(label);
  }
  lines.push('');
  lines.push(`💡 ${takeaway}`);
  return lines.join('\n');
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000)    return `${(n / 1_000).toFixed(0)}k`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
