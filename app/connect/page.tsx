import { createClient } from '@supabase/supabase-js';
import { MobileBottomNav } from '@/app/_components/mobile-bottom-nav';
import { WaButton } from '@/app/_components/wa-button';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function getAccountsForPhone(phone: string) {
  const { data } = await getSupabase()
    .from('instagram_accounts')
    .select('account_name, instagram_user_id, token_expires_at, is_active')
    .eq('whatsapp_phone', phone)
    .order('account_name');
  return data ?? [];
}

async function getAllAccounts() {
  const { data } = await getSupabase()
    .from('instagram_accounts')
    .select('account_name, instagram_user_id, token_expires_at, is_active')
    .order('account_name');
  return data ?? [];
}

function humanizeIgError(raw: string): string {
  const s = decodeURIComponent(raw).toLowerCase();
  if (s.includes('insufficient developer role') || s.includes('developer role')) {
    return "Your Instagram account isn't on our access list yet. Make sure your account is a Business or Creator account, then contact us to get added.";
  }
  if (s.includes('profile') && (s.includes('exist') || s.includes('found'))) {
    return "Instagram couldn't find your profile. Switch your account to Business or Creator in Instagram → Settings → Account type → Switch to Professional.";
  }
  if (s.includes('permission')) {
    return "Permission denied by Instagram. Make sure you're using a Business or Creator account, not a personal one.";
  }
  if (s.includes('token') || s.includes('oauth') || s.includes('session')) {
    return "Instagram connection expired. Please try connecting again.";
  }
  return decodeURIComponent(raw);
}

