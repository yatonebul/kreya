'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function CancelScheduledButton({ postId }: { postId: string }) {
  const router = useRouter();
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState('');

  async function cancel() {
    setBusy(true);
    setError('');
    const res  = await fetch(`/api/posts/${postId}/cancel-schedule`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? 'Failed'); setBusy(false); return; }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={cancel}
        disabled={busy}
        className="text-xs px-2.5 py-1 rounded-lg transition-opacity hover:opacity-80"
        style={{ background: 'var(--surf)', color: 'var(--muted2)', fontFamily: 'var(--font-space-mono)', opacity: busy ? 0.5 : 1 }}
      >
        {busy ? '…' : 'Cancel'}
      </button>
      {error && <span className="text-xs" style={{ color: 'var(--coral)', fontFamily: 'var(--font-dm-sans)' }}>{error}</span>}
    </div>
  );
}
