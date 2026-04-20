'use client'

import { useState } from 'react'
import { joinWaitlist } from '@/app/actions/waitlist'

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram', icon: '📸' },
  { id: 'tiktok', label: 'TikTok', icon: '🎵' },
  { id: 'twitter', label: 'Twitter / X', icon: '𝕏' },
  { id: 'facebook', label: 'Facebook', icon: '📘' },
  { id: 'linkedin', label: 'LinkedIn', icon: '💼' },
  { id: 'youtube', label: 'YouTube', icon: '▶️' },
  { id: 'pinterest', label: 'Pinterest', icon: '📌' },
  { id: 'threads', label: 'Threads', icon: '🧵' },
]

type State = 'idle' | 'loading' | 'success' | 'taken' | 'error'

export default function WaitlistForm() {
  const [email, setEmail] = useState('')
  const [platforms, setPlatforms] = useState<string[]>([])
  const [useCase, setUseCase] = useState('')
  const [state, setState] = useState<State>('idle')
  const [errMsg, setErrMsg] = useState('')

  function toggle(id: string) {
    setPlatforms(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setState('loading')
    const result = await joinWaitlist({ email, platforms, use_case: useCase })
    if (result.success) {
      setState('success')
    } else if (result.error === 'already_registered') {
      setState('taken')
    } else {
      setState('error')
      setErrMsg(result.error ?? 'Something went wrong.')
    }
  }

  if (state === 'success') {
    return (
      <div className="cta-inner">
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
        <div className="cta-lbl">You&apos;re on the list</div>
        <h2 className="cta-title">Welcome to <span className="ac">Kreya</span>.</h2>
        <p className="cta-sub">
          We&apos;ll reach out when your invite is ready. First 100 users get Pro free for 3 months.
        </p>
      </div>
    )
  }

  if (state === 'taken') {
    return (
      <div className="cta-inner">
        <div className="cta-lbl">Already registered</div>
        <h2 className="cta-title">You&apos;re already on the list ✓</h2>
        <p className="cta-sub">
          We&apos;ll email <strong>{email}</strong> when your invite is ready.
        </p>
      </div>
    )
  }

  return (
    <div className="cta-inner">
      <div className="cta-lbl">Get early access</div>
      <h2 className="cta-title">
        Fire your agency.<br />
        Meet <span className="ac">Kreya</span>.
      </h2>
      <p className="cta-sub">Join the waitlist. First 100 users get Pro free for 3 months.</p>

      <form onSubmit={handleSubmit} style={{ position: 'relative' }}>
        <input
          type="email"
          className="cta-input"
          placeholder="your@email.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          style={{ width: '100%', maxWidth: 400, display: 'block', margin: '0 auto 20px' }}
        />

        <p className="waitlist-section-label">Which platforms do you want to post to?</p>
        <div className="waitlist-platforms">
          {PLATFORMS.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p.id)}
              className={`waitlist-pill${platforms.includes(p.id) ? ' active' : ''}`}
            >
              <span>{p.icon}</span>{p.label}
            </button>
          ))}
        </div>

        <input
          type="text"
          className="cta-input"
          placeholder="What do you create or sell? (optional)"
          value={useCase}
          onChange={e => setUseCase(e.target.value)}
          style={{ width: '100%', maxWidth: 400, display: 'block', margin: '20px auto 0' }}
        />

        {state === 'error' && (
          <p style={{ color: 'var(--coral)', fontSize: 12, marginTop: 12, position: 'relative' }}>
            {errMsg}
          </p>
        )}

        <button
          type="submit"
          className="cta-btn"
          disabled={state === 'loading'}
          style={{ marginTop: 20, opacity: state === 'loading' ? 0.7 : 1 }}
        >
          {state === 'loading' ? 'Joining…' : 'Join waitlist →'}
        </button>

        <div className="cta-note">No credit card · No spam · Cancel anytime</div>
      </form>
    </div>
  )
}
