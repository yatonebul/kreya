import { NextRequest, NextResponse } from 'next/server';
import postgres from 'postgres';

// One-time idempotent setup route — creates auth tables if they don't exist.
// Protected by a static key so it can be called from CI / bash without exposing secrets.
const SETUP_KEY = process.env.SETUP_KEY ?? 'kreya-init-2026';

const DDL = `
create table if not exists otp_codes (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null,
  code_hash   text not null,
  expires_at  timestamptz not null,
  attempts    int not null default 0,
  used        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists otp_codes_phone_expires on otp_codes(phone, expires_at);

create table if not exists account_sessions (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null,
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index if not exists account_sessions_token_hash on account_sessions(token_hash);

-- Email-based registrations with admin approval gate
create table if not exists email_registrations (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  phone       text,
  status      text not null default 'pending',
  created_at  timestamptz not null default now(),
  approved_at timestamptz
);
create index if not exists email_reg_status on email_registrations(status, created_at desc);
`;

export async function POST(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key') ?? req.headers.get('x-setup-key');
  if (key !== SETUP_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
  if (!url) {
    return NextResponse.json({ error: 'No POSTGRES_URL or DATABASE_URL env var found. Add one from Supabase → Settings → Database → Connection string.' }, { status: 500 });
  }

  try {
    const sql = postgres(url, { ssl: 'require', max: 1 });
    await sql.unsafe(DDL);
    await sql.end();
    return NextResponse.json({ ok: true, message: 'Tables created (or already existed).' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
