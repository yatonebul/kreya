import { NextRequest, NextResponse } from 'next/server';
import { adminUrlToken } from '@/lib/session';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kreya-github.vercel.app';

export async function GET(req: NextRequest) {
  const key    = req.nextUrl.searchParams.get('key');
  const secret = process.env.ADMIN_SECRET ?? '';

  if (!secret || key !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const token    = adminUrlToken(secret);
  const adminUrl = `${APP_URL}/admin?secret=${token}`;

  return NextResponse.json({ adminUrl });
}
