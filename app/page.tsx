export default function Home() {
  return (
    <main
      className="flex flex-col min-h-screen"
      style={{ background: "var(--dark)" }}
    >
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-5 md:px-12">
        <span
          className="text-xl font-bold tracking-tight"
          style={{ fontFamily: "var(--font-syne)", color: "var(--coral)" }}
        >
          Kreya
        </span>
        <a
          href="#waitlist"
          className="text-sm px-5 py-2 rounded-full font-medium transition-opacity hover:opacity-80"
          style={{
            fontFamily: "var(--font-dm-sans)",
            background: "var(--coral)",
            color: "var(--white)",
          }}
        >
          Join waitlist
        </a>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center flex-1 text-center px-6 pt-16 pb-24 gap-8">
        <span
          className="text-xs tracking-widest uppercase px-3 py-1 rounded-full"
          style={{
            fontFamily: "var(--font-space-mono)",
            background: "var(--surf3)",
            color: "var(--mint)",
          }}
        >
          AI-powered social media
        </span>

        <h1
          className="text-5xl md:text-7xl font-extrabold leading-tight max-w-3xl"
          style={{ fontFamily: "var(--font-syne)" }}
        >
          Tell Kreya what you need.{" "}
          <span style={{ color: "var(--coral)" }}>Consider it done.</span>
        </h1>

        <p
          className="text-lg md:text-xl max-w-xl leading-relaxed"
          style={{ color: "var(--muted)", fontFamily: "var(--font-dm-sans)" }}
        >
          Send a WhatsApp voice note or text. Kreya writes the caption, picks
          the image, and publishes across Instagram, TikTok, Twitter, LinkedIn,
          and more — automatically.
        </p>

        {/* Platform badges */}
        <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
          {[
            "Instagram",
            "TikTok",
            "Twitter",
            "LinkedIn",
            "Facebook",
            "YouTube",
          ].map((p) => (
            <span
              key={p}
              className="text-xs px-3 py-1 rounded-full"
              style={{
                fontFamily: "var(--font-space-mono)",
                background: "var(--surf2)",
                color: "var(--muted)",
                border: "1px solid var(--surf3)",
              }}
            >
              {p}
            </span>
          ))}
        </div>

        <a
          id="waitlist"
          href="mailto:hello@getkreya.com"
          className="mt-4 inline-flex items-center gap-2 text-base font-semibold px-8 py-4 rounded-full transition-opacity hover:opacity-90"
          style={{
            fontFamily: "var(--font-dm-sans)",
            background: "var(--coral)",
            color: "var(--white)",
          }}
        >
          Get early access
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden
          >
            <path
              d="M3 8h10M9 4l4 4-4 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </a>
      </section>

      {/* How it works */}
      <section
        className="px-6 md:px-12 py-20"
        style={{ background: "var(--surf)" }}
      >
        <p
          className="text-xs tracking-widest uppercase text-center mb-12"
          style={{
            fontFamily: "var(--font-space-mono)",
            color: "var(--muted2)",
          }}
        >
          How it works
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {[
            {
              step: "01",
              title: "Send a message",
              body: "Voice note or text on WhatsApp. Describe what you want to post — no apps to open.",
              color: "var(--coral)",
            },
            {
              step: "02",
              title: "Kreya creates",
              body: "Claude AI writes the perfect caption and selects visuals tailored to your brand.",
              color: "var(--violet)",
            },
            {
              step: "03",
              title: "Published everywhere",
              body: "One message → all your platforms. Scheduled, formatted, and posted for you.",
              color: "var(--mint)",
            },
          ].map(({ step, title, body, color }) => (
            <div
              key={step}
              className="rounded-2xl p-6 flex flex-col gap-4"
              style={{ background: "var(--surf2)" }}
            >
              <span
                className="text-3xl font-bold"
                style={{ fontFamily: "var(--font-syne)", color }}
              >
                {step}
              </span>
              <h3
                className="text-lg font-semibold"
                style={{ fontFamily: "var(--font-syne)" }}
              >
                {title}
              </h3>
              <p
                className="text-sm leading-relaxed"
                style={{
                  color: "var(--muted)",
                  fontFamily: "var(--font-dm-sans)",
                }}
              >
                {body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer
        className="px-6 md:px-12 py-8 flex items-center justify-between"
        style={{ background: "var(--ink)" }}
      >
        <span
          className="text-sm font-bold"
          style={{ fontFamily: "var(--font-syne)", color: "var(--coral)" }}
        >
          Kreya
        </span>
        <span
          className="text-xs"
          style={{
            fontFamily: "var(--font-space-mono)",
            color: "var(--muted2)",
          }}
        >
          © 2026 Kreya
        </span>
      </footer>
    </main>
  );
}
