interface Props {
  days: number | null;
  connectUrl: string;
  accountName: string | null;
}

export function TokenRenewalBanner({ days, connectUrl, accountName }: Props) {
  if (days === null || days > 14) return null;

  const urgent = days <= 7;
  const color = urgent ? 'var(--coral)' : 'var(--gold)';
  const bg = urgent ? 'rgba(255,79,59,0.10)' : 'rgba(255,209,102,0.10)';
  const dayLabel = days <= 0 ? 'today' : `${days} day${days === 1 ? '' : 's'}`;

  return (
    <div
      className="px-6 lg:px-12 py-3 flex items-center justify-between gap-3 flex-wrap"
      style={{ background: bg, borderBottom: `1px solid ${color}` }}
    >
      <div
        className="flex items-center gap-2 text-sm"
        style={{ color, fontFamily: 'var(--font-dm-sans)' }}
      >
        <span aria-hidden>{urgent ? '⚠️' : '🔔'}</span>
        <span>
          {urgent ? 'Reconnect soon' : 'Heads up'} — your Instagram
          {accountName ? (
            <>
              {' '}
              <strong>@{accountName}</strong>
            </>
          ) : (
            ' link'
          )}{' '}
          expires in <strong>{dayLabel}</strong>.
        </span>
      </div>
      <a
        href={connectUrl}
        className="text-xs px-3 py-1.5 rounded-full font-semibold transition-opacity hover:opacity-90"
        style={{ background: color, color: 'var(--ink)', fontFamily: 'var(--font-dm-sans)' }}
      >
        Reconnect →
      </a>
    </div>
  );
}
