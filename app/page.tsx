import Link from 'next/link';
import { PhoneForm } from './_components/phone-form';
import { EmailForm } from './_components/email-form';

const WA_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '';
const waDirectLink = WA_NUMBER
  ? `https://wa.me/${WA_NUMBER.replace('+', '')}?text=Hi+Kreya!`
  : '#';

export default function Home() {
  return (
    <main className="flex flex-col min-h-screen" style={{ background: 'var(--dark)' }}>

      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-5 md:px-12">
        <span className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-syne)', color: 'var(--coral)' }}>
          Kreya
        </span>
        <div className="flex items-center gap-2">
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
        </div>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center flex-1 text-center px-6 pt-16 pb-24 gap-8">
        <span
          className="text-xs tracking-widest uppercase px-3 py-1 rounded-full"
          style={{ fontFamily: 'var(--font-space-mono)', background: 'var(--surf3)', color: 'var(--mint)' }}
        >
          AI-powered social media
        </span>

        <h1
          className="text-5xl md:text-7xl font-extrabold leading-tight max-w-3xl"
          style={{ fontFamily: 'var(--font-syne)' }}
        >
          Tell Kreya what you need.{' '}
          <span style={{ color: 'var(--coral)' }}>Consider it done.</span>
        </h1>

        <p
          className="text-lg md:text-xl max-w-xl leading-relaxed"
          style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}
        >
          Send a WhatsApp voice note or text. Kreya writes the caption, picks the image, and publishes to Instagram — automatically.
        </p>

        {/* Platform badges */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {['Instagram', 'TikTok', 'Twitter', 'LinkedIn', 'Facebook', 'YouTube'].map(p => (
            <span
              key={p}
              className="text-xs px-3 py-1 rounded-full"
              style={{ fontFamily: 'var(--font-space-mono)', background: 'var(--surf2)', color: 'var(--muted)', border: '1px solid var(--surf3)' }}
            >
              {p}
            </span>
          ))}
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
              Enter your number — get the link sent to you
            </p>
            <PhoneForm />
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
              title: 'Send a message',
              body: 'Voice note or text on WhatsApp. Describe what you want to post — no apps to learn.',
              color: 'var(--coral)',
            },
            {
              step: '02',
              title: 'Kreya creates',
              body: 'Claude AI writes the perfect caption and generates visuals tailored to your brand.',
              color: 'var(--violet)',
            },
            {
              step: '03',
              title: 'Published instantly',
              body: 'Approve with one tap and your post goes live. Or schedule it for later — your call.',
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

function WhatsAppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}
