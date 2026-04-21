'use client';

import { useState } from 'react';

export function PhoneForm() {
  const [phone, setPhone] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [waLink, setWaLink] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) return;
    setState('loading');
    setErrorMsg('');

    try {
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong');
      setWaLink(data.waLink);
      setState('done');
    } catch (err: any) {
      setErrorMsg(err.message);
      setState('error');
    }
  }

  if (state === 'done') {
    return (
      <div className="flex flex-col gap-4 w-full max-w-md">
        <div
          className="rounded-2xl px-5 py-4 text-sm font-medium"
          style={{
            background: 'rgba(0,229,160,0.10)',
            border: '1px solid var(--mint)',
            color: 'var(--mint)',
            fontFamily: 'var(--font-dm-sans)',
          }}
        >
          ✓ Got it! Open WhatsApp to get started.
        </div>
        {waLink && (
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 text-base font-semibold px-6 py-3.5 rounded-full transition-opacity hover:opacity-90 w-full"
            style={{
              background: '#25D366',
              color: '#fff',
              fontFamily: 'var(--font-dm-sans)',
            }}
          >
            <WhatsAppIcon />
            Open WhatsApp →
          </a>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 w-full max-w-md">
      <div className="flex gap-2">
        <input
          type="tel"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="+1 555 000 0000"
          className="flex-1 rounded-full px-5 py-3 text-sm outline-none"
          style={{
            background: 'var(--surf3)',
            color: 'var(--white)',
            fontFamily: 'var(--font-dm-sans)',
            border: '1px solid var(--surf3)',
          }}
          required
        />
        <button
          type="submit"
          disabled={state === 'loading' || !phone.trim()}
          className="flex-shrink-0 px-5 py-3 rounded-full text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{
            background: '#25D366',
            color: '#fff',
            fontFamily: 'var(--font-dm-sans)',
          }}
        >
          {state === 'loading' ? '...' : 'Send link'}
        </button>
      </div>
      {state === 'error' && (
        <p className="text-xs px-2" style={{ color: 'var(--coral)', fontFamily: 'var(--font-dm-sans)' }}>
          {errorMsg}
        </p>
      )}
      <p className="text-xs px-2" style={{ color: 'var(--muted2)', fontFamily: 'var(--font-dm-sans)' }}>
        Enter your WhatsApp number — we'll send you a link to start instantly.
      </p>
    </form>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}
