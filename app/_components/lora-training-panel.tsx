'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type LoraStatus = 'training' | 'ready' | 'failed' | null;

interface Props {
  phone: string;
  accountId?: string;
  accountName: string;
  status: LoraStatus;
  trainedAt: string | null;
}

// Surfaces brand LoRA state per IG account. Idle → "Train" button.
// Training → progress badge ("~20 min, no action needed"). Ready →
// mint badge with the training date. Failed → coral badge + retry.
export function LoraTrainingPanel({ phone, accountId, accountName, status, trainedAt }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'info' | 'err'; text: string } | null>(null);

  async function startTraining() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/style/train-lora', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, ...(accountId ? { account_id: accountId } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg({ kind: 'info', text: `Training kicked off. Replicate takes ~20 min — I'll WhatsApp you when @${accountName} is ready.` });
        router.refresh();
      } else if (data?.error === 'no_instagram') {
        setMsg({ kind: 'err', text: 'Connect Instagram first.' });
      } else if (data?.error === 'already_training') {
        setMsg({ kind: 'err', text: 'Already training — check back in ~20 min.' });
      } else if (data?.error === 'already_ready') {
        setMsg({ kind: 'err', text: 'Brand image style already trained for this account.' });
      } else {
        setMsg({ kind: 'err', text: data?.message ?? 'Training failed to start.' });
      }
    } finally {
      setBusy(false);
    }
  }

  const isTraining = status === 'training';
  const isReady    = status === 'ready';
  const isFailed   = status === 'failed';

  return (
    <section className="rounded-2xl p-6 flex flex-col gap-4" style={{ background: 'var(--surf2)' }}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-base font-semibold" style={{ fontFamily: 'var(--font-syne)' }}>
            Brand image style
          </h2>
          <span
            className="text-[10px] tracking-widest uppercase px-2 py-0.5 rounded-full"
            style={{
              fontFamily: 'var(--font-space-mono)',
              color: isReady ? 'var(--mint)' : isTraining ? 'var(--gold)' : isFailed ? 'var(--coral)' : 'var(--muted2)',
              background: isReady
                ? 'rgba(0,229,160,0.10)'
                : isTraining
                  ? 'rgba(255,209,102,0.10)'
                  : isFailed
                    ? 'rgba(255,79,59,0.10)'
                    : 'transparent',
              border: `1px solid ${
                isReady ? 'var(--mint)' : isTraining ? 'var(--gold)' : isFailed ? 'var(--coral)' : 'var(--surf3)'
              }`,
            }}
          >
            {isReady ? '● Ready' : isTraining ? '◐ Training' : isFailed ? '✗ Failed' : 'Not trained'}
          </span>
        </div>
      </div>

      <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}>
        Train a per-account image style on your last 25 Instagram photos. Once trained, every AI image we generate for{' '}
        <span style={{ color: 'var(--mint)' }}>@{accountName}</span> matches your feed&apos;s aesthetic — same lighting, framing, vibe.
        <br />
        <span style={{ color: 'var(--muted2)' }}>~20 min, ~$5 per account, one-time.</span>
      </p>

      {isReady && trainedAt && (
        <p className="text-xs" style={{ color: 'var(--muted2)', fontFamily: 'var(--font-space-mono)' }}>
          Trained {new Date(trainedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      )}

      {!isReady && !isTraining && (
        <button
          type="button"
          onClick={startTraining}
          disabled={busy}
          className="self-start inline-flex items-center gap-2 text-xs px-3 py-2 rounded-full font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{
            background: 'rgba(94,53,255,0.10)',
            color: 'var(--violet)',
            border: '1px solid var(--violet)',
            fontFamily: 'var(--font-dm-sans)',
          }}
        >
          <span aria-hidden>🎨</span>
          {busy ? 'Starting training…' : isFailed ? 'Retry training' : `Train @${accountName} style`}
        </button>
      )}

      {msg && (
        <p
          className="text-xs"
          style={{
            color: msg.kind === 'info' ? 'var(--mint)' : 'var(--coral)',
            fontFamily: 'var(--font-dm-sans)',
          }}
        >
          {msg.text}
        </p>
      )}
    </section>
  );
}
