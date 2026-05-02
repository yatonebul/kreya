'use client';

import { useEffect, useState } from 'react';

type Step = {
  id: 'whatsapp' | 'instagram' | 'engagement';
  title: string;
  description: string;
  icon: string;
  completed: boolean;
  cta?: {
    label: string;
    href: string;
  };
};

export function NextStepsChecklist({
  whatsappPhone,
  instagramConnected,
  engagementEnabled,
  connectUrl,
  isProPlan,
}: {
  whatsappPhone: string | null;
  instagramConnected: boolean;
  engagementEnabled: boolean;
  connectUrl: string;
  isProPlan: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const hasViewed = localStorage.getItem('kreya_checklist_viewed');
    if (hasViewed) {
      setIsExpanded(false);
    } else {
      localStorage.setItem('kreya_checklist_viewed', 'true');
    }
  }, []);

  const steps: Step[] = [
    {
      id: 'whatsapp',
      title: 'WhatsApp linked',
      description: 'Your WhatsApp is your creative command center.',
      icon: '💬',
      completed: !!whatsappPhone,
      cta: whatsappPhone ? undefined : {
        label: 'Link WhatsApp',
        href: '#',
      },
    },
    {
      id: 'instagram',
      title: 'Instagram connected',
      description: 'Publish directly from WhatsApp to your Instagram feed.',
      icon: '📸',
      completed: instagramConnected,
      cta: !instagramConnected ? {
        label: 'Connect Instagram',
        href: connectUrl,
      } : undefined,
    },
    {
      id: 'engagement',
      title: 'First engagement rule',
      description: isProPlan
        ? 'Let Kreya auto-reply to comments and DMs in your brand voice.'
        : 'Pro feature — upgrade to enable auto-replies.',
      icon: '💭',
      completed: engagementEnabled,
      cta: !isProPlan && !engagementEnabled
        ? {
            label: 'Upgrade to Pro',
            href: '/api/billing/create-checkout',
          }
        : engagementEnabled
        ? undefined
        : {
            label: 'Set up auto-reply',
            href: '#',
          },
    },
  ];

  const completedCount = steps.filter(s => s.completed).length;
  const progress = (completedCount / steps.length) * 100;
  const shouldShowExpanded = !mounted || isExpanded;

  return (
    <section className="rounded-2xl p-6 flex flex-col gap-6" style={{ background: 'var(--surf2)', border: '1px solid rgba(0,229,160,0.15)' }}>
      {/* Header */}
      <div className="flex flex-col gap-2">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center justify-between gap-3 flex-wrap w-full text-left hover:opacity-80 transition-opacity"
          style={{ cursor: 'pointer' }}
        >
          <h2 className="text-base font-semibold" style={{ fontFamily: 'var(--font-syne)' }}>
            Next Steps
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium px-2 py-1 rounded-full" style={{ fontFamily: 'var(--font-space-mono)', color: 'var(--mint)', background: 'rgba(0,229,160,0.12)', border: '1px solid rgba(0,229,160,0.3)' }}>
              {completedCount}/{steps.length} complete
            </span>
            <span
              className="text-sm transition-transform"
              style={{
                transform: shouldShowExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
              }}
              aria-hidden
            >
              ▼
            </span>
          </div>
        </button>
        {shouldShowExpanded && (
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surf3)' }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${progress}%`,
                background: progress === 100 ? 'var(--mint)' : 'var(--coral)',
              }}
            />
          </div>
        )}
      </div>

      {/* Steps */}
      {shouldShowExpanded && (
        <div className="flex flex-col gap-3">
          {steps.map(step => (
            <div
              key={step.id}
              className="rounded-xl p-4 flex items-start gap-4 transition-colors"
              style={{
                background: step.completed ? 'rgba(0,229,160,0.08)' : 'var(--surf3)',
                border: step.completed ? '1px solid rgba(0,229,160,0.2)' : '1px solid var(--surf3)',
              }}
            >
              {/* Checkbox Icon */}
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{
                  background: step.completed ? 'var(--mint)' : 'transparent',
                  border: step.completed ? 'none' : '1.5px solid var(--muted2)',
                }}
              >
                {step.completed ? (
                  <span style={{ color: 'var(--dark)', fontSize: '12px', fontWeight: 'bold' }}>✓</span>
                ) : (
                  <span style={{ fontSize: '14px' }}>{step.icon}</span>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p
                    className="text-sm font-medium"
                    style={{
                      fontFamily: 'var(--font-dm-sans)',
                      color: step.completed ? 'var(--mint)' : 'var(--white)',
                    }}
                  >
                    {step.title}
                  </p>
                </div>
                <p
                  className="text-xs"
                  style={{
                    fontFamily: 'var(--font-dm-sans)',
                    color: 'var(--muted)',
                    lineHeight: 1.5,
                  }}
                >
                  {step.description}
                </p>
              </div>

              {/* CTA Button */}
              {step.cta && !step.completed && (
                <a
                  href={step.cta.href}
                  className="text-xs px-3 py-1.5 rounded-full font-medium flex-shrink-0 transition-opacity hover:opacity-80 whitespace-nowrap"
                  style={{
                    background: step.cta.label.includes('Upgrade') ? 'var(--coral)' : 'transparent',
                    color: step.cta.label.includes('Upgrade') ? '#fff' : 'var(--white)',
                    border: step.cta.label.includes('Upgrade') ? 'none' : '1px solid var(--muted2)',
                    fontFamily: 'var(--font-dm-sans)',
                  }}
                >
                  {step.cta.label}
                </a>
              )}
              {step.completed && (
                <span
                  className="text-xs font-medium flex-shrink-0 py-1.5"
                  style={{
                    color: 'var(--mint)',
                    fontFamily: 'var(--font-space-mono)',
                  }}
                >
                  ✓
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pro unlock card for free users */}
      {shouldShowExpanded && !isProPlan && (
        <div
          className="rounded-xl p-4 flex items-start gap-3"
          style={{
            background: 'linear-gradient(135deg, rgba(94,53,255,0.10) 0%, rgba(255,209,102,0.08) 100%)',
            border: '1px solid rgba(94,53,255,0.2)',
          }}
        >
          <span style={{ fontSize: '16px', flexShrink: 0 }}>🎨</span>
          <div className="flex-1 min-w-0">
            <p
              className="text-sm font-semibold mb-1"
              style={{
                fontFamily: 'var(--font-syne)',
                color: 'var(--white)',
              }}
            >
              Unlock Brand-Consistent Images
            </p>
            <p
              className="text-xs"
              style={{
                fontFamily: 'var(--font-dm-sans)',
                color: 'var(--muted)',
                lineHeight: 1.5,
              }}
            >
              Train your brand style (LoRA) and generate AI images that match your aesthetic perfectly. Pro feature only.
            </p>
          </div>
          <a
            href="/api/billing/create-checkout"
            className="text-xs px-3 py-1.5 rounded-full font-medium flex-shrink-0 transition-opacity hover:opacity-80 whitespace-nowrap"
            style={{
              background: 'var(--coral)',
              color: '#fff',
              fontFamily: 'var(--font-dm-sans)',
            }}
          >
            Upgrade
          </a>
        </div>
      )}
    </section>
  );
}
