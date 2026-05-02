'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Plan = 'free' | 'pro' | 'agency';

const PLANS: { value: Plan; label: string; color: string; bg: string; border: string }[] = [
  { value: 'free',   label: 'Free',   color: 'var(--muted)',  bg: 'var(--surf3)',              border: 'var(--surf3)'              },
  { value: 'pro',    label: 'Pro',    color: 'var(--violet)', bg: 'rgba(94,53,255,0.15)',      border: 'rgba(94,53,255,0.5)'       },
  { value: 'agency', label: 'Agency', color: 'var(--gold)',   bg: 'rgba(255,209,102,0.15)',    border: 'rgba(255,209,102,0.5)'     },
];

export function AdminPlanToggle({
  phone,
  currentPlan,
  adminSecret,
}: {
  phone: string;
  currentPlan: Plan;
  adminSecret: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<Plan | null>(null);
  const [active, setActive] = useState<Plan>(currentPlan);

  async function setPlan(plan: Plan) {
    if (plan === active || busy) return;
    setBusy(plan);
    try {
      const res = await fetch('/api/admin/set-plan', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': adminSecret },
        body:    JSON.stringify({ phone, plan }),
      });
      if (res.ok) {
        setActive(plan);
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      {PLANS.map(p => {
        const isCurrent = active === p.value;
        const isLoading = busy === p.value;
        return (
          <button
            key={p.value}
            onClick={() => setPlan(p.value)}
            disabled={busy !== null}
            className="text-xs px-2.5 py-1 rounded-full font-medium transition-all hover:opacity-90 disabled:cursor-wait"
            style={{
              fontFamily:  'var(--font-dm-sans)',
              color:       isCurrent ? p.color : 'var(--muted2)',
              background:  isCurrent ? p.bg    : 'transparent',
              border:      `1px solid ${isCurrent ? p.border : 'var(--surf3)'}`,
              opacity:     isLoading ? 0.6 : 1,
            }}
          >
            {isLoading ? '…' : p.label}
          </button>
        );
      })}
    </div>
  );
}
