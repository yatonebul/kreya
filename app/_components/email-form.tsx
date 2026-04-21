'use client';

import { useState } from 'react';

export function EmailForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setState('loading');
    setErrorMsg('');

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong');
      setState('done');
    } catch (err: any) {
      setErrorMsg(err.message);
      setState('error');
    }
  }

  if (state === 'done') {
    return (
      <div
        className="rounded-2xl px-5 py-4 text-sm font-medium max-w-md"
        style={{
          background: 'rgba(0,229,160,0.10)',
          border: '1px solid var(--mint)',
          color: 'var(--mint)',
          fontFamily: 'var(--font-dm-sans)',
        }}
      >
        ✓ You're on the list — we'll be in touch.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 w-full max-w-md">
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
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
          disabled={state === 'loading' || !email.trim()}
          className="flex-shrink-0 px-5 py-3 rounded-full text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{
            background: 'var(--coral)',
            color: '#fff',
            fontFamily: 'var(--font-dm-sans)',
          }}
        >
          {state === 'loading' ? '...' : 'Join'}
        </button>
      </div>
      {state === 'error' && (
        <p className="text-xs px-2" style={{ color: 'var(--coral)', fontFamily: 'var(--font-dm-sans)' }}>
          {errorMsg}
        </p>
      )}
    </form>
  );
}
