type SurfaceCount = { surface: 'feed' | 'reels' | 'carousel' | 'story'; count: number };

const SURFACE_META: Record<SurfaceCount['surface'], { label: string; emoji: string; color: string }> = {
  feed:     { label: 'Feed',     emoji: '📷', color: 'var(--coral)' },
  reels:    { label: 'Reels',    emoji: '🎬', color: 'var(--violet)' },
  carousel: { label: 'Carousel', emoji: '🖼️', color: 'var(--gold)'   },
  story:    { label: 'Stories',  emoji: '🌅', color: 'var(--mint)'   },
};

// Read-only summary card showing how the user's last 30 days of
// published content split across IG surfaces. Highlights any surface
// that's at zero so the user notices unutilised distribution.
export function SurfaceStats({ counts }: { counts: SurfaceCount[] }) {
  const total = counts.reduce((sum, c) => sum + c.count, 0);
  if (total === 0) return null;

  const ordered: SurfaceCount[] = (['feed', 'reels', 'carousel', 'story'] as const).map(s => {
    const found = counts.find(c => c.surface === s);
    return { surface: s, count: found?.count ?? 0 };
  });

  return (
    <section className="rounded-2xl p-6 flex flex-col gap-4" style={{ background: 'var(--surf2)' }}>
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-base font-semibold" style={{ fontFamily: 'var(--font-syne)' }}>
          Surface mix
        </h2>
        <span
          className="text-[10px] tracking-widest uppercase px-2 py-0.5 rounded-full"
          style={{ fontFamily: 'var(--font-space-mono)', color: 'var(--muted2)', border: '1px solid var(--surf3)' }}
        >
          last 30 days
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {ordered.map(({ surface, count }) => {
          const meta = SURFACE_META[surface];
          const pct  = total > 0 ? Math.round((count / total) * 100) : 0;
          const isZero = count === 0;
          return (
            <div
              key={surface}
              className="rounded-xl p-4 flex flex-col gap-1"
              style={{
                background: 'var(--surf3)',
                opacity: isZero ? 0.55 : 1,
                border: isZero ? '1px dashed var(--surf3)' : '1px solid transparent',
              }}
            >
              <div className="flex items-center gap-1.5">
                <span aria-hidden style={{ fontSize: 16 }}>{meta.emoji}</span>
                <span className="text-xs tracking-widest uppercase" style={{ fontFamily: 'var(--font-space-mono)', color: 'var(--muted2)' }}>
                  {meta.label}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span
                  className="text-2xl font-bold"
                  style={{ fontFamily: 'var(--font-syne)', color: meta.color }}
                >
                  {count}
                </span>
                {!isZero && (
                  <span className="text-xs" style={{ fontFamily: 'var(--font-space-mono)', color: 'var(--muted2)' }}>
                    {pct}%
                  </span>
                )}
              </div>
              {isZero && (
                <span className="text-[10px] mt-0.5" style={{ fontFamily: 'var(--font-dm-sans)', color: 'var(--gold)' }}>
                  Try one — voice-note a {meta.label.toLowerCase()} idea
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
