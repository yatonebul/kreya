import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession, SESSION_COOKIE } from '@/lib/session';

// Placeholder checkout route — logs the request and returns a 501.
// Wire up the Stripe SDK here when ready:
//   1. npm install stripe
//   2. Create Stripe.Checkout.Session with price_id for the Pro plan
//   3. Return { url: session.url } and redirect the client
//   4. Add /api/billing/webhook to handle stripe.checkout.session.completed
//      → update user_profiles.plan + stripe_customer_id + subscription_status
export async function GET(request: NextRequest) {
  const jar     = await cookies();
  const token   = jar.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  console.log('[billing/create-checkout] request from:', session?.phone ?? 'unauthenticated', {
    url: request.url,
    // Stripe SDK call goes here
  });

  return NextResponse.json(
    {
      error: 'not_implemented',
      message: 'Stripe checkout not yet configured. Check back soon.',
    },
    { status: 501 },
  );
}

export async function POST(request: NextRequest) {
  const jar     = await cookies();
  const token   = jar.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;
  const body    = await request.json().catch(() => ({}));

  console.log('[billing/create-checkout] POST from:', session?.phone ?? 'unauthenticated', body);

  return NextResponse.json(
    {
      error: 'not_implemented',
      message: 'Stripe checkout not yet configured. Check back soon.',
    },
    { status: 501 },
  );
}
