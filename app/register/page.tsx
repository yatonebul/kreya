'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function RegisterPage() {
  const [email,   setEmail]   = useState('');
  const [phone,   setPhone]   = useState('');
  const [loading, setLoading] = useState(false);
  const [done,      setDone]      = useState(false);
  const [duplicate, setDuplicate] = useState<null | 'pending' | 'approved' | 'rejected'>(null);
  const [error,     setError]     = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res  = await fetch('/api/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, phone: phone || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      if (data.duplicate) { setDuplicate(data.status ?? 'pending'); return; }
      setDone(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: 'var(--dark)' }}>
      <div className="w-full max-w-sm flex flex-col gap-8">

        <div className="flex flex-col gap-2">
          <Link href="/" className="text-2xl font-bold" style={{ fontFamily: 'var(--font-syne)', color: 'var(--coral)' }}>Kreya</Link>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-syne)', color: 'var(--white)' }}>
            Request early access
          </h1>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}>
            We review every request. You'll get an email once approved.
          </p>
        </div>

        {done ? (
          <div className="rounded-2xl p-6 flex flex-col gap-3 text-center" style={{ background: 'var(--surf2)' }}>
            <span className="text-3xl">✅</span>
            <p className="text-base font-semibold" style={{ fontFamily: 'var(--font-syne)', color: 'var(--white)' }}>
              You're on the list
            </p>
            <p className="text-sm" style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}>
              Check <strong style={{ color: 'var(--white)' }}>{email}</strong> — we sent a confirmation. We'll email you again once approved.
            </p>
          </div>
        ) : duplicate === 'approved' ? (
          <div className="rounded-2xl p-6 flex flex-col gap-3 text-center" style={{ background: 'var(--surf2)', border: '1px solid rgba(0,229,160,0.2)' }}>
            <span className="text-3xl">✅</span>
            <p className="text-base font-semibold" style={{ fontFamily: 'var(--font-syne)', color: 'var(--white)' }}>
              Your account is approved
            </p>
            <p className="text-sm" style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}>
              <strong style={{ color: 'var(--white)' }}>{email}</strong> already has access. Sign in to open your dashboard.
            </p>
            <a
              href="/login"
              className="mt-1 inline-block py-2.5 px-6 rounded-full text-sm font-medium"
              style={{ background: 'var(--coral)', color: '#fff', fontFamily: 'var(--font-dm-sans)' }}
            >
              Sign in →
            </a>
          </div>
        ) : duplicate ? (
          <div className="rounded-2xl p-6 flex flex-col gap-3 text-center" style={{ background: 'var(--surf2)', border: '1px solid rgba(255,209,102,0.2)' }}>
            <span className="text-3xl">👀</span>
            <p className="text-base font-semibold" style={{ fontFamily: 'var(--font-syne)', color: 'var(--white)' }}>
              Already on the waitlist
            </p>
            <p className="text-sm" style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}>
              <strong style={{ color: 'var(--white)' }}>{email}</strong> is already registered. Check your inbox (and spam) — we'll reach out once approved.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs" style={{ fontFamily: 'var(--font-space-mono)', color: 'var(--muted2)' }}>Email *</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl outline-none text-sm"
                style={{ background: 'var(--surf2)', color: 'var(--white)', fontFamily: 'var(--font-dm-sans)', border: '1px solid var(--surf3)', caretColor: 'var(--coral)' }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs" style={{ fontFamily: 'var(--font-space-mono)', color: 'var(--muted2)' }}>WhatsApp number <span style={{ color: 'var(--muted)' }}>(optional — links your existing Kreya data)</span></label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+420 723 967 372"
                className="w-full px-4 py-3 rounded-xl outline-none text-sm"
                style={{ background: 'var(--surf2)', color: 'var(--white)', fontFamily: 'var(--font-dm-sans)', border: '1px solid var(--surf3)', caretColor: 'var(--coral)' }}
              />
            </div>

            {error && (
              <p className="text-sm" style={{ color: 'var(--coral)', fontFamily: 'var(--font-dm-sans)' }}>{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-full font-medium text-sm transition-opacity hover:opacity-90"
              style={{ background: 'var(--coral)', color: '#fff', fontFamily: 'var(--font-dm-sans)', opacity: loading ? 0.6 : 1 }}
            >
              {loading ? 'Sending…' : 'Request access'}
            </button>
          </form>
        )}

        <p className="text-xs text-center" style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}>
          Already have access?{' '}
          <Link href="/login" style={{ color: 'var(--coral)' }}>Sign in</Link>
        </p>
      </div>
    </main>
  );
}
