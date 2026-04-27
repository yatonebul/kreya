import type { JSX } from 'react';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { BrandEditForm } from '@/app/_components/brand-edit-form';
import { OtpGate } from '@/app/_components/otp-gate';
import { LogoutButton } from '@/app/_components/logout-button';
import { LinkPhoneForm } from '@/app/_components/link-phone-form';
import { PendingPosts } from '@/app/_components/pending-posts';
import { OnboardingWizard } from '@/app/_components/onboarding-wizard';
import { CancelScheduledButton } from '@/app/_components/cancel-scheduled-button';
import { MobileBottomNav } from '@/app/_components/mobile-bottom-nav';
import { ComposeCta } from '@/app/_components/compose-cta';
import { WaButton } from '@/app/_components/wa-button';
import { FirstPostCard } from '@/app/_components/first-post-card';
import { RefreshVoiceButton } from '@/app/_components/refresh-voice-button';
import { AccountSwitcher } from '@/app/_components/account-switcher';
import { LoraTrainingPanel } from '@/app/_components/lora-training-panel';
import { EngagementToggles } from '@/app/_components/engagement-toggles';
import { SurfaceStats } from '@/app/_components/surface-stats';
import { TokenRenewalBanner } from '@/app/_components/token-renewal-banner';
import { verifySession, SESSION_COOKIE } from '@/lib/session';

export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kreya-github.vercel.app';

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

const SOCIAL_ICONS: Record<string, JSX.Element> = {
  instagram: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
    </svg>
  ),
};

