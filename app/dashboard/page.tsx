import { createClient } from '@supabase/supabase-js';
import { MobileBottomNav } from '@/app/_components/mobile-bottom-nav';
import { WaButton } from '@/app/_components/wa-button';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function getStats() {
  const supabase = getSupabase();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [{ count: total }, { count: thisWeek }, { count: pending }, { count: scheduled }] = await Promise.all([
    supabase.from('pending_posts').select('*', { count: 'exact', head: true }).eq('state', 'published'),
    supabase.from('pending_posts').select('*', { count: 'exact', head: true }).eq('state', 'published').gte('created_at', weekAgo),
    supabase.from('pending_posts').select('*', { count: 'exact', head: true }).in('state', ['pending_approval', 'in_edit']),
    supabase.from('pending_posts').select('*', { count: 'exact', head: true }).eq('state', 'scheduled'),
  ]);

  return { total: total ?? 0, thisWeek: thisWeek ?? 0, pending: pending ?? 0, scheduled: scheduled ?? 0 };
}

async function getPosts() {
  const supabase = getSupabase();
  const [{ data: published }, { data: queued }] = await Promise.all([
    supabase.from('pending_posts').select('*').eq('state', 'published')
      .order('created_at', { ascending: false }).limit(30),
    supabase.from('pending_posts').select('*')
      .in('state', ['pending_approval', 'in_edit', 'scheduled'])
      .order('created_at', { ascending: false }),
  ]);
  return { published: published ?? [], queued: queued ?? [] };
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-2xl p-5 flex flex-col gap-1" style={{ background: 'var(--surf2)' }}>
      <span className="text-3xl font-bold" style={{ fontFamily: 'var(--font-syne)', color }}>{value}</span>
      <span className="text-xs tracking-widest uppercase" style={{ fontFamily: 'var(--font-space-mono)', color: 'var(--muted2)' }}>{label}</span>
    </div>
  );
}

function StateBadge({ state }: { state: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    published:        { label: 'live',      color: 'var(--mint)',   bg: 'rgba(0,229,160,0.12)' },
    scheduled:        { label: 'scheduled', color: 'var(--gold)',   bg: 'rgba(255,209,102,0.12)' },
    pending_approval: { label: 'pending',   color: 'var(--violet)', bg: 'rgba(94,53,255,0.12)' },
    in_edit:          { label: 'editing',   color: 'var(--coral)',  bg: 'rgba(255,79,59,0.12)' },
  };
  const s = map[state] ?? { label: state, color: 'var(--muted)', bg: 'var(--surf3)' };
  return (
    <span className="text-xs px-2 py-0.5 rounded-full" style={{
      fontFamily: 'var(--font-space-mono)', color: s.color,
      background: s.bg, border: `1px solid ${s.color}`,
    }}>
      {s.label}
    </span>
  );
}

function PostCard({ post }: { post: any }) {
  const date = new Date(post.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const scheduledFor = post.scheduled_for
    ? new Date(post.scheduled_for).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;
  const caption = post.caption?.slice(0, 100) + (post.caption?.length > 100 ? '…' : '');

  return (
    <div className="rounded-2xl overflow-hidden flex flex-col" style={{ background: 'var(--surf2)' }}>
      <div className="relative w-full" style={{ paddingBottom: '100%' }}>
        {post.image_url && !post.is_video ? (
          <img
            src={post.image_url}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'var(--surf3)' }}>
            <span className="text-3xl">{post.is_video ? '🎬' : '🖼️'}</span>
          </div>
        )}
        <div className="absolute top-2 right-2">
          <StateBadge state={post.state} />
        </div>
      </div>
      <div className="p-3 flex flex-col gap-2">
        <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}>
          {caption}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ fontFamily: 'var(--font-space-mono)', color: 'var(--muted2)' }}>
            {scheduledFor ? `📅 ${scheduledFor}` : date}
          </span>
          {post.ig_post_url && (
            <a
              href={post.ig_post_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium hover:opacity-80 transition-opacity"
              style={{ color: 'var(--coral)', fontFamily: 'var(--font-dm-sans)' }}
            >
              View ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const [stats, { published, queued }] = await Promise.all([getStats(), getPosts()]);

  return (
    <main className="min-h-screen flex flex-col" style={{ background: 'var(--dark)' }}>
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-5 md:px-12" style={{ borderBottom: '1px solid var(--surf3)' }}>
        <a href="/" className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-syne)', color: 'var(--coral)' }}>
          Kreya
        </a>
        <div className="flex items-center gap-4">
          <WaButton />
          <a href="/connect" className="text-sm" style={{ fontFamily: 'var(--font-dm-sans)', color: 'var(--muted)' }}>Connections</a>
          <span className="text-xs tracking-widest uppercase hidden md:inline" style={{ fontFamily: 'var(--font-space-mono)', color: 'var(--muted2)' }}>Dashboard</span>
        </div>
      </nav>

      <div className="flex-1 px-6 md:px-12 py-10 pb-28 md:pb-10 max-w-5xl mx-auto w-full flex flex-col gap-10">

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total published" value={stats.total}     color="var(--mint)" />
          <StatCard label="This week"        value={stats.thisWeek}  color="var(--violet)" />
          <StatCard label="Pending review"   value={stats.pending}   color="var(--gold)" />
          <StatCard label="Scheduled"        value={stats.scheduled} color="var(--coral)" />
        </div>

        {/* Queued posts */}
        {queued.length > 0 && (
          <section className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-syne)' }}>
              In queue
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {queued.map(post => <PostCard key={post.id} post={post} />)}
            </div>
          </section>
        )}

        {/* Published posts */}
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-syne)' }}>
            Published
            <span className="text-sm font-normal ml-2" style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}>
              last 30
            </span>
          </h2>

          {published.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}>
              No posts yet. Send a message on WhatsApp to create your first post.
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {published.map(post => <PostCard key={post.id} post={post} />)}
            </div>
          )}
        </section>

      </div>

      <MobileBottomNav fallbackHref="/connect" showLogout={false} />
    </main>
  );
}
