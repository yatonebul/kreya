'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';

type Mode = 'email' | 'phone';
type Step = 'input' | 'code' | 'verifying';

function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const urlError     = searchParams.get('error');

  const [mode,    setMode]    = useState<Mode>('email');
  const [value,   setValue]   = useState('');       // email or phone
  const [code,    setCode]    = useState('');
  const [step,    setStep]    = useState<Step>('input');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(
    urlError === 'expired_link' ? 'Your invite link expired. Enter your email to get a new code.' :
    urlError === 'invalid_link' ? 'Invalid link.' : ''
  );

  function switchMode(m: Mode) {
    setMode(m);
    setValue('');
    setCode('');
    setStep('input');
    setError('');
  }

  async function sendCode() {
    setLoading(true);
    setError('');
    try {
      const body = mode === 'email'
        ? { email: value.toLowerCase().trim() }
        : { phone: value.trim().replace(/^\+/, '') };
      const endpoint = mode === 'email' ? '/api/auth/otp/email' : '/api/auth/otp/send';

      const res  = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      let data: { error?: string } = {};
      try { data = await res.json(); } catch { /* non-JSON */ }

      if (!res.ok) {
        setError(data.error ?? 'Could not send code. Please try again.');
        return;
      }
      setStep('code');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function verify() {
    if (code.length !== 6) return;
    setStep('verifying');
    setError('');
    try {
      const identifier = mode === 'email'
        ? value.toLowerCase().trim()
        : value.trim().replace(/^\+/, '');

      const res  = await fetch('/api/auth/otp/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: identifier, code }),
      });
      let data: { error?: string } = {};
      try { data = await res.json(); } catch { /* non-JSON */ }

      if (!res.ok) {
        setError(data.error ?? 'Incorrect code. Please try again.');
        setStep('code');
        return;
      }

      if (mode === 'email') {
        router.push(`/account?email=${encodeURIComponent(value.toLowerCase().trim())}`);
      } else {
        router.push(`/account?phone=${encodeURIComponent(value.trim().replace(/^\+/, ''))}`);
      }
    } catch {
      setError('Network error. Please try again.');
      setStep('code');
    }
  }

  const label     = mode === 'email' ? 'email' : 'WhatsApp';
  const inputType = mode === 'email' ? 'email' : 'tel';
  const placeholder = mode === 'email' ? 'you@example.com' : '+420 723 967 372';

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: 'var(--dark)' }}>
      <div className="w-full max-w-sm flex flex-col gap-8">

        <div className="flex flex-col gap-2">
          <Link href="/" className="text-2xl font-bold" style={{ fontFamily: 'var(--font-syne)', color: 'var(--coral)' }}>Kreya</Link>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-syne)', color: 'var(--white)' }}>Sign in</h1>
        </div>

        {/* Mode switcher */}
        <div className="flex rounded-xl p-1 gap-1" style={{ background: 'var(--surf2)' }}>
          {(['email', 'phone'] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                fontFamily: 'var(--font-dm-sans)',
                background: mode === m ? 'var(--surf3)' : 'transparent',
                color: mode === m ? 'var(--white)' : 'var(--muted)',
              }}
            >
              {m === 'email' ? '✉️ Email' : '💬 WhatsApp'}
            </button>
          ))}
        </div>

        {step === 'input' && (
          <div className="flex flex-col gap-4">
            {mode === 'phone' && (
              <p className="text-xs px-3 py-2 rounded-xl" style={{ background: 'var(--surf2)', color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)', border: '1px solid var(--surf3)' }}>
                💬 We&apos;ll send your code on WhatsApp. New here? Say hi to Kreya first or use <button onClick={() => switchMode('email')} style={{ color: 'var(--coral)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}>email login</button>.
              </p>
            )}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs" style={{ fontFamily: 'var(--font-space-mono)', color: 'var(--muted2)' }}>
                {mode === 'email' ? 'Email address' : 'WhatsApp number'}
              </label>
              <input
                type={inputType}
                value={value}
                onChange={e => setValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && value) sendCode(); }}
                placeholder={placeholder}
                autoFocus
                className="w-full px-4 py-3 rounded-xl outline-none text-sm"
                style={{ background: 'var(--surf2)', color: 'var(--white)', fontFamily: 'var(--font-dm-sans)', border: '1px solid var(--surf3)', caretColor: 'var(--coral)' }}
              />
            </div>
            <button
              onClick={sendCode}
              disabled={!value || loading}
              className="w-full py-3 rounded-full font-medium text-sm flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
              style={{ background: mode === 'email' ? 'var(--coral)' : '#25D366', color: '#fff', fontFamily: 'var(--font-dm-sans)', opacity: !value || loading ? 0.5 : 1 }}
            >
              {mode === 'phone' && !loading && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
              )}
              {loading ? 'Sending…' : `Send code via ${label}`}
            </button>
          </div>
        )}

        {(step === 'code' || step === 'verifying') && (
          <div className="flex flex-col gap-4">
            <p className="text-xs" style={{ color: 'var(--mint)', fontFamily: 'var(--font-space-mono)' }}>
              Code sent to {value} ✓
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
              onClick={() => { setStep('input'); setCode(''); setError(''); }}
              className="text-xs text-center py-1 transition-opacity hover:opacity-80"
              style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}
            >
              Use a different {label}
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
