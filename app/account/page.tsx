import { createClient } from '@supabase/supabase-js';
import { BrandEditForm } from '@/app/_components/brand-edit-form';

export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kreya-github.vercel.app';
const WA_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '';

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function daysUntil(iso: string | null) {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function TokenBadge({ days }: { days: number | null }) {
  if (days === null) return null;
  if (days <= 7)  return <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,79,59,0.12)', color: 'var(--coral)', border: '1px solid var(--coral)', fontFamily: 'var(--font-space-mono)' }}>Expires in {days}d ⚠️</span>;
  if (days <= 20) return <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,209,102,0.12)', color: 'var(--gold)', border: '1px solid var(--gold)', fontFamily: 'var(--font-space-mono)' }}>Expires in {days}d</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,229,160,0.12)', color: 'var(--mint)', border: '1px solid var(--mint)', fontFamily: 'var(--font-space-mono)' }}>Active ✓</span>;
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
    <span className="text-xs px-2 py-0.5 rounded-full" style={{ fontFamily: 'var(--font-space-mono)', color: s.color, background: s.bg, border: `1px solid ${s.color}` }}>
      {s.label}
    </span>
  );
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ phone?: string }>;
}) {
  const { phone: rawPhone } = await searchParams;

  if (!rawPhone) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: 'var(--dark)' }}>
        <p className="text-sm" style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}>
          No account found. Open the link Kreya sent you on WhatsApp.
        </p>
      </main>
    );
  }

  // Normalize: strip leading +/spaces (WhatsApp stores without +)
  const phone = rawPhone.trim().replace(/^\+/, '');
  // For instagram_accounts which may have been manually set with + prefix
  const phones = [phone, `+${phone}`];
  const supabase = getSupabase();
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [{ data: profile }, { data: igAccount }, { data: posts }, { data: scheduled }] = await Promise.all([
    supabase.from('user_profiles').select('brand_name, niche, tone').eq('whatsapp_phone', phone).maybeSingle(),
    supabase.from('instagram_accounts').select('account_name, token_expires_at').in('whatsapp_phone', phones).eq('is_active', true).maybeSingle(),
    supabase.from('pending_posts').select('id, caption, image_url, is_video, ig_post_url, created_at, state')
      .eq('whatsapp_phone', phone).eq('state', 'published')
      .order('created_at', { ascending: false }).limit(9),
    supabase.from('pending_posts').select('id, caption, image_url, is_video, scheduled_for')
      .eq('whatsapp_phone', phone).eq('state', 'scheduled')
      .order('scheduled_for', { ascending: true }),
  ]);

  const [{ count: totalPublished }, { count: thisMonth }] = await Promise.all([
    supabase.from('pending_posts').select('*', { count: 'exact', head: true }).eq('whatsapp_phone', phone).eq('state', 'published'),
    supabase.from('pending_posts').select('*', { count: 'exact', head: true }).eq('whatsapp_phone', phone).eq('state', 'published').gte('created_at', monthAgo),
  ]);

  const brandName  = profile?.brand_name ?? 'Your account';
  const igDays     = daysUntil(igAccount?.token_expires_at ?? null);
  const connectUrl = `${APP_URL}/api/auth/instagram?phone=${encodeURIComponent(phone)}`;
  const waLink     = WA_NUMBER ? `https://wa.me/${WA_NUMBER.replace('+', '')}?text=Hi+Kreya!` : null;

  return (
    <main className="min-h-screen flex flex-col" style={{ background: 'var(--dark)' }}>
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-5 md:px-12" style={{ borderBottom: '1px solid var(--surf3)' }}>
        <a href="/" className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-syne)', color: 'var(--coral)' }}>
          Kreya
        </a>
        {waLink && (
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-full transition-opacity hover:opacity-90"
            style={{ background: '#25D366', color: '#fff', fontFamily: 'var(--font-dm-sans)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            Open Kreya
          </a>
        )}
      </nav>

      <div className="flex-1 px-6 md:px-12 py-10 max-w-2xl mx-auto w-full flex flex-col gap-8">

        {/* Header */}
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold" style={{ fontFamily: 'var(--font-syne)' }}>{brandName}</h1>
          {igAccount && (
            <span className="text-sm" style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}>
              @{igAccount.account_name}
            </span>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: 'Total published', value: totalPublished ?? 0, color: 'var(--mint)' },
            { label: 'This month',      value: thisMonth      ?? 0, color: 'var(--violet)' },
          ].map(s => (
            <div key={s.label} className="rounded-2xl p-5 flex flex-col gap-1" style={{ background: 'var(--surf2)' }}>
              <span className="text-3xl font-bold" style={{ fontFamily: 'var(--font-syne)', color: s.color }}>{s.value}</span>
              <span className="text-xs tracking-widest uppercase" style={{ fontFamily: 'var(--font-space-mono)', color: 'var(--muted2)' }}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Instagram */}
        <section className="rounded-2xl p-6 flex flex-col gap-4" style={{ background: 'var(--surf2)' }}>
          <h2 className="text-base font-semibold" style={{ fontFamily: 'var(--font-syne)' }}>Instagram</h2>
          {igAccount ? (
            <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background: 'var(--surf3)' }}>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium" style={{ fontFamily: 'var(--font-dm-sans)' }}>@{igAccount.account_name}</span>
                <TokenBadge days={igDays} />
              </div>
              <a
                href={connectUrl}
                className="text-xs px-3 py-1.5 rounded-full font-medium transition-opacity hover:opacity-80"
                style={{ background: 'var(--surf)', color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)', border: '1px solid var(--surf3)' }}
              >
                Change account
              </a>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background: 'var(--surf3)' }}>
              <span className="text-sm" style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}>Not connected</span>
              <a
                href={connectUrl}
                className="text-xs px-3 py-1.5 rounded-full font-medium transition-opacity hover:opacity-90"
                style={{ background: 'var(--coral)', color: '#fff', fontFamily: 'var(--font-dm-sans)' }}
              >
                Connect
              </a>
            </div>
          )}
        </section>

        {/* Brand profile */}
        <section className="rounded-2xl p-6 flex flex-col gap-4" style={{ background: 'var(--surf2)' }}>
          <h2 className="text-base font-semibold" style={{ fontFamily: 'var(--font-syne)' }}>Brand profile</h2>
          <BrandEditForm
            phone={phone}
            initial={{
              brand_name: profile?.brand_name ?? '',
              niche:      profile?.niche      ?? '',
              tone:       profile?.tone       ?? '',
            }}
          />
        </section>

        {/* Scheduled posts */}
        {(scheduled?.length ?? 0) > 0 && (
          <section className="rounded-2xl p-6 flex flex-col gap-4" style={{ background: 'var(--surf2)' }}>
            <h2 className="text-base font-semibold" style={{ fontFamily: 'var(--font-syne)' }}>Coming up</h2>
            <div className="flex flex-col gap-2">
              {scheduled!.map(post => {
                const when = new Date(post.scheduled_for).toLocaleString('en-GB', {
                  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                });
                return (
                  <div key={post.id} className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: 'var(--surf3)' }}>
                    <div className="w-10 h-10 rounded-lg flex-shrink-0 overflow-hidden" style={{ background: 'var(--surf)' }}>
                      {post.image_url && !post.is_video
                        ? <img src={post.image_url} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-lg">{post.is_video ? '🎬' : '🖼️'}</div>
                      }
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <p className="text-xs truncate" style={{ fontFamily: 'var(--font-dm-sans)', color: 'var(--muted)' }}>{post.caption}</p>
                      <span className="text-xs" style={{ fontFamily: 'var(--font-space-mono)', color: 'var(--gold)' }}>📅 {when}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Recent posts grid */}
        <section className="flex flex-col gap-4">
          <h2 className="text-base font-semibold" style={{ fontFamily: 'var(--font-syne)' }}>
            Recent posts
            <span className="text-sm font-normal ml-2" style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}>last 9</span>
          </h2>
          {(posts?.length ?? 0) === 0 ? (
            <p className="text-sm" style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}>
              No posts yet — send Kreya a message on WhatsApp to create your first one.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {posts!.map(post => (
                <a
                  key={post.id}
                  href={post.ig_post_url ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative rounded-xl overflow-hidden"
                  style={{ paddingBottom: '100%', background: 'var(--surf3)', display: 'block' }}
                >
                  {post.image_url && !post.is_video ? (
                    <img src={post.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-2xl">
                      {post.is_video ? '🎬' : '🖼️'}
                    </div>
                  )}
                  {post.ig_post_url && (
                    <div className="absolute inset-0 flex items-end justify-end p-1.5 opacity-0 hover:opacity-100 transition-opacity" style={{ background: 'rgba(0,0,0,0.4)' }}>
                      <span className="text-xs text-white">↗</span>
                    </div>
                  )}
                </a>
              ))}
            </div>
          )}
        </section>

      </div>
    </main>
  );
}
