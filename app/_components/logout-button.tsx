'use client';

import { useRouter } from 'next/navigation';

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.refresh();
  }

  if (compact) {
    return (
      <button onClick={logout}
        className="flex flex-col items-center gap-1 transition-opacity hover:opacity-80"
        style={{ color: 'var(--muted2)', fontFamily: 'var(--font-space-mono)', background: 'none', border: 'none' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        <span className="text-xs">Sign out</span>
      </button>
    );
  }

  return (
    <button
      onClick={logout}
      className="text-xs px-3 py-1.5 rounded-full transition-opacity hover:opacity-80"
      style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)', border: '1px solid var(--surf3)' }}
    >
      Sign out
    </button>
  );
}
