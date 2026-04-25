import Link from 'next/link';
import { cookies } from 'next/headers';
import { PhoneForm } from './_components/phone-form';
import { EmailForm } from './_components/email-form';
import { ChatPreview } from './_components/chat-preview';
import { verifySession, SESSION_COOKIE } from '@/lib/session';

const WA_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '';
const waDirectLink = WA_NUMBER
  ? `https://wa.me/${WA_NUMBER.replace('+', '')}?text=Hi+Kreya!`
  : '#';

export default async function Home() {
  const jar     = await cookies();
  const token   = jar.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;
  return (
    <main className="flex flex-col min-h-screen" style={{ background: 'var(--dark)' }}>

      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-5 md:px-12">
        <span className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-syne)', color: 'var(--coral)' }}>
          Kreya
        </span>
        <div className="flex items-center gap-2">
          {session ? (
            <Link
              href="/account"
              className="text-sm px-5 py-2 rounded-full font-medium transition-opacity hover:opacity-90"
              style={{ fontFamily: 'var(--font-dm-sans)', background: 'var(--coral)', color: '#fff' }}
            >
              My dashboard →
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm px-4 py-2 rounded-full font-medium transition-opacity hover:opacity-80"
                style={{ fontFamily: 'var(--font-dm-sans)', color: 'var(--muted)' }}
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="text-sm px-5 py-2 rounded-full font-medium transition-opacity hover:opacity-90"
                style={{ fontFamily: 'var(--font-dm-sans)', background: 'var(--coral)', color: '#fff' }}
              >
                Get access
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 px-6 lg:px-12 pt-12 lg:pt-16 pb-24 max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-[1.05fr,1fr] gap-12 lg:gap-16 items-center">
          <div className="flex flex-col items-center lg:items-start text-center lg:text-left gap-7">
        <span
          className="inline-flex items-center gap-2 text-xs tracking-widest uppercase px-3 py-1 rounded-full"
          style={{ fontFamily: 'var(--font-space-mono)', background: 'var(--surf3)', color: 'var(--mint)' }}
        >
          <span aria-hidden>🎙️</span>
          Voice-first · Chat-native
        </span>

        <h1
          className="text-5xl md:text-6xl xl:text-7xl font-extrabold leading-[1.05] max-w-2xl"
          style={{ fontFamily: 'var(--font-syne)' }}
        >
          Speak it.{' '}
          <span style={{ color: 'var(--coral)' }}>Kreya posts it.</span>
        </h1>

        <p
          className="text-base md:text-lg max-w-xl leading-relaxed"
          style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}
        >
          Voice-note your idea on WhatsApp. Kreya writes the caption in your voice and publishes to Instagram — in under{' '}
          <span style={{ color: 'var(--white)', fontWeight: 600 }}>30 seconds</span>.
        </p>

        {/* Platform badges — Instagram is live; others are colored ghosts under "Coming next" */}
        <div className="flex flex-col items-center lg:items-start gap-3">
          <div
            className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full"
            style={{
              background: 'linear-gradient(135deg, var(--coral) 0%, var(--rose) 100%)',
              boxShadow: '0 8px 28px -10px rgba(255,79,59,.55), inset 0 0 0 1px rgba(255,255,255,.12)',
            }}
          >
            <span className="relative flex h-2 w-2 items-center justify-center">
              <span
                className="absolute inline-flex h-full w-full rounded-full animate-ping"
                style={{ background: 'var(--mint)', opacity: 0.65 }}
              />
              <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: 'var(--mint)' }} />
            </span>
            <InstagramIcon />
            <span className="text-sm font-bold" style={{ fontFamily: 'var(--font-syne)', color: '#fff' }}>
              Instagram
            </span>
            <span
              className="text-[10px] tracking-widest uppercase px-1.5 py-0.5 rounded-full ml-1"
              style={{
                fontFamily: 'var(--font-space-mono)',
                background: 'rgba(7,7,13,.35)',
                color: 'var(--mint)',
              }}
            >
              Live
            </span>
          </div>

          <div className="flex flex-col items-center lg:items-start gap-2 mt-1">
            <span
              className="text-[10px] tracking-[0.22em] uppercase"
              style={{ fontFamily: 'var(--font-space-mono)', color: 'var(--muted2)' }}
            >
              Coming next
            </span>
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-1.5">
              {[
                { name: 'TikTok',   color: '#FF6B8A' },
                { name: 'LinkedIn', color: '#5E35FF' },
                { name: 'Twitter',  color: '#00E5A0' },
                { name: 'Facebook', color: '#FFD166' },
                { name: 'YouTube',  color: '#FF4F3B' },
              ].map(({ name, color }) => (
                <span
                  key={name}
                  className="text-xs px-3 py-1 rounded-full"
                  style={{
                    fontFamily: 'var(--font-space-mono)',
                    color,
                    border: `1px solid ${color}`,
                    background: `${color}14`,
                  }}
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* CTA block */}
        <div
          className="flex flex-col items-center gap-5 w-full max-w-md mt-2 rounded-3xl p-6 md:p-8"
          style={{ background: 'var(--surf)', border: '1px solid var(--surf3)' }}
        >
          {/* Direct WhatsApp button */}
          <a
            href={waDirectLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 text-base font-semibold px-6 py-3.5 rounded-full transition-opacity hover:opacity-90 w-full"
            style={{ background: '#25D366', color: '#fff', fontFamily: 'var(--font-dm-sans)' }}
          >
            <WhatsAppIcon />
            Try with WhatsApp
          </a>

          {/* Divider */}
          <div className="flex items-center gap-3 w-full">
            <div className="flex-1 h-px" style={{ background: 'var(--surf3)' }} />
            <span className="text-xs" style={{ color: 'var(--muted2)', fontFamily: 'var(--font-space-mono)' }}>or</span>
            <div className="flex-1 h-px" style={{ background: 'var(--surf3)' }} />
          </div>

          {/* Phone input */}
          <div className="w-full flex flex-col gap-2">
            <p className="text-sm font-medium text-left" style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}>
              Drop your number — I&apos;ll WhatsApp you the link.
            </p>
            <PhoneForm />
          </div>
        </div>
          </div>

          {/* Right column — chat preview phone mock */}
          <div className="w-full flex justify-center lg:justify-end mt-4 lg:mt-0">
            <ChatPreview />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 md:px-12 py-20" style={{ background: 'var(--surf)' }}>
        <p
          className="text-xs tracking-widest uppercase text-center mb-12"
          style={{ fontFamily: 'var(--font-space-mono)', color: 'var(--muted2)' }}
        >
          How it works
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {[
            {
              step: '01',
              title: 'Voice. Photo. Text.',
              body: 'Voice-note, snap a photo, or type one line on WhatsApp. No app to install, nothing to learn.',
              color: 'var(--coral)',
            },
            {
              step: '02',
              title: 'Your voice, dialed in.',
              body: 'Kreya learns your tone from past Instagram posts, then offers 3 caption angles. Reply 1, 2, or 3 — done.',
              color: 'var(--violet)',
            },
            {
              step: '03',
              title: 'Live in 30 seconds.',
              body: 'Approve with a tap. Or say "post tomorrow at 9" — Kreya schedules it and ships it for you.',
              color: 'var(--mint)',
            },
          ].map(({ step, title, body, color }) => (
            <div key={step} className="rounded-2xl p-6 flex flex-col gap-4" style={{ background: 'var(--surf2)' }}>
              <span className="text-3xl font-bold" style={{ fontFamily: 'var(--font-syne)', color }}>{step}</span>
              <h3 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-syne)' }}>{title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}>{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Waitlist */}
      <section id="waitlist" className="px-6 md:px-12 py-20 flex flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <span
            className="text-xs tracking-widest uppercase px-3 py-1 rounded-full"
            style={{ fontFamily: 'var(--font-space-mono)', background: 'var(--surf3)', color: 'var(--gold)' }}
          >
            Early access
          </span>
          <h2 className="text-3xl md:text-4xl font-bold" style={{ fontFamily: 'var(--font-syne)' }}>
            Want to be first?
          </h2>
          <p className="text-base max-w-sm leading-relaxed" style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}>
            Leave your email and we'll reach out when your spot is ready.
          </p>
        </div>
        <EmailForm />
        <Link
          href="/register"
          className="text-sm font-medium transition-opacity hover:opacity-80"
          style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}
        >
          Or request full access →
        </Link>
      </section>

      {/* Footer */}
      <footer
        className="px-6 md:px-12 py-8 flex items-center justify-between"
        style={{ background: 'var(--ink)' }}
      >
        <span className="text-sm font-bold" style={{ fontFamily: 'var(--font-syne)', color: 'var(--coral)' }}>
          Kreya
        </span>
        <span className="text-xs" style={{ fontFamily: 'var(--font-space-mono)', color: 'var(--muted2)' }}>
          © 2026 Kreya
        </span>
      </footer>

    </main>
  );
}

function InstagramIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff" aria-hidden>
      <path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.81-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.81-.25-2.23-.41a3.71 3.71 0 0 1-1.38-.9 3.71 3.71 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.81.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16zm0 1.96c-3.15 0-3.5.01-4.74.07-.99.05-1.53.21-1.89.34-.47.18-.81.4-1.16.75-.35.35-.57.69-.75 1.16-.13.36-.29.9-.34 1.89-.06 1.24-.07 1.59-.07 4.74s.01 3.5.07 4.74c.05.99.21 1.53.34 1.89.18.47.4.81.75 1.16.35.35.69.57 1.16.75.36.13.9.29 1.89.34 1.24.06 1.59.07 4.74.07s3.5-.01 4.74-.07c.99-.05 1.53-.21 1.89-.34.47-.18.81-.4 1.16-.75.35-.35.57-.69.75-1.16.13-.36.29-.9.34-1.89.06-1.24.07-1.59.07-4.74s-.01-3.5-.07-4.74c-.05-.99-.21-1.53-.34-1.89a3.13 3.13 0 0 0-.75-1.16 3.13 3.13 0 0 0-1.16-.75c-.36-.13-.9-.29-1.89-.34-1.24-.06-1.59-.07-4.74-.07zm0 3.34a4.54 4.54 0 1 1 0 9.08 4.54 4.54 0 0 1 0-9.08zm0 7.5a2.96 2.96 0 1 0 0-5.92 2.96 2.96 0 0 0 0 5.92zm5.78-7.7a1.06 1.06 0 1 1-2.12 0 1.06 1.06 0 0 1 2.12 0z" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}
