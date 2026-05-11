import Stripe from 'stripe';

let cachedPrice: { amount: number; currency: string; formattedPrice: string } | null = null;
let cacheTime = 0;
const CACHE_TTL = 3600000; // 1 hour

export async function getProPrice(): Promise<{
  amount: number;
  currency: string;
  formattedPrice: string;
}> {
  // Return cached price if still valid
  if (cachedPrice && Date.now() - cacheTime < CACHE_TTL) {
    return cachedPrice;
  }

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  const STRIPE_PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID;

  if (!STRIPE_SECRET_KEY || !STRIPE_PRO_PRICE_ID) {
    // Fallback to env var label or default
    return {
      amount: 2000,
      currency: 'usd',
      formattedPrice: process.env.NEXT_PUBLIC_PRO_PRICE_LABEL ?? '$20',
    };
  }

  try {
    const stripe = new Stripe(STRIPE_SECRET_KEY);
    const price = await stripe.prices.retrieve(STRIPE_PRO_PRICE_ID);

    if (price.type === 'recurring' && price.unit_amount) {
      const amount = price.unit_amount;
      const currency = price.currency;
      const formattedPrice = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
      }).format(amount / 100);

      cachedPrice = { amount, currency, formattedPrice };
      cacheTime = Date.now();
      return cachedPrice;
    }
  } catch (err) {
    console.error('Failed to fetch Stripe price:', err);
  }

  // Fallback
  return {
    amount: 1999,
    currency: 'usd',
    formattedPrice: process.env.NEXT_PUBLIC_PRO_PRICE_LABEL ?? '$19.99',
  };
}
