'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const STEPS = [
  {
    field:       'brand_name' as const,
    label:       'Brand name',
    question:    "What's your brand called?",
    placeholder: 'e.g. Kreya Studio',
    hint:        "This is how you'll appear on Instagram.",
  },
  {
    field:       'niche' as const,
    label:       'Niche',
    question:    'What do you post about?',
    placeholder: 'e.g. sustainable fashion, fitness coaching, tech reviews',
    hint:        'Kreya uses this to write captions that fit your audience.',
  },
  {
    field:       'tone' as const,
    label:       'Posting style',
    question:    'How does your brand sound?',
    placeholder: 'e.g. playful and casual, professional, motivational',
    hint:        'This shapes the voice of every caption Kreya writes for you.',
  },
];

export function OnboardingWizard({ phone }: { phone: string }) {
  const router  = useRouter();
  const [step,   setStep]   = useState(0);
  const [value,  setValue]  = useState('');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const current = STEPS[step];
  const isLast  = step === STEPS.length - 1;
  const progress = ((step) / STEPS.length) * 100;

  async function next() {
    if (!value.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/profile', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ phone, [current.field]: value.trim() }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error); return; }
      if (isLast) {
        router.refresh();
      } else {
        setStep(s => s + 1);
        setValue('');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: 'var(--dark)' }}>
      <div className="w-full max-w-sm flex flex-col gap-8">

        {/* Header */}
        <div className="flex flex-col gap-2">
          <span className="text-2xl font-bold" style={{ fontFamily: 'var(--font-syne)', color: 'var(--coral)' }}>Kreya</span>
          <p className="text-sm" style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}>
            Let's set up your brand — takes 30 seconds.
          </p>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1 rounded-full" style={{ background: 'var(--surf3)' }}>
          <div
            className="h-1 rounded-full transition-all duration-500"
            style={{ width: `${progress}%`, background: 'var(--coral)' }}
          />
        </div>

        {/* Step */}
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <span className="text-xs" style={{ fontFamily: 'var(--font-space-mono)', color: 'var(--muted2)' }}>
              {step + 1} / {STEPS.length} — {current.label}
            </span>
            <h2 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-syne)' }}>
              {current.question}
            </h2>
            <p className="text-sm" style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}>
              {current.hint}
            </p>
          </div>

          <textarea
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); next(); } }}
            placeholder={current.placeholder}
            rows={2}
            autoFocus
            className="w-full px-4 py-3 rounded-xl outline-none text-sm resize-none"
            style={{ background: 'var(--surf2)', color: 'var(--white)', fontFamily: 'var(--font-dm-sans)', border: '1px solid var(--surf3)', caretColor: 'var(--coral)' }}
          />

          {error && (
            <p className="text-sm" style={{ color: 'var(--coral)', fontFamily: 'var(--font-dm-sans)' }}>{error}</p>
          )}

          <button
            onClick={next}
            disabled={!value.trim() || saving}
            className="w-full py-3 rounded-full font-semibold text-sm transition-opacity hover:opacity-90"
            style={{ background: 'var(--coral)', color: '#fff', fontFamily: 'var(--font-dm-sans)', opacity: !value.trim() || saving ? 0.4 : 1 }}
          >
            {saving ? 'Saving…' : isLast ? 'Finish setup' : 'Continue →'}
          </button>
        </div>

      </div>
    </main>
  );
}
