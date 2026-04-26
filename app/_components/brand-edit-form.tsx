'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Profile = { brand_name: string; niche: string; tone: string };

const FIELD_LABELS: Record<keyof Profile, string> = {
  brand_name: 'Brand name',
  niche:      'Niche',
  tone:       'Posting style',
};

export function BrandEditForm({
  phone,
  initial,
  accountId,
}: {
  phone: string;
  initial: Profile;
  accountId?: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Profile>(initial);
  const [editing, setEditing] = useState<keyof Profile | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<keyof Profile | null>(null);

  function startEdit(field: keyof Profile) {
    setEditing(field);
    setDraft(values[field]);
  }

  async function save(field: keyof Profile) {
    if (draft.trim() === values[field]) { setEditing(null); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          [field]: draft.trim(),
          ...(accountId ? { account_id: accountId } : {}),
        }),
      });
      if (res.ok) {
        setValues(v => ({ ...v, [field]: draft.trim() }));
        setSaved(field);
        setTimeout(() => setSaved(null), 2000);
        if (field === 'brand_name') router.refresh();
      }
    } finally {
      setSaving(false);
      setEditing(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {(Object.keys(FIELD_LABELS) as (keyof Profile)[]).map(field => (
        <div key={field} className="flex items-center justify-between rounded-xl px-4 py-3 gap-3" style={{ background: 'var(--surf3)' }}>
          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            <span className="text-xs" style={{ fontFamily: 'var(--font-space-mono)', color: 'var(--muted2)' }}>
              {FIELD_LABELS[field]}
            </span>
            {editing === field ? (
              <input
                autoFocus
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') save(field); if (e.key === 'Escape') setEditing(null); }}
                className="text-sm bg-transparent outline-none border-b w-full"
                style={{ fontFamily: 'var(--font-dm-sans)', borderColor: 'var(--coral)', color: 'var(--white)' }}
              />
            ) : (
              <span className="text-sm truncate" style={{ fontFamily: 'var(--font-dm-sans)', color: values[field] ? 'var(--white)' : 'var(--muted)' }}>
                {values[field] || '—'}
              </span>
            )}
          </div>
          <div className="flex-shrink-0">
            {editing === field ? (
              <button
                onClick={() => save(field)}
                disabled={saving}
                className="text-xs px-3 py-1 rounded-full font-medium"
                style={{ background: 'var(--coral)', color: '#fff', fontFamily: 'var(--font-dm-sans)', opacity: saving ? 0.6 : 1 }}
              >
                {saving ? '…' : 'Save'}
              </button>
            ) : (
              <button
                onClick={() => startEdit(field)}
                className="text-xs px-3 py-1 rounded-full font-medium transition-opacity hover:opacity-80"
                style={{ background: 'var(--surf)', color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)', border: '1px solid var(--surf3)' }}
              >
                {saved === field ? '✓' : 'Edit'}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
