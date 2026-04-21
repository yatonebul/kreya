'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';

function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const urlError     = searchParams.get('error');

  const [email,     setEmail]     = useState('');
  const [code,      setCode]      = useState('');
  const [step,      setStep]      = useState<'email' | 'code' | 'verifying'>('email');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(urlError === 'expired_link' ? 'Your invite link expired. Enter your email to get a new code.' : urlError === 'invalid_link' ? 'Invalid link.' : '');

  async function sendCode() {
    setLoading(true);
    setError('');
    try {
      // Always respond "ok" to avoid leaking whether email is registered
      await fetch('/api/auth/otp/email', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: email.toLowerCase().trim() }),
      });
      setStep('code');
    } finally {
      setLoading(false);
    }
  }

  async function verify() {
    if (code.length !== 6) return;
    setStep('verifying');
    setError('');

    const res  = await fetch('/api/auth/otp/verify', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ phone: email.toLowerCase().trim(), code }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      setStep('code');
      return;
    }
    router.push(`/account?email=${encodeURIComponent(email)}`);
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: 'var(--dark)' }}>
      <div className="w-full max-w-sm flex flex-col gap-8">

        <div className="flex flex-col gap-2">
          <Link href="/" className="text-2xl font-bold" style={{ fontFamily: 'var(--font-syne)', color: 'var(--coral)' }}>Kreya</Link>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-syne)', color: 'var(--white)' }}>Sign in</h1>
          <p className="text-sm" style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}>
            We'll send a 6-digit code to your email.
          </p>
        </div>

        {step === 'email' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs" style={{ fontFamily: 'var(--font-space-mono)', color: 'var(--muted2)' }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && email) sendCode(); }}
                placeholder="you@example.com"
                autoFocus
                className="w-full px-4 py-3 rounded-xl outline-none text-sm"
                style={{ background: 'var(--surf2)', color: 'var(--white)', fontFamily: 'var(--font-dm-sans)', border: '1px solid var(--surf3)', caretColor: 'var(--coral)' }}
              />
            </div>
            <button
              onClick={sendCode}
              disabled={!email || loading}
              className="w-full py-3 rounded-full font-medium text-sm transition-opacity hover:opacity-90"
              style={{ background: 'var(--coral)', color: '#fff', fontFamily: 'var(--font-dm-sans)', opacity: !email || loading ? 0.5 : 1 }}
            >
              {loading ? 'Sending…' : 'Send code'}
            </button>
          </div>
        )}

        {(step === 'code' || step === 'verifying') && (
          <div className="flex flex-col gap-4">
            <p className="text-xs" style={{ color: 'var(--mint)', fontFamily: 'var(--font-space-mono)' }}>
              Code sent to {email} ✓
            </p>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={e => { if (e.key === 'Enter' && code.length === 6) verify(); }}
              autoFocus
              className="w-full text-center text-3xl tracking-[0.4em] py-4 rounded-2xl outline-none"
              style={{ background: 'var(--surf2)', color: 'var(--white)', fontFamily: 'var(--font-space-mono)', border: '1px solid var(--surf3)', caretColor: 'var(--coral)' }}
            />
            <button
              onClick={verify}
              disabled={code.length !== 6 || step === 'verifying'}
              className="w-full py-3 rounded-full font-medium text-sm transition-opacity hover:opacity-90"
              style={{ background: 'var(--coral)', color: '#fff', fontFamily: 'var(--font-dm-sans)', opacity: code.length !== 6 || step === 'verifying' ? 0.4 : 1 }}
            >
              {step === 'verifying' ? 'Verifying…' : 'Confirm'}
            </button>
            <button
              onClick={() => { setStep('email'); setCode(''); setError(''); }}
              className="text-xs text-center py-1 transition-opacity hover:opacity-80"
              style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}
            >
              Use a different email
            </button>
          </div>
        )}

        {error && (
          <p className="text-sm" style={{ color: 'var(--coral)', fontFamily: 'var(--font-dm-sans)' }}>{error}</p>
        )}

        <p className="text-xs text-center" style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}>
          No account?{' '}
          <Link href="/register" style={{ color: 'var(--coral)' }}>Request access</Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
