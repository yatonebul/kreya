'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function LinkPhoneForm({ email }: { email: string }) {
  const router  = useRouter();
  const [phone,   setPhone]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [done,    setDone]    = useState(false);

  async function save() {
    const normalized = phone.trim().replace(/^\+/, '');
    if (!normalized) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/profile/link-phone', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, phone: normalized }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setDone(true);
      setTimeout(() => router.refresh(), 800);
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="text-sm" style={{ color: 'var(--mint)', fontFamily: 'var(--font-dm-sans)' }}>
        ✓ WhatsApp linked — refreshing…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}>
        Link your WhatsApp number to see your posts and use Kreya on mobile.
      </p>
      <div className="flex gap-2">
        <input
          type="tel"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); }}
          placeholder="+420 723 967 372"
          className="flex-1 px-4 py-2.5 rounded-xl outline-none text-sm"
          style={{ background: 'var(--surf3)', color: 'var(--white)', fontFamily: 'var(--font-dm-sans)', border: '1px solid var(--surf3)', caretColor: 'var(--coral)' }}
        />
        <button
          onClick={save}
          disabled={loading || !phone.trim()}
          className="text-xs px-4 py-2 rounded-full font-medium transition-opacity hover:opacity-90"
          style={{ background: 'var(--coral)', color: '#fff', fontFamily: 'var(--font-dm-sans)', opacity: loading || !phone.trim() ? 0.5 : 1 }}
        >
          {loading ? '…' : 'Link'}
        </button>
      </div>
      {error && <p className="text-xs" style={{ color: 'var(--coral)', fontFamily: 'var(--font-dm-sans)' }}>{error}</p>}
    </div>
  );
}
