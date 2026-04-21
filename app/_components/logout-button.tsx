'use client';

import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const router = useRouter();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.refresh();
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
