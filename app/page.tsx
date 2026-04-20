import './landing.css'
import LandingNav from './components/LandingNav'
import WaitlistForm from './components/WaitlistForm'
import ScrollRevealInit from './components/ScrollRevealInit'

export default function Home() {
  return (
    <main className="landing">
      <LandingNav />

      {/* Hero */}
      <section className="hero" id="hero">
        <div className="hero-bg" />
        <div className="hero-grid" />
        <div className="hero-badge">✦ Your Creative AI is live</div>
        <h1 className="hero-title">
          Tell Kreya<br />
          <span className="line2">what you need.<span className="ac">.</span></span>
        </h1>
        <p className="hero-sub">
          Send a <strong>WhatsApp voice note</strong>. Kreya writes the caption, designs the post, and publishes to Instagram, TikTok, Twitter and more — automatically.
        </p>
        <div className="hero-actions">
          <a href="#cta" className="btn-primary">Start free — no card needed →</a>
          <a href="#how" className="btn-secondary">See how it works</a>
        </div>

        {/* WhatsApp mockup */}
        <div className="hero-mockup">
          <div className="wa-phone">
            <div className="wa-header">
              <div className="wa-av">K</div>
              <div>
                <div className="wa-name">Kreya AI</div>
                <div className="wa-status">● Online · Your Creative AI</div>
              </div>
            </div>
            <div className="wa-body">
              <div className="wa-msg user">
                Post a BTS reel from our studio session on Instagram and TikTok — 6pm today, casual vibe 🎸
                <div className="wa-msg-time">Now</div>
              </div>
              <div className="typing-indicator">
                <div className="t-dot" /><div className="t-dot" /><div className="t-dot" />
              </div>
              <div className="wa-preview-card">
                <div className="wa-preview-lbl">✦ Kreya Draft — Instagram + TikTok · 6:00 PM</div>
                <div className="wa-preview-text">
                  Behind the scenes from yesterday&apos;s session 🎸✨<br /><br />
                  The energy in the room was different. When the take just <em>clicks</em> — you feel it before you hear it.<br /><br />
                  Something special is coming. Stay tuned. 🔥<br /><br />
                  #StudioLife #BehindTheScenes #NewMusic
                </div>
                <div className="wa-actions">
                  <button className="wa-action yes">✓ Approve</button>
                  <button className="wa-action edit">✏️ Edit</button>
                </div>
              </div>
            </div>
            <div className="wa-input-row">
              <div className="wa-input">Message Kreya…</div>
              <div className="wa-send-btn">➤</div>
            </div>
          </div>
        </div>
      </section>

      {/* Platform logos strip */}
      <div className="logos-strip">
        <div className="logos-lbl">Posts to all your platforms</div>
        <div className="logos-row">
          <div className="logo-item"><span>📸</span> Instagram</div>
          <div className="logo-item"><span>🎵</span> TikTok</div>
          <div className="logo-item"><span>𝕏</span> Twitter / X</div>
          <div className="logo-item"><span>📘</span> Facebook</div>
          <div className="logo-item"><span>💼</span> LinkedIn</div>
          <div className="logo-item"><span>▶️</span> YouTube</div>
        </div>
      </div>

      {/* How it works */}
      <section id="how">
        <div className="section-inner">
          <span className="section-lbl reveal">How it works</span>
          <h2 className="section-title reveal">Four steps.<br />Zero agency needed.</h2>
          <p className="section-sub reveal">Non-technical creators run their entire content operation from WhatsApp. Kreya handles everything in between.</p>
          <div className="steps-grid reveal">
            {[
              { num: '01', ico: '💬', title: 'Send a prompt', desc: 'Text or voice note on WhatsApp. "Post a motivational reel on Instagram tomorrow 9am" — that\'s all you need.' },
              { num: '02', ico: '🤖', title: 'Kreya AI generates', desc: 'Claude AI writes the caption, selects hashtags, optimises format for each platform — in seconds.' },
              { num: '03', ico: '✓', title: 'You approve', desc: 'Kreya sends you a preview on WhatsApp. Reply "yes" to approve, or give feedback to refine it.' },
              { num: '04', ico: '🚀', title: 'Posts go live', desc: 'Kreya publishes to every selected platform at the exact scheduled time. You get a notification when it\'s live.' },
            ].map(s => (
              <div key={s.num} className="step-card">
                <div className="step-num">{s.num}</div>
                <div className="step-ico">{s.ico}</div>
                <div className="step-title">{s.title}</div>
                <div className="step-desc">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features">
        <div className="section-inner">
          <span className="section-lbl reveal">Features</span>
          <h2 className="section-title reveal">Everything a digital<br />agency does. In your pocket.</h2>
          <p className="section-sub reveal">Kreya replaces your social media manager, copywriter, and scheduler — for the price of a coffee subscription.</p>
          <div className="features-grid reveal">
            {[
              { cls: 'c', ico: '💬', title: 'WhatsApp-native control', desc: 'Your entire content operation from one WhatsApp conversation. No apps to learn, no dashboards to navigate.', highlight: true },
              { cls: 'v', ico: '🤖', title: 'Real AI — Claude + GPT', desc: 'Powered by Claude Sonnet and GPT-4o. Understands your brand voice, tone, and audience.' },
              { cls: 'm', ico: '📅', title: 'Smart scheduling', desc: 'Schedule up to 90 days in advance. Recurring posts, best-time suggestions, platform-specific windows.' },
              { cls: 'g', ico: '♻️', title: 'Content repurposing', desc: 'One idea → six platform formats. Kreya adapts captions for Instagram, TikTok, Twitter, LinkedIn automatically.' },
              { cls: 'r', ico: '🎨', title: 'Brand kit', desc: 'Upload your logo, colours, and tone of voice. Kreya uses them in every piece of content it generates.' },
              { cls: 's', ico: '📊', title: 'Analytics that matter', desc: 'Reach, engagement, top posts, follower growth — pulled from all platforms into one clean dashboard.' },
            ].map(f => (
              <div key={f.title} className={`feature-card${f.highlight ? ' highlight' : ''}`}>
                <div className={`feature-ico ${f.cls}`}>{f.ico}</div>
                <div className="feature-title">{f.title}</div>
                <div className="feature-desc">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Platforms */}
      <section id="platforms">
        <div className="section-inner">
          <span className="section-lbl reveal">Platforms</span>
          <h2 className="section-title reveal">One prompt.<br />Every platform.</h2>
          <p className="section-sub reveal">Kreya connects directly to all major social networks via official APIs. No third-party tools, no extra cost.</p>
          <div className="platforms-row reveal">
            {[
              { ico: '📸', name: 'Instagram', live: true },
              { ico: '🎵', name: 'TikTok', live: true },
              { ico: '𝕏', name: 'Twitter / X', live: true },
              { ico: '📘', name: 'Facebook', live: true },
              { ico: '💼', name: 'LinkedIn', live: false },
              { ico: '▶️', name: 'YouTube Shorts', live: false },
              { ico: '📌', name: 'Pinterest', live: false },
              { ico: '🧵', name: 'Threads', live: false },
            ].map(p => (
              <div key={p.name} className="platform-pill">
                <span className="pp-ico">{p.ico}</span>
                {p.name}
                <span className={`pp-status ${p.live ? 'pp-live' : 'pp-soon'}`}>{p.live ? 'Live' : 'Coming'}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing">
        <div className="section-inner">
          <span className="section-lbl reveal">Pricing</span>
          <h2 className="section-title reveal" style={{ textAlign: 'center' }}>Start free.<br />Scale when ready.</h2>
          <p className="section-sub reveal" style={{ textAlign: 'center', margin: '0 auto 52px' }}>No credit card needed to start. Cancel anytime. All plans include WhatsApp control.</p>
          <div className="pricing-grid reveal">
            {/* Free */}
            <div className="price-card">
              <div className="price-name">Free</div>
              <div className="price-amount">$0<span>/mo</span></div>
              <div className="price-period">Forever free</div>
              <div className="price-divider" />
              {['3 social accounts', '10 AI posts per month', 'WhatsApp control', 'Content calendar', '1 user'].map(f => (
                <div key={f} className="price-feature">{f}</div>
              ))}
              <a href="#cta" className="price-cta outline">Get started free</a>
            </div>
            {/* Pro */}
            <div className="price-card popular">
              <div className="popular-badge">Most popular</div>
              <div className="price-name">Pro</div>
              <div className="price-amount">$19<span>/mo</span></div>
              <div className="price-period">Billed monthly · cancel anytime</div>
              <div className="price-divider" />
              {['Unlimited social accounts', '200 AI posts per month', 'WhatsApp + voice notes', 'Analytics dashboard', 'Content repurposing', '3 users'].map(f => (
                <div key={f} className="price-feature">{f}</div>
              ))}
              <a href="#cta" className="price-cta primary">Start Pro →</a>
            </div>
            {/* Agency */}
            <div className="price-card">
              <div className="price-name">Agency</div>
              <div className="price-amount">$79<span>/mo</span></div>
              <div className="price-period">For teams and agencies</div>
              <div className="price-divider" />
              {['10 brands / organisations', 'Unlimited AI posts', 'Team seats', 'White label', 'Priority AI models', 'API access'].map(f => (
                <div key={f} className="price-feature">{f}</div>
              ))}
              <a href="#cta" className="price-cta outline">Contact us</a>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials">
        <div className="section-inner">
          <span className="section-lbl reveal">Early users</span>
          <h2 className="section-title reveal">Creators love Kreya.</h2>
          <p className="section-sub reveal">Join creators and small businesses already using Kreya to manage their social presence.</p>
          <div className="testimonials-grid reveal">
            {[
              { initial: 'M', gradient: 'linear-gradient(135deg,#FF4F3B,#FF8C7A)', quote: 'I used to spend 3 hours every Sunday scheduling content. Now I send a voice note on Monday morning and it\'s done. Kreya genuinely changed how I work.', name: 'Martina K.', role: 'Fitness creator · 42K followers' },
              { initial: 'T', gradient: 'linear-gradient(135deg,#5E35FF,#9070FF)', quote: 'We were paying an agency €800/month for social media. Switched to Kreya at $19 and honestly the content quality is better. The AI understands our brand voice.', name: 'Tomáš H.', role: 'Restaurant owner · Prague' },
              { initial: 'S', gradient: 'linear-gradient(135deg,#00E5A0,#00B880)', quote: 'The WhatsApp interface is genius. I\'m not a tech person at all. I just talk to Kreya like I\'d talk to a team member and it handles everything.', name: 'Sofia B.', role: 'Life coach · 18K Instagram' },
            ].map(t => (
              <div key={t.name} className="testimonial-card">
                <div className="t-stars">★★★★★</div>
                <div className="t-quote">&ldquo;{t.quote}&rdquo;</div>
                <div className="t-author">
                  <div className="t-av" style={{ background: t.gradient }}>{t.initial}</div>
                  <div>
                    <div className="t-name">{t.name}</div>
                    <div className="t-role">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA / Waitlist */}
      <section id="cta">
        <WaitlistForm />
      </section>

      {/* Footer */}
      <footer>
        <div className="footer-inner">
          <div className="footer-top">
            <div>
              <div className="footer-logo">KREY<span className="ac">A</span>.</div>
              <div className="footer-tagline">Your Creative AI. Tell Kreya what you need. Consider it done.</div>
            </div>
            <div>
              <div className="footer-col-title">Product</div>
              <a href="#how" className="footer-link">How it works</a>
              <a href="#features" className="footer-link">Features</a>
              <a href="#platforms" className="footer-link">Platforms</a>
              <a href="#pricing" className="footer-link">Pricing</a>
            </div>
            <div>
              <div className="footer-col-title">Company</div>
              <a href="#" className="footer-link">About</a>
              <a href="#" className="footer-link">Blog</a>
              <a href="#" className="footer-link">Careers</a>
              <a href="#" className="footer-link">Contact</a>
            </div>
            <div>
              <div className="footer-col-title">Legal</div>
              <a href="#" className="footer-link">Privacy Policy</a>
              <a href="#" className="footer-link">Terms of Service</a>
              <a href="#" className="footer-link">Cookie Policy</a>
              <a href="#" className="footer-link">GDPR</a>
            </div>
          </div>
          <div className="footer-bottom">
            <div className="footer-copy">© 2026 Kreya Technologies Inc. All rights reserved.</div>
            <div className="footer-socials">
              <a href="#" className="footer-social" title="Instagram">📸</a>
              <a href="#" className="footer-social" title="Twitter">𝕏</a>
              <a href="#" className="footer-social" title="TikTok">🎵</a>
            </div>
          </div>
        </div>
      </footer>

      <ScrollRevealInit />
    </main>
  )
}
