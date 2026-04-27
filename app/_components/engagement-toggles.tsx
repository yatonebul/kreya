'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  phone: string;
  accountId: string;
  accountName: string;
  dmEnabled: boolean;
  commentEnabled: boolean;
}

// Two toggles per IG account: comment auto-reply + DM auto-reply.
// Default OFF on the server; flipping here writes via /api/profile
// which reuses the per-account ownership check.
export function EngagementToggles({ phone, accountId, accountName, dmEnabled, commentEnabled }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<'dm' | 'comment' | null>(null);
  const [dm, setDm] = useState(dmEnabled);
  const [cm, setCm] = useState(commentEnabled);

  async function flip(field: 'dm' | 'comment', next: boolean) {
    setBusy(field);
    try {
      const res = await fetch('/api/profile/engagement', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          account_id: accountId,
          ...(field === 'dm' ? { dm_autoreply_enabled: next } : { comment_autoreply_enabled: next }),
        }),
      });
      if (res.ok) {
        if (field === 'dm') setDm(next);
        else setCm(next);
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl p-6 flex flex-col gap-4" style={{ background: 'var(--surf2)' }}>
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-base font-semibold" style={{ fontFamily: 'var(--font-syne)' }}>
          Auto-reply engagement
        </h2>
        <span
          className="text-[10px] tracking-widest uppercase px-2 py-0.5 rounded-full"
          style={{ fontFamily: 'var(--font-space-mono)', color: 'var(--muted2)', border: '1px solid var(--surf3)' }}
        >
          @{accountName} · approval still required
        </span>
      </div>

      <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}>
        When ON, every comment / DM on this account gets an AI-drafted reply in your brand voice, sent to your WhatsApp for one-tap approval. <span style={{ color: 'var(--muted2)' }}>Nothing posts without you tapping Send.</span>
      </p>

      <Toggle
        label="Comment replies"
        sublabel="Strangers comment on your post → draft reply lands in your WA"
        on={cm}
        busy={busy === 'comment'}
        onChange={(next) => flip('comment', next)}
      />
      <Toggle
        label="DM replies"
        sublabel="Strangers DM your account → draft reply lands in your WA"
        on={dm}
        busy={busy === 'dm'}
        onChange={(next) => flip('dm', next)}
      />
    </section>
  );
}

function Toggle({
  label,
  sublabel,
  on,
  busy,
  onChange,
}: {
  label: string;
  sublabel: string;
  on: boolean;
  busy: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl px-4 py-3" style={{ background: 'var(--surf3)' }}>
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="text-sm font-medium" style={{ fontFamily: 'var(--font-dm-sans)' }}>{label}</span>
        <span className="text-xs" style={{ fontFamily: 'var(--font-dm-sans)', color: 'var(--muted2)' }}>{sublabel}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={busy}
        onClick={() => onChange(!on)}
        className="flex-shrink-0 w-11 h-6 rounded-full relative transition-colors disabled:opacity-50"
        style={{
          background: on ? 'var(--mint)' : 'var(--surf)',
          border: `1px solid ${on ? 'var(--mint)' : 'var(--surf3)'}`,
        }}
      >
        <span
          aria-hidden
          className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
          style={{
            left: on ? 'calc(100% - 20px)' : '2px',
            background: on ? 'var(--ink)' : 'var(--muted2)',
          }}
        />
      </button>
    </div>
  );
}
