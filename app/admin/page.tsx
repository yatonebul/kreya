import { createClient } from '@supabase/supabase-js';
import { AdminActions } from '@/app/_components/admin-actions';
import { adminUrlToken } from '@/lib/session';

export const dynamic = 'force-dynamic';

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? '';

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ secret?: string; tab?: string }>;
}) {
  const { secret, tab = 'waitlist' } = await searchParams;
  const expectedToken = ADMIN_SECRET ? adminUrlToken(ADMIN_SECRET) : '';

  if (!ADMIN_SECRET || secret !== expectedToken) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: 'var(--dark)' }}>
        <p className="text-sm" style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}>Access denied.</p>
      </main>
    );
  }

  const secretParam = `?secret=${secret}`;

  const { data: registrations } = await db()
    .from('email_registrations')
    .select('id, email, phone, status, created_at')
    .order('created_at', { ascending: false });

  const { data: igPosts } = await db()
    .from('pending_posts')
    .select('id, whatsapp_phone, caption, image_url, is_video, state, created_at, ig_post_url')
    .order('created_at', { ascending: false })
    .limit(50);

  const { data: igAccounts } = await db()
    .from('instagram_accounts')
    .select('whatsapp_phone, account_name')
    .eq('is_active', true);

  const counts = {
    pending:  registrations?.filter(r => r.status === 'pending').length  ?? 0,
    approved: registrations?.filter(r => r.status === 'approved').length ?? 0,
    rejected: registrations?.filter(r => r.status === 'rejected').length ?? 0,
  };

  const phoneToIg: Record<string, string> = {};
  for (const a of igAccounts ?? []) {
    const clean = a.whatsapp_phone?.replace(/^\+/, '');
    if (clean) phoneToIg[clean] = a.account_name;
  }

  const tabs = [
    { id: 'waitlist',  label: `Waitlist${counts.pending ? ` · ${counts.pending} pending` : ''}` },
    { id: 'instagram', label: 'Instagram' },
  ];

  return (
    <main className="min-h-screen flex flex-col" style={{ background: 'var(--dark)' }}>
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-5 md:px-12" style={{ borderBottom: '1px solid var(--surf3)' }}>
        <span className="text-xl font-bold" style={{ fontFamily: 'var(--font-syne)', color: 'var(--coral)' }}>Kreya Admin</span>
        <div className="flex items-center gap-4 text-xs" style={{ fontFamily: 'var(--font-space-mono)', color: 'var(--muted)' }}>
          <span><span style={{ color: 'var(--gold)' }}>{counts.pending}</span> pending</span>
          <span><span style={{ color: 'var(--mint)' }}>{counts.approved}</span> approved</span>
          <span><span style={{ color: 'var(--muted2)' }}>{counts.rejected}</span> rejected</span>
        </div>
      </nav>

      {/* Tabs */}
      <div className="flex gap-1 px-6 md:px-12 pt-6" style={{ borderBottom: '1px solid var(--surf3)' }}>
        {tabs.map(t => (
          <a
            key={t.id}
            href={`/admin${secretParam}&tab=${t.id}`}
            className="px-4 py-2.5 text-sm font-medium rounded-t-xl transition-colors"
            style={{
              fontFamily: 'var(--font-dm-sans)',
              background: tab === t.id ? 'var(--surf2)' : 'transparent',
              color: tab === t.id ? 'var(--white)' : 'var(--muted)',
              borderBottom: tab === t.id ? '2px solid var(--coral)' : '2px solid transparent',
            }}
          >
            {t.label}
          </a>
        ))}
      </div>

      <div className="flex-1 px-6 md:px-12 py-8 max-w-4xl mx-auto w-full">

        {/* ── WAITLIST TAB ── */}
        {tab === 'waitlist' && (
          <div className="flex flex-col gap-4">
            {/* Pending first */}
            {counts.pending > 0 && (
              <div className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold" style={{ fontFamily: 'var(--font-space-mono)', color: 'var(--gold)' }}>
                  Needs approval ({counts.pending})
                </h2>
                {registrations!.filter(r => r.status === 'pending').map(r => (
                  <RegistrationRow key={r.id} r={r} adminSecret={ADMIN_SECRET} />
                ))}
              </div>
            )}

            {/* Approved */}
            {counts.approved > 0 && (
              <div className="flex flex-col gap-2 mt-4">
                <h2 className="text-sm font-semibold" style={{ fontFamily: 'var(--font-space-mono)', color: 'var(--mint)' }}>
                  Approved ({counts.approved})
                </h2>
                {registrations!.filter(r => r.status === 'approved').map(r => (
                  <RegistrationRow key={r.id} r={r} adminSecret={ADMIN_SECRET} />
                ))}
              </div>
            )}

            {/* Rejected */}
            {counts.rejected > 0 && (
              <div className="flex flex-col gap-2 mt-4">
                <h2 className="text-sm font-semibold" style={{ fontFamily: 'var(--font-space-mono)', color: 'var(--muted2)' }}>
                  Rejected ({counts.rejected})
                </h2>
                {registrations!.filter(r => r.status === 'rejected').map(r => (
                  <RegistrationRow key={r.id} r={r} adminSecret={ADMIN_SECRET} />
                ))}
              </div>
            )}

            {(registrations?.length ?? 0) === 0 && (
              <p className="text-sm" style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}>No registrations yet.</p>
            )}
          </div>
        )}

        {/* ── INSTAGRAM TAB ── */}
        {tab === 'instagram' && (
          <div className="flex flex-col gap-6">
            {(igPosts?.length ?? 0) === 0 ? (
              <p className="text-sm" style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}>No posts yet.</p>
            ) : (
              <>
                {(['published', 'pending_approval', 'scheduled', 'in_edit', 'discarded'] as const).map(state => {
                  const group = igPosts!.filter(p => p.state === state);
                  if (!group.length) return null;
                  const stateLabel: Record<string, string> = {
                    published:        'Published',
                    pending_approval: 'Pending approval',
                    scheduled:        'Scheduled',
                    in_edit:          'In edit',
                    discarded:        'Discarded',
                  };
                  const stateColor: Record<string, string> = {
                    published:        'var(--mint)',
                    pending_approval: 'var(--gold)',
                    scheduled:        'var(--violet)',
                    in_edit:          'var(--muted)',
                    discarded:        'var(--muted2)',
                  };
                  return (
                    <div key={state} className="flex flex-col gap-3">
                      <h2 className="text-sm font-semibold" style={{ fontFamily: 'var(--font-space-mono)', color: stateColor[state] }}>
                        {stateLabel[state]} ({group.length})
                      </h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {group.map(p => {
                          const phone = p.whatsapp_phone?.replace(/^\+/, '');
                          const igHandle = phone ? phoneToIg[phone] : null;
                          return (
                            <div key={p.id} className="rounded-2xl overflow-hidden flex flex-col" style={{ background: 'var(--surf2)' }}>
                              {p.image_url && !p.is_video && (
                                <img src={p.image_url} alt="" className="w-full object-cover" style={{ maxHeight: 180 }} />
                              )}
                              {p.is_video && (
                                <div className="flex items-center justify-center text-3xl py-6" style={{ background: 'var(--surf)' }}>🎬</div>
                              )}
                              <div className="px-4 py-3 flex flex-col gap-1">
                                <p className="text-xs line-clamp-2" style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}>{p.caption}</p>
                                <div className="flex items-center justify-between mt-1">
                                  <span className="text-xs" style={{ fontFamily: 'var(--font-space-mono)', color: 'var(--muted2)' }}>
                                    {igHandle ? `@${igHandle}` : p.whatsapp_phone}
                                    {' · '}
                                    {new Date(p.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                  </span>
                                  {p.ig_post_url && (
                                    <a href={p.ig_post_url} target="_blank" rel="noopener noreferrer" className="text-xs" style={{ color: 'var(--coral)', fontFamily: 'var(--font-dm-sans)' }}>
                                      View ↗
                                    </a>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function RegistrationRow({ r, adminSecret }: { r: any; adminSecret: string }) {
  const statusStyle: Record<string, { color: string; bg: string }> = {
    pending:  { color: 'var(--gold)',   bg: 'rgba(255,209,102,0.10)' },
    approved: { color: 'var(--mint)',   bg: 'rgba(0,229,160,0.08)'  },
    rejected: { color: 'var(--muted2)', bg: 'var(--surf3)'           },
  };
  const s = statusStyle[r.status] ?? statusStyle.pending;
  return (
    <div className="flex items-center justify-between rounded-2xl px-5 py-4 gap-4" style={{ background: 'var(--surf2)', border: r.status === 'pending' ? '1px solid rgba(255,209,102,0.2)' : '1px solid transparent' }}>
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <span className="text-sm font-medium truncate" style={{ fontFamily: 'var(--font-dm-sans)', color: 'var(--white)' }}>
          {r.email}
        </span>
        <span className="text-xs" style={{ fontFamily: 'var(--font-space-mono)', color: 'var(--muted2)' }}>
          {r.phone ? `📱 +${r.phone}` : 'No phone'}
          {' · '}
          {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
      </div>
      <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0" style={{ fontFamily: 'var(--font-space-mono)', color: s.color, background: s.bg, border: `1px solid ${s.color}` }}>
        {r.status}
      </span>
      <AdminActions id={r.id} adminSecret={adminSecret} status={r.status} />
    </div>
  );
}
