import { createHash, randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';

export const SESSION_COOKIE = 'kreya_session';
export const SESSION_DAYS   = 30;

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

// One-way hash of ADMIN_SECRET — safe to put in URLs / WhatsApp messages
export function adminUrlToken(secret: string): string {
  return createHash('sha256').update(secret + 'kreya-admin-url-v1').digest('hex').slice(0, 48);
}

export function hashOtp(code: string) {
  const pepper = process.env.OTP_SECRET ?? 'kreya-otp-v1';
  return createHash('sha256').update(code + pepper).digest('hex');
}

export async function createSession(phone: string): Promise<string> {
  const token     = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  await db().from('account_sessions').insert({ phone, token_hash: hashToken(token), expires_at: expiresAt });
  return token;
}

export async function verifySession(token: string): Promise<{ phone: string } | null> {
  const { data } = await db()
    .from('account_sessions')
    .select('phone')
    .eq('token_hash', hashToken(token))
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  return data ?? null;
}

export async function deleteSession(token: string) {
  await db().from('account_sessions').delete().eq('token_hash', hashToken(token));
}

export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly:  true,
    secure:    process.env.NODE_ENV === 'production',
    sameSite:  'lax' as const,
    path:      '/',
    maxAge,
  };
}
