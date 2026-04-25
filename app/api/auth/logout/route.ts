import { NextRequest, NextResponse } from 'next/server';
import { deleteSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/session';

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', sessionCookieOptions(0));
  return res;
}

export async function GET(req: NextRequest) {
  const token    = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);
  const redirect = req.nextUrl.searchParams.get('redirect') ?? '/login';
  const res      = NextResponse.redirect(new URL(redirect, req.url));
  res.cookies.set(SESSION_COOKIE, '', sessionCookieOptions(0));
  return res;
}
