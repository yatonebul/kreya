'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function AdminActions({ id, adminSecret }: { id: string; adminSecret: string }) {
  const router   = useRouter();
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);

  async function act(action: 'approve' | 'reject') {
    setBusy(action);
    await fetch(`/api/admin/${action}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-secret': adminSecret },
      body:    JSON.stringify({ id }),
    });
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => act('approve')}
        disabled={busy !== null}
        className="text-xs px-3 py-1.5 rounded-full font-medium transition-opacity hover:opacity-80"
        style={{ background: 'rgba(0,229,160,0.15)', color: 'var(--mint)', fontFamily: 'var(--font-dm-sans)', opacity: busy ? 0.5 : 1 }}
      >
        {busy === 'approve' ? '…' : 'Approve'}
      </button>
      <button
        onClick={() => act('reject')}
        disabled={busy !== null}
        className="text-xs px-3 py-1.5 rounded-full font-medium transition-opacity hover:opacity-80"
        style={{ background: 'var(--surf3)', color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)', opacity: busy ? 0.5 : 1 }}
      >
        {busy === 'reject' ? '…' : 'Reject'}
      </button>
    </div>
  );
}
