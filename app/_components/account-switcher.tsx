'use client';

import { useRouter, useSearchParams } from 'next/navigation';

type Account = {
  id: string;
  account_name: string;
  is_active: boolean;
};

// Tabs above /account brand profile section. Lets multi-account users
// pick which IG's brand to view/edit. Active account gets a mint dot.
// Selecting one updates ?ig=<id> in the URL — the page reads it server-side.
export function AccountSwitcher({
  accounts,
  selectedId,
}: {
  accounts: Account[];
  selectedId: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  if (accounts.length < 2) return null;

  function pick(id: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('ig', id);
    router.push(`/account?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {accounts.map(acc => {
        const selected = acc.id === selectedId;
        return (
          <button
            key={acc.id}
            type="button"
            onClick={() => pick(acc.id)}
            className="text-xs px-3 py-1.5 rounded-full font-medium transition-opacity hover:opacity-90 inline-flex items-center gap-1.5"
            style={{
              background: selected ? 'var(--surf3)' : 'transparent',
              color: selected ? 'var(--white)' : 'var(--muted)',
              border: selected ? '1px solid var(--mint)' : '1px solid var(--surf3)',
              fontFamily: 'var(--font-dm-sans)',
            }}
          >
            {acc.is_active && (
              <span aria-label="active" style={{ color: 'var(--mint)' }}>●</span>
            )}
            @{acc.account_name}
          </button>
        );
      })}
    </div>
  );
}
