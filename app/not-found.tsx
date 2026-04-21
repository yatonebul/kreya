import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 gap-6" style={{ background: 'var(--dark)' }}>
      <span className="text-xs tracking-widest uppercase px-3 py-1 rounded-full" style={{ fontFamily: 'var(--font-space-mono)', background: 'var(--surf3)', color: 'var(--muted2)' }}>404</span>
      <h1 className="text-4xl font-bold text-center" style={{ fontFamily: 'var(--font-syne)' }}>Page not found</h1>
      <p className="text-sm text-center max-w-xs" style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}>
        This page doesn't exist or was moved.
      </p>
      <div className="flex items-center gap-3">
        <Link href="/" className="text-sm px-5 py-2.5 rounded-full font-medium transition-opacity hover:opacity-90" style={{ background: 'var(--coral)', color: '#fff', fontFamily: 'var(--font-dm-sans)' }}>
          Go home
        </Link>
        <Link href="/login" className="text-sm px-5 py-2.5 rounded-full font-medium transition-opacity hover:opacity-80" style={{ background: 'var(--surf2)', color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)', border: '1px solid var(--surf3)' }}>
          Sign in
        </Link>
      </div>
    </main>
  );
}
