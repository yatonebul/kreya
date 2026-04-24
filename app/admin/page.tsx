import { createClient } from '@supabase/supabase-js';
import { AdminActions } from '@/app/_components/admin-actions';
import { adminUrlToken } from '@/lib/session';

export const dynamic = 'force-dynamic';

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? '';

function db() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ secret?: string }>;
}) {
  const { secret } = await searchParams;
  const expectedToken = ADMIN_SECRET ? adminUrlToken(ADMIN_SECRET) : '';

  if (!ADMIN_SECRET || secret !== expectedToken) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: 'var(--dark)' }}>
        <p className="text-sm" style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}>Access denied.</p>
      </main>
    );
  }

  const { data: registrations } = await db()
    .from('email_registrations')
    .select('id, email, phone, status, created_at, approved_at')
    .order('created_at', { ascending: false });

  const counts = {
    pending:  registrations?.filter(r => r.status === 'pending').length  ?? 0,
    approved: registrations?.filter(r => r.status === 'approved').length ?? 0,
    rejected: registrations?.filter(r => r.status === 'rejected').length ?? 0,
  };

  return (
    <main className="min-h-screen flex flex-col" style={{ background: 'var(--dark)' }}>
      <nav className="flex items-center justify-between px-6 py-5 md:px-12" style={{ borderBottom: '1px solid var(--surf3)' }}>
        <span className="text-xl font-bold" style={{ fontFamily: 'var(--font-syne)', color: 'var(--coral)' }}>Kreya Admin</span>
        <div className="flex items-center gap-4 text-xs" style={{ fontFamily: 'var(--font-space-mono)', color: 'var(--muted)' }}>
          <span><span style={{ color: 'var(--gold)' }}>{counts.pending}</span> pending</span>
          <span><span style={{ color: 'var(--mint)' }}>{counts.approved}</span> approved</span>
          <span><span style={{ color: 'var(--muted2)' }}>{counts.rejected}</span> rejected</span>
        </div>
      </nav>

      <div className="flex-1 px-6 md:px-12 py-10 max-w-3xl mx-auto w-full flex flex-col gap-4">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-syne)' }}>Registrations</h1>

        {(registrations?.length ?? 0) === 0 ? (
          <p className="text-sm" style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}>No registrations yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {registrations!.map(r => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-2xl px-5 py-4 gap-4"
                style={{ background: 'var(--surf2)' }}
              >
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
                <StatusBadge status={r.status} />
                <AdminActions id={r.id} adminSecret={ADMIN_SECRET} status={r.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    pending:  { label: 'pending',  color: 'var(--gold)',   bg: 'rgba(255,209,102,0.12)' },
    approved: { label: 'approved', color: 'var(--mint)',   bg: 'rgba(0,229,160,0.12)' },
    rejected: { label: 'rejected', color: 'var(--muted)',  bg: 'var(--surf3)' },
  };
  const s = map[status] ?? map.pending;
  return (
    <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0" style={{ fontFamily: 'var(--font-space-mono)', color: s.color, background: s.bg, border: `1px solid ${s.color}` }}>
      {s.label}
    </span>
  );
}