function daysUntil(iso: string | null) {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function TokenBadge({ days }: { days: number | null }) {
  if (days === null) return <span style={{ color: 'var(--muted)' }}>Unknown expiry</span>;
  if (days <= 7) return <span style={{ color: 'var(--coral)' }}>Expires in {days}d ⚠️</span>;
  if (days <= 20) return <span style={{ color: 'var(--gold)' }}>Expires in {days}d</span>;
  return <span style={{ color: 'var(--mint)' }}>Expires in {days}d ✓</span>;
}

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string; phone?: string }>;
}) {
  const params = await searchParams;
  const phone = params.phone?.trim();

  const accounts = phone ? await getAccountsForPhone(phone) : await getAllAccounts();
  const hasWhatsApp = !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
  const connectHref = `/api/auth/instagram${phone ? `?phone=${encodeURIComponent(phone)}` : ''}`;
  const isPersonalized = !!phone;

  return (
    <main className="min-h-screen flex flex-col" style={{ background: 'var(--dark)' }}>
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-5 md:px-12" style={{ borderBottom: '1px solid var(--surf3)' }}>
        <a href="/" className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-syne)', color: 'var(--coral)' }}>
          Kreya
        </a>
        <div className="flex items-center gap-3">
          <WaButton />
          <span className="text-xs tracking-widest uppercase hidden md:inline" style={{ fontFamily: 'var(--font-space-mono)', color: 'var(--muted2)' }}>
            {isPersonalized ? 'Your Account' : 'Connections'}
          </span>
        </div>
      </nav>

      <div className="flex-1 px-6 md:px-12 py-12 pb-28 md:pb-12 max-w-2xl mx-auto w-full flex flex-col gap-6">

        {/* Toast */}
        {params.connected && (
          <div className="rounded-2xl px-5 py-4 text-sm font-medium" style={{ background: 'rgba(0,229,160,0.12)', border: '1px solid var(--mint)', color: 'var(--mint)', fontFamily: 'var(--font-dm-sans)' }}>
            ✓ @{params.connected} connected successfully
          </div>
        )}
        {params.error && (
          <div className="rounded-2xl px-5 py-4 flex flex-col gap-2" style={{ background: 'rgba(255,79,59,0.12)', border: '1px solid var(--coral)', fontFamily: 'var(--font-dm-sans)' }}>
            <p className="text-sm font-medium" style={{ color: 'var(--coral)' }}>✗ Connection failed</p>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>{humanizeIgError(params.error)}</p>
          </div>
        )}

        <h1 className="text-3xl font-bold" style={{ fontFamily: 'var(--font-syne)' }}>
          {isPersonalized ? 'Connect Instagram' : 'Connections'}
        </h1>

        {isPersonalized && accounts.length === 0 && !params.connected && (
          <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}>
            Tap the button below to connect your Instagram account. You'll be redirected to Instagram to authorize Kreya — it only takes a moment.
          </p>
        )}

        {/* Instagram */}
        <section className="rounded-2xl p-6 flex flex-col gap-5" style={{ background: 'var(--surf2)' }}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">📸</span>
            <h2 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-syne)' }}>Instagram</h2>
          </div>

          {accounts.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}>
              No account connected yet.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {accounts.map(acc => {
                const days = daysUntil(acc.token_expires_at);
                const reconnectHref = `/api/auth/instagram${phone ? `?phone=${encodeURIComponent(phone)}` : ''}`;
                return (
                  <div key={acc.account_name} className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background: 'var(--surf3)' }}>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium" style={{ fontFamily: 'var(--font-dm-sans)' }}>
                        @{acc.account_name}
                      </span>
                      <span className="text-xs" style={{ fontFamily: 'var(--font-space-mono)', color: 'var(--muted2)' }}>
                        ID {acc.instagram_user_id}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs" style={{ fontFamily: 'var(--font-space-mono)' }}>
                        <TokenBadge days={days} />
                      </span>
                      <a
                        href={reconnectHref}
                        className="text-xs px-3 py-1.5 rounded-full font-medium transition-opacity hover:opacity-80"
                        style={{ background: 'var(--surf)', color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)', border: '1px solid var(--surf3)' }}
                      >
                        Reconnect
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <a
            href={connectHref}
            className="self-start inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-full transition-opacity hover:opacity-90"
            style={{ background: 'var(--coral)', color: 'var(--white)', fontFamily: 'var(--font-dm-sans)' }}
          >
            {accounts.length ? '+ Add account' : 'Connect Instagram'}
          </a>
        </section>

        {/* WhatsApp — only shown in admin (non-personalized) view */}
        {!isPersonalized && (
          <section className="rounded-2xl p-6 flex flex-col gap-4" style={{ background: 'var(--surf2)' }}>
            <div className="flex items-center gap-3">
              <span className="text-2xl">💬</span>
              <h2 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-syne)' }}>WhatsApp</h2>
            </div>

            <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background: 'var(--surf3)' }}>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium" style={{ fontFamily: 'var(--font-dm-sans)' }}>
                  {hasWhatsApp ? 'Business API' : 'Not configured'}
                </span>
                <span className="text-xs" style={{ fontFamily: 'var(--font-space-mono)', color: 'var(--muted2)' }}>
                  {process.env.WHATSAPP_PHONE_NUMBER_ID ?? 'WHATSAPP_PHONE_NUMBER_ID missing'}
                </span>
              </div>
              <span className="text-xs px-2 py-1 rounded-full" style={{
                fontFamily: 'var(--font-space-mono)',
                background: hasWhatsApp ? 'rgba(0,229,160,0.12)' : 'rgba(255,79,59,0.12)',
                color: hasWhatsApp ? 'var(--mint)' : 'var(--coral)',
                border: `1px solid ${hasWhatsApp ? 'var(--mint)' : 'var(--coral)'}`,
              }}>
                {hasWhatsApp ? 'active' : 'missing'}
              </span>
            </div>

            {!hasWhatsApp && (
              <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}>
                Add <code style={{ color: 'var(--gold)' }}>WHATSAPP_ACCESS_TOKEN</code> and <code style={{ color: 'var(--gold)' }}>WHATSAPP_PHONE_NUMBER_ID</code> to your Vercel environment variables. Use a System User token from Meta Business Manager for a token that never expires.
              </p>
            )}
          </section>
        )}

      </div>

      <MobileBottomNav fallbackHref="#" showLogout={false} />
    </main>
  );
}
