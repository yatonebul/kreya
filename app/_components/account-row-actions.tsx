'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  phone: string;
  accountName: string;
  instagramUserId: string;
  isActive: boolean;
  reconnectHref: string;
}

export function AccountRowActions({ phone, accountName, instagramUserId, isActive, reconnectHref }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<'select' | 'disconnect' | null>(null);

  async function setActive() {
    setBusy('select');
    try {
      const res = await fetch('/api/auth/instagram/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, instagram_user_id: instagramUserId }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    if (!confirm(`Disconnect @${accountName}? You can reconnect anytime — posts already published stay on Instagram.`)) return;
    setBusy('disconnect');
    try {
      const res = await fetch('/api/auth/instagram/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, instagram_user_id: instagramUserId }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {isActive ? (
        <span
          className="text-[10px] tracking-widest uppercase px-2 py-1 rounded-full"
          style={{
            fontFamily: 'var(--font-space-mono)',
            color: 'var(--mint)',
            background: 'rgba(0,229,160,0.10)',
            border: '1px solid var(--mint)',
          }}
        >
          ● Active
        </span>
      ) : (
        <button
          type="button"
          onClick={setActive}
          disabled={busy !== null}
          className="text-xs px-3 py-1.5 rounded-full font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
          style={{
            background: 'rgba(0,229,160,0.10)',
            color: 'var(--mint)',
            border: '1px solid var(--mint)',
            fontFamily: 'var(--font-dm-sans)',
          }}
        >
          {busy === 'select' ? 'Switching…' : 'Set active'}
        </button>
      )}

      <a
        href={reconnectHref}
        className="text-xs px-3 py-1.5 rounded-full font-medium transition-opacity hover:opacity-80"
        style={{
          background: 'var(--surf)',
          color: 'var(--muted)',
          fontFamily: 'var(--font-dm-sans)',
          border: '1px solid var(--surf3)',
        }}
      >
        Reconnect
      </a>

      <button
        type="button"
        onClick={disconnect}
        disabled={busy !== null}
        title="Disconnect this account"
        className="text-xs px-2 py-1.5 rounded-full font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
        style={{
          background: 'transparent',
          color: 'var(--muted2)',
          fontFamily: 'var(--font-dm-sans)',
          border: '1px solid var(--surf3)',
        }}
      >
        {busy === 'disconnect' ? '…' : '✕'}
      </button>
    </div>
  );
}
