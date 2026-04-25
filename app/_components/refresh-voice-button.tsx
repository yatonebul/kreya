'use client';

import { useState } from 'react';

type Status = { kind: 'idle' | 'loading' | 'ok' | 'err'; msg?: string };

export function RefreshVoiceButton({ phone }: { phone: string }) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function refresh() {
    setStatus({ kind: 'loading' });
    try {
      const res = await fetch('/api/style/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus({ kind: 'ok', msg: `Voice updated — read ${data.captionsFound} past captions from @${data.account}.` });
      } else if (data.error === 'no_instagram') {
        setStatus({ kind: 'err', msg: 'Connect Instagram first to refresh your voice.' });
      } else if (data.error === 'too_few_captions') {
        setStatus({ kind: 'err', msg: `Need at least 3 captions — @${data.account} has ${data.captionsFound}.` });
      } else {
        setStatus({ kind: 'err', msg: 'Could not refresh voice — try again in a moment.' });
      }
    } catch {
      setStatus({ kind: 'err', msg: 'Network error — try again.' });
    }
  }

  const loading = status.kind === 'loading';

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={refresh}
        disabled={loading}
        className="self-start inline-flex items-center gap-2 text-xs px-3 py-2 rounded-full font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
        style={{
          background: 'rgba(0,229,160,0.08)',
          color: 'var(--mint)',
          border: '1px solid var(--mint)',
          fontFamily: 'var(--font-dm-sans)',
        }}
      >
        <span aria-hidden>🧠</span>
        {loading ? 'Reading captions…' : 'Refresh my voice'}
      </button>
      {status.msg && (
        <span
          className="text-xs"
          style={{
            color: status.kind === 'ok' ? 'var(--mint)' : 'var(--coral)',
            fontFamily: 'var(--font-dm-sans)',
          }}
        >
          {status.msg}
        </span>
      )}
    </div>
  );
}
