import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { sendText } from '@/lib/whatsapp-send';

export const runtime = 'nodejs';
// Stripe requires the raw body for signature verification — disable
// Next.js body parsing so we can call request.text() ourselves.
export const dynamic = 'force-dynamic';

const STRIPE_SECRET_KEY    = process.env.STRIPE_SECRET_KEY    ?? '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? '';
const APP_URL              = process.env.NEXT_PUBLIC_APP_URL  ?? 'https://kreya-github.vercel.app';

function db() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function phoneVariants(phone: string): string[] {
  return phone.startsWith('+') ? [phone, phone.slice(1)] : [phone, `+${phone}`];
}

export async function POST(request: NextRequest) {
  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }

  const rawBody = await request.text();
  const sig     = request.headers.get('stripe-signature') ?? '';

  const stripe = new Stripe(STRIPE_SECRET_KEY);
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error('[stripe-webhook] signature verification failed:', err.message);
    return NextResponse.json({ error: `Webhook signature error: ${err.message}` }, { status: 400 });
  }

  console.log('[stripe-webhook] event:', event.type);

  try {
    switch (event.type) {

      // ── Payment completed — activate Pro ──────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== 'subscription') break;

        const phone      = session.metadata?.phone ?? session.client_reference_id ?? '';
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? '';
        const subId      = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? '';

        if (!phone) {
          console.error('[stripe-webhook] checkout.session.completed: no phone in metadata');
          break;
        }

        await db()
          .from('user_profiles')
          .update({
            plan:                'pro',
            stripe_customer_id:  customerId || undefined,
            subscription_status: 'active',
          })
          .in('whatsapp_phone', phoneVariants(phone));

        console.log(`[stripe-webhook] upgraded ${phone} to Pro (sub: ${subId})`);

        // WhatsApp welcome message
        sendText(
          phone,
          `🎉 *Welcome to Kreya Pro!*\n\n` +
          `You're now on Pro:\n` +
          `• Train your brand image style (LoRA)\n` +
          `• Up to 10 high-quality AI images per day\n\n` +
          `Start training at: ${APP_URL}/account`,
        ).catch(() => {});

        break;
      }

      // ── Subscription updated (renewal, plan change) ───────────────────
      case 'customer.subscription.updated': {
        const sub     = event.data.object as Stripe.Subscription;
        const custId  = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? '';
        const status  = sub.status; // 'active' | 'past_due' | 'canceled' | 'unpaid' etc.

        if (!custId) break;

        const newPlan = status === 'active' ? 'pro' : 'free';
        await db()
          .from('user_profiles')
          .update({ plan: newPlan, subscription_status: status })
          .eq('stripe_customer_id', custId);

        console.log(`[stripe-webhook] subscription updated for customer ${custId}: status=${status}, plan=${newPlan}`);
        break;
      }

      // ── Subscription cancelled — revert to Free ───────────────────────
      case 'customer.subscription.deleted': {
        const sub    = event.data.object as Stripe.Subscription;
        const custId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? '';

        if (!custId) break;

        await db()
          .from('user_profiles')
          .update({ plan: 'free', subscription_status: 'canceled' })
          .eq('stripe_customer_id', custId);

        console.log(`[stripe-webhook] subscription cancelled for customer ${custId}`);

        // Look up phone to send WA notification
        const { data: profile } = await db()
          .from('user_profiles')
          .select('whatsapp_phone')
          .eq('stripe_customer_id', custId)
          .maybeSingle();

        if (profile?.whatsapp_phone) {
          sendText(
            profile.whatsapp_phone,
            `Your Kreya Pro subscription has ended — you're back on the free plan.\n\n` +
            `Reactivate anytime: ${APP_URL}/api/billing/create-checkout`,
          ).catch(() => {});
        }

        break;
      }

      default:
        console.log(`[stripe-webhook] unhandled event type: ${event.type}`);
    }
  } catch (err: any) {
    console.error('[stripe-webhook] handler error:', err.message);
    // Return 200 so Stripe doesn't retry — the error is on our side
    return NextResponse.json({ ok: false, error: err.message });
  }

  return NextResponse.json({ ok: true });
}
