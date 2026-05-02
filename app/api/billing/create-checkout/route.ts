import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { verifySession, SESSION_COOKIE } from '@/lib/session';

const APP_URL             = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kreya-github.vercel.app';
const STRIPE_SECRET_KEY   = process.env.STRIPE_SECRET_KEY   ?? '';
const STRIPE_PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID ?? '';

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function phoneVariants(phone: string): string[] {
  return phone.startsWith('+') ? [phone, phone.slice(1)] : [phone, `+${phone}`];
}

// Resolves the phone to use as Stripe client_reference_id.
// Priority: session cookie → ?phone= query param → null.
async function resolvePhone(request: NextRequest): Promise<string | null> {
  const jar     = await cookies();
  const token   = jar.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  if (session?.phone && !session.phone.includes('@')) return session.phone;

  // Email sessions — look up linked phone
  if (session?.phone?.includes('@')) {
    const { data } = await db()
      .from('email_registrations')
      .select('phone')
      .eq('email', session.phone)
      .maybeSingle();
    if (data?.phone) return data.phone;
  }

  // Fallback: ?phone= param (from WhatsApp upgrade link)
  const urlPhone = new URL(request.url).searchParams.get('phone');
  return urlPhone ?? null;
}

// Creates a Stripe Checkout Session and redirects the user to Stripe's
// hosted page. On success, Stripe redirects to /account?checkout=success
// and fires the checkout.session.completed webhook, which sets plan='pro'.
export async function GET(request: NextRequest) {
  if (!STRIPE_SECRET_KEY || !STRIPE_PRO_PRICE_ID) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }

  const phone = await resolvePhone(request);
  if (!phone) {
    // Not authenticated — send to login then back
    return NextResponse.redirect(`${APP_URL}/login?redirect=${encodeURIComponent('/api/billing/create-checkout')}`);
  }

  // Check if already Pro
  const { data: profile } = await db()
    .from('user_profiles')
    .select('plan, stripe_customer_id')
    .in('whatsapp_phone', phoneVariants(phone))
    .maybeSingle();

  if (profile?.plan === 'pro' || profile?.plan === 'agency') {
    return NextResponse.redirect(`${APP_URL}/account?checkout=already_pro`);
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY);

  // Look up the user's email to pre-fill the Stripe form
  const { data: reg } = await db()
    .from('email_registrations')
    .select('email')
    .in('phone', phoneVariants(phone).map(p => p.replace(/^\+/, '')))
    .maybeSingle();
  const userEmail = reg?.email ?? undefined;

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode:               'subscription',
    line_items:         [{ price: STRIPE_PRO_PRICE_ID, quantity: 1 }],
    client_reference_id: phone,
    metadata:           { phone },
    success_url:        `${APP_URL}/account?checkout=success`,
    cancel_url:         `${APP_URL}/account`,
    allow_promotion_codes: true,
  };

  // Re-use existing Stripe customer (preserves payment methods + email)
  if (profile?.stripe_customer_id) {
    sessionParams.customer = profile.stripe_customer_id;
  } else if (userEmail) {
    // Pre-fill email so the Stripe form is ready to go
    sessionParams.customer_email = userEmail;
  }

  const checkoutSession = await stripe.checkout.sessions.create(sessionParams);
  return NextResponse.redirect(checkoutSession.url!);
}
