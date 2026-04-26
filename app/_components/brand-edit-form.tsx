'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Profile = { brand_name: string; niche: string; tone: string };

const FIELD_LABELS: Record<keyof Profile, string> = {
  brand_name: 'Brand name',
  niche:      'Niche',
  tone:       'Posting style',
};

// Comma-separated tone/niche values render as chips so a list like
// "casual, witty, edgy" reads visually as tags instead of running prose.
// Brand name is always single-value so it stays plain text.
function renderValue(field: keyof Profile, value: string) {
  if (!value) {
    return (
      <span className="text-sm" style={{ fontFamily: 'var(--font-dm-sans)', color: 'var(--muted)' }}>
        Tap to add
      </span>
    );
  }
  if (field === 'brand_name' || !value.includes(',')) {
    return (
      <span className="text-sm break-words" style={{ fontFamily: 'var(--font-dm-sans)', color: 'var(--white)' }}>
        {value}
      </span>
    );
  }
  const tags = value.split(',').map(t => t.trim()).filter(Boolean);
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map(tag => (
        <span
          key={tag}
          className="text-xs px-2 py-0.5 rounded-full"
          style={{
            fontFamily: 'var(--font-dm-sans)',
            background: 'rgba(0,229,160,0.10)',
            color: 'var(--mint)',
            border: '1px solid rgba(0,229,160,0.35)',
          }}
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

// Tap-to-edit: clicking the row enters edit mode, blur or Enter auto-saves,
// Escape cancels. No explicit Save button — saves on blur. Long values
// wrap naturally instead of getting truncated.
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
  const [saving, setSaving] = useState<keyof Profile | null>(null);
  const [saved, setSaved] = useState<keyof Profile | null>(null);

  function startEdit(field: keyof Profile) {
    setEditing(field);
    setDraft(values[field]);
  }

  async function commit(field: keyof Profile) {
    const next = draft.trim();
    setEditing(null);
    if (next === values[field]) return;

    setSaving(field);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          [field]: next,
          ...(accountId ? { account_id: accountId } : {}),
        }),
      });
      if (res.ok) {
        setValues(v => ({ ...v, [field]: next }));
        setSaved(field);
        setTimeout(() => setSaved(null), 1500);
        if (field === 'brand_name') router.refresh();
      }
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {(Object.keys(FIELD_LABELS) as (keyof Profile)[]).map(field => {
        const isEditing = editing === field;
        const isSaving = saving === field;
        return (
          <div
            key={field}
            onClick={() => !isEditing && startEdit(field)}
            className={`rounded-xl px-4 py-3 flex flex-col gap-1 ${isEditing ? '' : 'cursor-text hover:opacity-90'}`}
            style={{ background: 'var(--surf3)' }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs" style={{ fontFamily: 'var(--font-space-mono)', color: 'var(--muted2)' }}>
                {FIELD_LABELS[field]}
              </span>
              <span
                className="text-[10px] tracking-widest uppercase"
                style={{
                  fontFamily: 'var(--font-space-mono)',
                  color: isSaving ? 'var(--muted2)' : saved === field ? 'var(--mint)' : 'transparent',
                  transition: 'color 200ms',
                }}
              >
                {isSaving ? 'Saving…' : saved === field ? '✓ Saved' : '·'}
              </span>
            </div>
            {isEditing ? (
              <input
                autoFocus
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onBlur={() => commit(field)}
                onKeyDown={e => {
                  if (e.key === 'Enter')  { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
                  if (e.key === 'Escape') { setEditing(null); }
                }}
                className="text-sm bg-transparent outline-none border-b w-full"
                style={{ fontFamily: 'var(--font-dm-sans)', borderColor: 'var(--coral)', color: 'var(--white)' }}
              />
            ) : (
              renderValue(field, values[field])
            )}
          </div>
        );
      })}
    </div>
  );
}
