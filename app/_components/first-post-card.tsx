import { buildWaLink } from './mobile-bottom-nav';

const STARTER_PROMPTS: { emoji: string; label: string; prompt: string }[] = [
  { emoji: '☕', label: 'Coffee shop morning', prompt: 'Coffee shop morning' },
  { emoji: '🚀', label: 'Launching tomorrow',  prompt: 'Launching tomorrow' },
  { emoji: '💡', label: 'New idea brewing',    prompt: 'New idea brewing' },
];

export function FirstPostCard() {
  const ctaLink = buildWaLink('Hi Kreya!');

  return (
    <div
      className="relative rounded-3xl p-6 md:p-8 flex flex-col items-center text-center gap-5 overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%)',
        border: '1px solid var(--surf3)',
      }}
    >
      {/* Soft brand glow */}
      <div
        aria-hidden
        className="absolute -top-24 -right-24 w-64 h-64 rounded-full pointer-events-none blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(255,79,59,.18), transparent 60%)' }}
      />
      <div
        aria-hidden
        className="absolute -bottom-24 -left-24 w-64 h-64 rounded-full pointer-events-none blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(94,53,255,.16), transparent 60%)' }}
      />

      {/* Icon orb */}
      <div
        className="relative w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
        style={{
          background: 'linear-gradient(135deg, var(--coral) 0%, var(--violet) 100%)',
          boxShadow: '0 14px 36px -10px rgba(255,79,59,.45)',
        }}
      >
        <span aria-hidden>🎙️</span>
      </div>

      {/* Heading */}
      <div className="relative flex flex-col gap-2">
        <h3 className="text-xl md:text-2xl font-bold" style={{ fontFamily: 'var(--font-syne)' }}>
          Your first post is one message away.
        </h3>
        <p
          className="text-sm max-w-sm mx-auto leading-relaxed"
          style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}
        >
          Voice-note, snap a photo, or type one line on WhatsApp — Kreya writes the caption and prepares the post.
        </p>
      </div>

      {/* Primary CTA */}
      {ctaLink && (
        <a
          href={ctaLink}
          target="_blank"
          rel="noopener noreferrer"
          className="relative inline-flex items-center justify-center gap-2 text-base font-semibold px-6 py-3 rounded-full transition-opacity hover:opacity-90"
          style={{
            background: '#25D366',
            color: '#fff',
            fontFamily: 'var(--font-dm-sans)',
            boxShadow: '0 14px 36px -10px rgba(37,211,102,.55)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
          Open WhatsApp
        </a>
      )}

      {/* Divider */}
      <div className="relative flex items-center gap-3 w-full max-w-xs">
        <div className="flex-1 h-px" style={{ background: 'var(--surf3)' }} />
        <span
          className="text-[10px] tracking-widest uppercase"
          style={{ color: 'var(--muted2)', fontFamily: 'var(--font-space-mono)' }}
        >
          or try one of these
        </span>
        <div className="flex-1 h-px" style={{ background: 'var(--surf3)' }} />
      </div>

      {/* Starter chips — each opens WhatsApp with the prompt pre-filled */}
      <div className="relative flex flex-wrap items-center justify-center gap-2">
        {STARTER_PROMPTS.map(chip => {
          const link = buildWaLink(chip.prompt);
          if (!link) {
            return (
              <span
                key={chip.label}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-full"
                style={{
                  background: 'var(--surf3)',
                  color: 'var(--muted)',
                  border: '1px solid var(--surf3)',
                  fontFamily: 'var(--font-dm-sans)',
                }}
              >
                <span aria-hidden>{chip.emoji}</span>
                {chip.label}
              </span>
            );
          }
          return (
            <a
              key={chip.label}
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-full transition-all hover:opacity-90 hover:-translate-y-0.5"
              style={{
                background: 'var(--surf3)',
                color: 'var(--white)',
                border: '1px solid rgba(255,255,255,.06)',
                fontFamily: 'var(--font-dm-sans)',
              }}
            >
              <span aria-hidden>{chip.emoji}</span>
              {chip.label}
            </a>
          );
        })}
      </div>
    </div>
  );
}
