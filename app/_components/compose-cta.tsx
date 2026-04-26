import { buildWaLink } from './mobile-bottom-nav';

// Sticky CTA on /account that reinforces "WhatsApp is the compose surface,
// the dashboard is just an inspector". Pre-fills a starter prompt so the
// user lands in chat already mid-compose, not staring at an empty thread.
//
// Layout: floats above the mobile bottom-nav (bottom-24) so it doesn't
// overlap; on desktop it sits bottom-right where the FAB used to live.
export function ComposeCta({
  prompt = 'Hi Kreya! Make me a post about ',
}: {
  prompt?: string;
}) {
  const link = buildWaLink(prompt);
  if (!link) return null;

  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Compose your next post in WhatsApp"
      className="fixed z-40 inline-flex items-center gap-2 px-5 py-3 rounded-full font-semibold text-sm transition-transform hover:scale-[1.03]
                 bottom-24 left-1/2 -translate-x-1/2 md:bottom-6 md:right-6 md:left-auto md:translate-x-0"
      style={{
        background: '#25D366',
        color: '#fff',
        fontFamily: 'var(--font-dm-sans)',
        boxShadow: '0 12px 32px -8px rgba(37,211,102,.5), 0 0 0 1px rgba(255,255,255,.08) inset',
      }}
    >
      <span aria-hidden style={{ fontSize: 16 }}>✍️</span>
      Compose in WhatsApp
    </a>
  );
}