function SocialLink({ network, handle }: { network: string; handle: string }) {
  const url = network === 'instagram' ? `https://instagram.com/${handle}` : `#`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 transition-opacity hover:opacity-80 w-fit"
      style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)', fontSize: '0.875rem' }}
    >
      {SOCIAL_ICONS[network]}
      @{handle}
    </a>
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
    <span className="text-xs px-2 py-0.5 rounded-full" style={{ fontFamily: 'var(--font-space-mono)', color: s.color, background: s.bg, border: `1px solid ${s.color}` }}>
      {s.label}
    </span>
  );
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ phone?: string; email?: string; ig?: string }>;
}) {
  const { phone: rawPhone, email: rawEmail, ig: rawIgId } = await searchParams;

  // Accept either ?phone= (WhatsApp users) or ?email= (email users)
  const urlIdentifier = rawPhone
    ? rawPhone.trim().replace(/^\+/, '')
    : rawEmail?.trim().toLowerCase() ?? null;

  // Session gate
  const jar          = await cookies();
  const sessionToken = jar.get(SESSION_COOKIE)?.value;
  const session      = sessionToken ? await verifySession(sessionToken) : null;

  if (!session) {
    if (!urlIdentifier) {
      return (
        <main className="min-h-screen flex items-center justify-center" style={{ background: 'var(--dark)' }}>
          <p className="text-sm" style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}>
            No account found.{' '}
            <a href="/login" style={{ color: 'var(--coral)' }}>Sign in</a> or{' '}
            <a href="/register" style={{ color: 'var(--coral)' }}>request access</a>.
          </p>
        </main>
      );
    }
    return <OtpGate identifier={urlIdentifier} />;
  }

  // Detect account mismatch — URL param points to a different account than the session
  if (urlIdentifier) {
    const sessionClean = session.phone.replace(/^\+/, '').toLowerCase();
    const urlClean     = urlIdentifier.replace(/^\+/, '').toLowerCase();
    const match = sessionClean === urlClean || sessionClean.endsWith(urlClean) || urlClean.endsWith(sessionClean);
    if (!match) {
      const loginUrl = `/login`;
      return (
        <main className="min-h-screen flex flex-col items-center justify-center px-6 gap-6" style={{ background: 'var(--dark)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6 flex flex-col gap-4" style={{ background: 'var(--surf2)', border: '1px solid var(--surf3)' }}>
            <p className="text-base font-semibold" style={{ fontFamily: 'var(--font-syne)', color: 'var(--white)' }}>
              Different account detected
            </p>
            <p className="text-sm" style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)', lineHeight: 1.6 }}>
              You're signed in as <strong style={{ color: 'var(--white)' }}>{session.phone}</strong>, but this link is for <strong style={{ color: 'var(--white)' }}>{urlIdentifier}</strong>.
            </p>
            <div className="flex flex-col gap-2">
              <a
                href={`/account`}
                className="w-full py-2.5 rounded-full text-sm font-medium text-center"
                style={{ background: 'var(--coral)', color: '#fff', fontFamily: 'var(--font-dm-sans)' }}
              >
                Continue as {session.phone}
              </a>
              <a
                href={`/api/auth/logout?redirect=${encodeURIComponent(`/login`)}`}
                className="w-full py-2.5 rounded-full text-sm font-medium text-center"
                style={{ background: 'var(--surf3)', color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}
              >
                Sign out &amp; switch account
              </a>
            </div>
          </div>
        </main>
      );
    }
  }

  // session.phone holds either a phone number or an email (for email-only accounts)
  const sessionId = session.phone;
  const isEmailSession = sessionId.includes('@');

  const supabase = getSupabase();

  // For email sessions, look up linked WhatsApp phone
  let dataPhone = isEmailSession ? null : sessionId;
  let sessionEmail: string | null = isEmailSession ? sessionId : null;

  if (isEmailSession) {
    const { data: reg } = await supabase
      .from('email_registrations')
      .select('phone')
      .eq('email', sessionId)
      .maybeSingle();
    dataPhone = reg?.phone ?? null;
  }

  // The identifier used for all DB queries — prefer phone, fall back to email
  const queryId = dataPhone ?? sessionId;
  const phones  = dataPhone ? [dataPhone, `+${dataPhone}`] : [];
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [{ data: phoneProfile }, { data: allAccounts }, { data: posts }, { data: scheduled }] = await Promise.all([
    supabase.from('user_profiles').select('brand_name, niche, tone').eq('whatsapp_phone', queryId).maybeSingle(),
    phones.length
      ? supabase.from('instagram_accounts')
          .select('id, account_name, token_expires_at, brand_name, niche, tone, is_active, lora_status, lora_trained_at, dm_autoreply_enabled, comment_autoreply_enabled')
          .in('whatsapp_phone', phones)
          .order('account_name')
      : Promise.resolve({ data: [] as Array<{ id: string; account_name: string; token_expires_at: string | null; brand_name: string | null; niche: string | null; tone: string | null; is_active: boolean; lora_status: string | null; lora_trained_at: string | null; dm_autoreply_enabled: boolean; comment_autoreply_enabled: boolean }> }),
    dataPhone
      ? supabase.from('pending_posts').select('id, caption, image_url, is_video, ig_post_url, created_at, state')
          .eq('whatsapp_phone', dataPhone).eq('state', 'published')
          .order('created_at', { ascending: false }).limit(9)
      : Promise.resolve({ data: [] }),
    dataPhone
      ? supabase.from('pending_posts').select('id, caption, image_url, is_video, scheduled_for')
          .eq('whatsapp_phone', dataPhone).eq('state', 'scheduled')
          .order('scheduled_for', { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  const [{ count: totalPublished }, { count: thisMonth }] = dataPhone
    ? await Promise.all([
        supabase.from('pending_posts').select('*', { count: 'exact', head: true }).eq('whatsapp_phone', dataPhone).eq('state', 'published'),
        supabase.from('pending_posts').select('*', { count: 'exact', head: true }).eq('whatsapp_phone', dataPhone).eq('state', 'published').gte('created_at', monthAgo),
      ])
    : [{ count: 0 }, { count: 0 }];

  // Surface mix for the last 30 days — feeds the SurfaceStats card so
  // users see which IG surfaces they've used (and which they haven't).
  const { data: surfaceRows } = dataPhone
    ? await supabase
        .from('pending_posts')
        .select('surface')
        .eq('whatsapp_phone', dataPhone)
        .eq('state', 'published')
        .gte('created_at', monthAgo)
    : { data: [] };
  const surfaceCounts: { surface: 'feed' | 'reels' | 'carousel' | 'story'; count: number }[] = [];
  for (const row of surfaceRows ?? []) {
    const s = (row.surface as string | null) ?? 'feed';
    if (s !== 'feed' && s !== 'reels' && s !== 'carousel' && s !== 'story') continue;
    const existing = surfaceCounts.find(c => c.surface === s);
    if (existing) existing.count += 1;
    else surfaceCounts.push({ surface: s as any, count: 1 });
  }

  const { data: pendingPosts } = dataPhone
    ? await supabase.from('pending_posts')
        .select('id, caption, image_url, is_video, state')
        .eq('whatsapp_phone', dataPhone)
        .in('state', ['pending_approval', 'in_edit'])
        .order('created_at', { ascending: false })
    : { data: [] };

  // Active account is the default focus when /account is opened without
  // ?ig=<id>. Multi-account users can switch via the AccountSwitcher
  // tabs which set ?ig — that's the "viewed" account whose brand profile
  // gets edited.
  //
  // Self-heal: if the user has connected IG accounts but none is marked
  // is_active (residual state from the demote-then-failed-insert OAuth
  // bug), auto-promote the most recently connected one. Otherwise the
  // IG section + publishing + refresh-voice all incorrectly report
  // "Not connected" even though valid accounts exist.
  const accounts = allAccounts ?? [];
  let activeAccount = accounts.find(a => a.is_active) ?? null;
  if (!activeAccount && accounts.length > 0) {
    const newest = [...accounts].sort((a, b) => {
      const at = a.token_expires_at ? Date.parse(a.token_expires_at) : 0;
      const bt = b.token_expires_at ? Date.parse(b.token_expires_at) : 0;
      return bt - at;
    })[0];
    await supabase
      .from('instagram_accounts')
      .update({ is_active: true })
      .eq('id', newest.id);
    newest.is_active = true;
    activeAccount = newest;
  }
  const viewedAccount = rawIgId
    ? accounts.find(a => a.id === rawIgId) ?? activeAccount
    : activeAccount;

  // Per-account brand profile takes priority once an IG is connected.
  // Phone-level user_profiles is the legacy fallback (and the source for
  // pre-connect onboarding data).
  const profile = {
    brand_name: viewedAccount?.brand_name ?? phoneProfile?.brand_name ?? null,
    niche:      viewedAccount?.niche      ?? phoneProfile?.niche      ?? null,
    tone:       viewedAccount?.tone       ?? phoneProfile?.tone       ?? null,
  };
  const profileSource: 'account' | 'phone' = viewedAccount?.brand_name ? 'account' : 'phone';
  const brandName  = profile.brand_name ?? (isEmailSession ? sessionId : 'Your account');

  // New user with no brand profile yet → show onboarding wizard
  if (!profile.brand_name) {
    return <OnboardingWizard phone={queryId} />;
  }
  // Active is what the rest of the page (token banner, etc.) cares about.
  const igAccount = activeAccount;
  const igDays     = daysUntil(igAccount?.token_expires_at ?? null);
  const connectUrl = `${APP_URL}/api/auth/instagram?phone=${encodeURIComponent(dataPhone ?? queryId)}`;

  return (
    <main className="min-h-screen flex flex-col" style={{ background: 'var(--dark)' }}>
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-5 md:px-12" style={{ borderBottom: '1px solid var(--surf3)' }}>
        <a href="/" className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-syne)', color: 'var(--coral)' }}>
          Kreya
        </a>
        <div className="flex items-center gap-2">
          <WaButton />
          <span className="text-xs truncate max-w-[140px] hidden sm:block" style={{ color: 'var(--muted2)', fontFamily: 'var(--font-space-mono)' }}>
            {sessionId}
          </span>
          <LogoutButton />
        </div>
      </nav>

      <TokenRenewalBanner
        days={igDays}
        connectUrl={connectUrl}
        accountName={igAccount?.account_name ?? null}
      />

      <div className="flex-1 px-6 md:px-12 py-10 pb-28 md:pb-10 max-w-2xl mx-auto w-full flex flex-col gap-8">

        {/* Header */}
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold" style={{ fontFamily: 'var(--font-syne)' }}>{brandName}</h1>
          {igAccount && <SocialLink network="instagram" handle={igAccount.account_name} />}
        </div>

        {/* Pending / in-edit posts — shown at the top so user can't miss them */}
        {(pendingPosts?.length ?? 0) > 0 && (
          <PendingPosts initial={pendingPosts!} connectUrl={connectUrl} />
        )}

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

        {/* Surface mix — Feed vs Reels vs Carousel vs Story split. */}
        <SurfaceStats counts={surfaceCounts} />

        {/* Brand profile — promoted above Instagram because it controls every caption.
            For multi-account users, AccountSwitcher tabs let them pick which IG's
            brand profile they're editing. The badge tells them whether they're
            editing per-account voice or the legacy account-wide default. */}
        <section className="rounded-2xl p-6 flex flex-col gap-4" style={{ background: 'var(--surf2)' }}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold" style={{ fontFamily: 'var(--font-syne)' }}>
                {profileSource === 'account' && viewedAccount ? `@${viewedAccount.account_name} brand` : 'Brand profile'}
              </h2>
              <span
                className="text-[10px] tracking-widest uppercase px-2 py-0.5 rounded-full"
                style={{
                  fontFamily: 'var(--font-space-mono)',
                  color: profileSource === 'account' ? 'var(--mint)' : 'var(--gold)',
                  background: profileSource === 'account' ? 'rgba(0,229,160,0.10)' : 'rgba(255,209,102,0.10)',
                  border: profileSource === 'account'
                    ? '1px solid rgba(0,229,160,0.35)'
                    : '1px solid rgba(255,209,102,0.35)',
                }}
              >
                {profileSource === 'account' ? 'Per-account voice' : 'Account-wide default'}
              </span>
            </div>
            <RefreshVoiceButton phone={queryId} accountId={viewedAccount?.id} />
          </div>
          {accounts.length > 1 && (
            <AccountSwitcher
              accounts={accounts.map(a => ({ id: a.id, account_name: a.account_name, is_active: a.is_active }))}
              selectedId={viewedAccount?.id ?? null}
            />
          )}
          <BrandEditForm
            phone={queryId}
            accountId={viewedAccount?.id}
            initial={{
              brand_name: profile.brand_name ?? '',
              niche:      profile.niche      ?? '',
              tone:       profile.tone       ?? '',
            }}
          />
        </section>

        {/* Brand image style (LoRA) — per-account visual consistency.
            Only renders when an IG account is connected. */}
        {viewedAccount && (
          <LoraTrainingPanel
            phone={queryId}
            accountId={viewedAccount.id}
            accountName={viewedAccount.account_name}
            status={(viewedAccount.lora_status as 'training' | 'ready' | 'failed' | null) ?? null}
            trainedAt={viewedAccount.lora_trained_at ?? null}
          />
        )}

        {/* Auto-reply engagement toggles — per-account, default OFF. */}
        {viewedAccount && (
          <EngagementToggles
            phone={queryId}
            accountId={viewedAccount.id}
            accountName={viewedAccount.account_name}
            dmEnabled={!!viewedAccount.dm_autoreply_enabled}
            commentEnabled={!!viewedAccount.comment_autoreply_enabled}
          />
        )}

        {/* Instagram */}
        <section className="rounded-2xl p-6 flex flex-col gap-4" style={{ background: 'var(--surf2)' }}>
          <h2 className="text-base font-semibold" style={{ fontFamily: 'var(--font-syne)' }}>Instagram</h2>
          {igAccount ? (
            <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background: 'var(--surf3)' }}>
              <div className="flex flex-col gap-1">
                <SocialLink network="instagram" handle={igAccount.account_name} />
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

        {/* Link WhatsApp — only shown for email users without a linked phone */}
        {isEmailSession && !dataPhone && (
          <section className="rounded-2xl p-6 flex flex-col gap-4" style={{ background: 'var(--surf2)', border: '1px solid rgba(255,209,102,0.2)' }}>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold" style={{ fontFamily: 'var(--font-syne)' }}>Link WhatsApp</h2>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ fontFamily: 'var(--font-space-mono)', color: 'var(--gold)', background: 'rgba(255,209,102,0.12)', border: '1px solid var(--gold)' }}>optional</span>
            </div>
            <LinkPhoneForm email={sessionId} />
          </section>
        )}

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
                    <CancelScheduledButton postId={post.id} />
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Recent posts grid — first-run replaces the section with a rich activation card */}
        {(posts?.length ?? 0) === 0 ? (
          <FirstPostCard />
        ) : (
          <section className="flex flex-col gap-4">
            <h2 className="text-base font-semibold" style={{ fontFamily: 'var(--font-syne)' }}>
              Recent posts
              <span className="text-sm font-normal ml-2" style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}>last 9</span>
            </h2>
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
                    <img src={post.image_url} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
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
          </section>
        )}

      </div>

      <MobileBottomNav
        fallbackHref={connectUrl}
        fallbackColor={igAccount ? 'var(--mint)' : 'var(--coral)'}
        fallbackLabel="Instagram"
      />
      <ComposeCta
        prompt={
          igAccount
            ? `Hi Kreya! Make me a post about `
            : 'Hi Kreya! '
        }
      />
    </main>
  );
}
