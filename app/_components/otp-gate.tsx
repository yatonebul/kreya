'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function OtpGate({ phone }: { phone: string }) {
  const router  = useRouter();
  const [step,    setStep]    = useState<'idle' | 'sent' | 'verifying'>('idle');
  const [code,    setCode]    = useState('');
  const [error,   setError]   = useState('');
  const [sending, setSending] = useState(false);

  async function sendCode() {
    setSending(true);
    setError('');
    try {
      const res  = await fetch('/api/auth/otp/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setStep('sent');
    } finally {
      setSending(false);
    }
  }

  async function verify() {
    if (code.length !== 6) return;
    setStep('verifying');
    setError('');
    const res  = await fetch('/api/auth/otp/verify', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ phone, code }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      setStep('sent');
      return;
    }
    router.refresh();
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: 'var(--dark)' }}>

      {/* Logo */}
      <div className="mb-10">
        <span className="text-2xl font-bold" style={{ fontFamily: 'var(--font-syne)', color: 'var(--coral)' }}>
          Kreya
        </span>
      </div>

      <div className="w-full max-w-sm flex flex-col gap-6">

        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-syne)', color: 'var(--white)' }}>
            Verify it&apos;s you
          </h1>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}>
            We&apos;ll send a 6-digit code to your WhatsApp to confirm your identity.
          </p>
        </div>

        {step === 'idle' && (
          <button
            onClick={sendCode}
            disabled={sending}
            className="w-full py-3 rounded-full font-medium text-sm flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
            style={{ background: '#25D366', color: '#fff', fontFamily: 'var(--font-dm-sans)', opacity: sending ? 0.6 : 1 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            {sending ? 'Sending…' : 'Send code via WhatsApp'}
          </button>
        )}

        {(step === 'sent' || step === 'verifying') && (
          <div className="flex flex-col gap-3">
            <p className="text-xs" style={{ color: 'var(--mint)', fontFamily: 'var(--font-space-mono)' }}>
              Code sent — check your WhatsApp ✓
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
              className="w-full text-center text-3xl tracking-[0.4em] py-4 rounded-2xl outline-none"
              style={{ background: 'var(--surf2)', color: 'var(--white)', fontFamily: 'var(--font-space-mono)', border: '1px solid var(--surf3)', caretColor: 'var(--coral)' }}
              autoFocus
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
              onClick={() => { setStep('idle'); setCode(''); setError(''); }}
              className="text-xs text-center py-1 transition-opacity hover:opacity-80"
              style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}
            >
              Resend code
            </button>
          </div>
        )}

        {error && (
          <p className="text-sm text-center" style={{ color: 'var(--coral)', fontFamily: 'var(--font-dm-sans)' }}>
            {error}
          </p>
        )}

      </div>
    </main>
  );
}
