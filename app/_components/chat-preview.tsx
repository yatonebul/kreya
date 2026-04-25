// Decorative phone-frame chat mock used in the landing hero.
// Pure SVG/CSS — no real data, no interactivity.
export function ChatPreview() {
  return (
    <div className="relative">
      {/* Soft glow behind the phone */}
      <div
        aria-hidden
        className="absolute -inset-10 -z-10 blur-3xl pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 25% 30%, rgba(255,79,59,.32), transparent 60%), ' +
            'radial-gradient(circle at 75% 70%, rgba(94,53,255,.30), transparent 60%)',
        }}
      />

      {/* Phone outer frame */}
      <div
        className="relative w-[300px] sm:w-[340px] mx-auto rounded-[2.5rem] p-2"
        style={{
          background: 'linear-gradient(180deg, var(--surf3) 0%, var(--ink) 100%)',
          boxShadow: '0 30px 60px -15px rgba(0,0,0,.6), inset 0 0 0 1px rgba(255,255,255,.05)',
        }}
      >
        {/* Inner screen */}
        <div
          className="rounded-[2rem] overflow-hidden flex flex-col"
          style={{ background: 'var(--ink)', height: 600 }}
        >
          {/* Notch */}
          <div className="flex justify-center pt-2 pb-1">
            <span className="block w-20 h-5 rounded-full" style={{ background: 'var(--surf3)' }} />
          </div>

          {/* Chat header */}
          <div
            className="flex items-center gap-3 px-4 py-3"
            style={{ background: 'var(--surf2)', borderBottom: '1px solid var(--surf3)' }}
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm"
              style={{ background: 'var(--coral)', color: '#fff', fontFamily: 'var(--font-syne)' }}
            >
              K
            </div>
            <div className="flex-1 flex flex-col">
              <span className="text-sm font-semibold" style={{ fontFamily: 'var(--font-dm-sans)', color: 'var(--white)' }}>
                Kreya
              </span>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--mint)' }} />
                <span className="text-[10px]" style={{ color: 'var(--muted2)', fontFamily: 'var(--font-space-mono)' }}>
                  online
                </span>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 flex flex-col gap-3 p-4 overflow-hidden">
            {/* 1 — outgoing voice note */}
            <div className="flex justify-end">
              <div
                className="rounded-2xl rounded-tr-md px-3 py-2.5 flex items-center gap-2"
                style={{ background: 'rgba(0,229,160,.16)', border: '1px solid rgba(0,229,160,.28)' }}
              >
                <span
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ background: 'var(--mint)' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--ink)" aria-hidden>
                    <path d="M12 14a3 3 0 003-3V6a3 3 0 00-6 0v5a3 3 0 003 3z" />
                    <path d="M19 11a1 1 0 10-2 0 5 5 0 01-10 0 1 1 0 10-2 0 7 7 0 006 6.92V21a1 1 0 102 0v-3.08A7 7 0 0019 11z" />
                  </svg>
                </span>
                <div className="flex items-center gap-[2px] h-5">
                  {[4,7,10,5,9,12,7,4,8,11,5,9,7,4,8,5,3,6].map((h, i) => (
                    <span
                      key={i}
                      className="w-[2px] rounded-full"
                      style={{ height: `${h * 1.6}px`, background: 'var(--mint)', opacity: 0.85 }}
                    />
                  ))}
                </div>
                <span className="text-[10px]" style={{ color: 'var(--mint)', fontFamily: 'var(--font-space-mono)' }}>
                  0:12
                </span>
              </div>
            </div>

            {/* 2 — incoming caption draft */}
            <div className="flex flex-col items-start gap-1">
              <span
                className="text-[9px] tracking-[0.18em] uppercase pl-1"
                style={{ color: 'var(--coral)', fontFamily: 'var(--font-space-mono)' }}
              >
                Kreya
              </span>
              <div
                className="rounded-2xl rounded-tl-md px-3 py-2.5 max-w-[88%]"
                style={{ background: 'var(--surf2)' }}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span aria-hidden>🎙️</span>
                  <span
                    className="text-[11px] font-bold"
                    style={{ color: 'var(--white)', fontFamily: 'var(--font-dm-sans)' }}
                  >
                    Your voice:
                  </span>
                </div>
                <p
                  className="text-[11px] leading-relaxed"
                  style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}
                >
                  Mornings start slow ☕ — the routine stays sacred. One breath at a time.
                  <br />
                  <span style={{ color: 'var(--violet)' }}>#MorningRitual #SlowLiving</span>
                </p>
              </div>
            </div>

            {/* 3 — incoming preview card with image + buttons */}
            <div className="flex flex-col items-start">
              <div
                className="rounded-2xl overflow-hidden max-w-[88%]"
                style={{ background: 'var(--surf2)' }}
              >
                <div
                  className="w-full h-24 relative"
                  style={{ background: 'linear-gradient(135deg, var(--coral) 0%, var(--violet) 100%)' }}
                >
                  <div
                    className="absolute inset-0 flex items-center justify-center"
                    style={{ background: 'rgba(7,7,13,.18)' }}
                  >
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="rgba(255,255,255,.85)" aria-hidden>
                      <path d="M9 2L7.17 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2h-3.17L15 2H9zm3 15a5 5 0 110-10 5 5 0 010 10zm0-2a3 3 0 100-6 3 3 0 000 6z" />
                    </svg>
                  </div>
                </div>
                <div className="px-2 py-2 flex items-center gap-1">
                  <span
                    className="text-[9px] px-2 py-1 rounded-full font-semibold"
                    style={{ background: 'var(--mint)', color: 'var(--ink)', fontFamily: 'var(--font-dm-sans)' }}
                  >
                    ✅ Approve
                  </span>
                  <span
                    className="text-[9px] px-2 py-1 rounded-full"
                    style={{ background: 'var(--surf3)', color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}
                  >
                    ✏️ Edit
                  </span>
                  <span
                    className="text-[9px] px-2 py-1 rounded-full"
                    style={{ background: 'var(--surf3)', color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}
                  >
                    🗑️ Discard
                  </span>
                </div>
              </div>
            </div>

            {/* 4 — incoming "live" celebration */}
            <div className="flex flex-col items-start gap-1">
              <div
                className="rounded-2xl rounded-tl-md px-3 py-2 max-w-[88%]"
                style={{
                  background: 'linear-gradient(135deg, rgba(0,229,160,.18), rgba(94,53,255,.14))',
                  border: '1px solid rgba(0,229,160,.32)',
                }}
              >
                <p
                  className="text-[11px] font-semibold flex items-center gap-1.5"
                  style={{ color: 'var(--mint)', fontFamily: 'var(--font-dm-sans)' }}
                >
                  <span aria-hidden>🎉</span> Your post is live!
                </p>
                <span
                  className="text-[10px]"
                  style={{ color: 'var(--coral)', fontFamily: 'var(--font-space-mono)' }}
                >
                  instagram.com/p/CXyZ…
                </span>
              </div>
              <span
                className="text-[9px] pl-2"
                style={{ color: 'var(--muted2)', fontFamily: 'var(--font-space-mono)' }}
              >
                ✓✓ now
              </span>
            </div>
          </div>

          {/* Input bar */}
          <div
            className="px-3 py-2.5 flex items-center gap-2"
            style={{ background: 'var(--surf2)', borderTop: '1px solid var(--surf3)' }}
          >
            <div
              className="flex-1 px-3 py-1.5 rounded-full text-[11px]"
              style={{
                background: 'var(--surf3)',
                color: 'var(--muted2)',
                fontFamily: 'var(--font-dm-sans)',
              }}
            >
              Type a message…
            </div>
            <span
              className="w-7 h-7 rounded-full flex items-center justify-center"
              style={{ background: 'var(--coral)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff" aria-hidden>
                <path d="M12 14a3 3 0 003-3V6a3 3 0 00-6 0v5a3 3 0 003 3z" />
                <path d="M19 11a1 1 0 10-2 0 5 5 0 01-10 0 1 1 0 10-2 0 7 7 0 006 6.92V21a1 1 0 102 0v-3.08A7 7 0 0019 11z" />
              </svg>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
