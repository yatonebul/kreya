import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { verifySession, SESSION_COOKIE } from '@/lib/session';

const APP_URL           = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kreya-github.vercel.app';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY  ?? '';

function db() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function phoneVariants(phone: string): string[] {
  return phone.startsWith('+') ? [phone, phone.slice(1)] : [phone, `+${phone}`];
}

// Redirects the user to their Stripe Customer Portal (manage card,
// cancel, view invoices). Requires a stripe_customer_id on the profile.
export async function GET(request: NextRequest) {
  if (!STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }

  // Resolve phone from session or ?phone= param
  const jar     = await cookies();
  const token   = jar.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  const urlPhone = new URL(request.url).searchParams.get('phone');
  const phone    = (session?.phone && !session.phone.includes('@'))
    ? session.phone
    : urlPhone ?? '';

  if (!phone) {
    return NextResponse.redirect(`${APP_URL}/account`);
  }

  const { data: profile } = await db()
    .from('user_profiles')
    .select('stripe_customer_id')
    .in('whatsapp_phone', phoneVariants(phone))
    .maybeSingle();

  if (!profile?.stripe_customer_id) {
    // No Stripe customer yet — send them to upgrade instead
    return NextResponse.redirect(`${APP_URL}/api/billing/create-checkout?phone=${encodeURIComponent(phone)}`);
  }

  const stripe        = new Stripe(STRIPE_SECRET_KEY);
  const portalSession = await stripe.billingPortal.sessions.create({
    customer:   profile.stripe_customer_id,
    return_url: `${APP_URL}/account`,
  });

  return NextResponse.redirect(portalSession.url);
}
