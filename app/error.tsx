'use client';

import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 gap-6" style={{ background: 'var(--dark)' }}>
      <span className="text-xs tracking-widest uppercase px-3 py-1 rounded-full" style={{ fontFamily: 'var(--font-space-mono)', background: 'rgba(255,79,59,0.12)', color: 'var(--coral)', border: '1px solid var(--coral)' }}>Error</span>
      <h1 className="text-3xl font-bold text-center" style={{ fontFamily: 'var(--font-syne)' }}>Something went wrong</h1>
      <p className="text-sm text-center max-w-xs" style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}>
        {error.message ?? 'An unexpected error occurred.'}
      </p>
      <button
        onClick={reset}
        className="text-sm px-5 py-2.5 rounded-full font-medium transition-opacity hover:opacity-90"
        style={{ background: 'var(--coral)', color: '#fff', fontFamily: 'var(--font-dm-sans)' }}
      >
        Try again
      </button>
    </main>
  );
}
