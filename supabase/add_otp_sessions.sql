-- Run this once in the Supabase SQL editor: https://supabase.com/dashboard/project/kuwkdxahsugsfblgbetk/sql

-- OTP codes: short-lived single-use codes sent via WhatsApp
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

-- Account sessions: long-lived httpOnly cookie sessions
create table if not exists account_sessions (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null,
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index if not exists account_sessions_token_hash on account_sessions(token_hash);
