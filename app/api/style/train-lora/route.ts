import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { startLoraTraining } from '@/lib/lora';

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function phoneVariants(phone: string): string[] {
  return phone.startsWith('+') ? [phone, phone.slice(1)] : [phone, `+${phone}`];
}

// Triggers Flux LoRA training on the active IG account's last ~25 photos.
// Returns the training id; caller polls /api/cron/poll-lora-status (or
// the cron job runs hourly) to flip status to 'ready' once Replicate
// finishes (~20 min, ~$5).
export async function POST(request: NextRequest) {
  const { phone, account_id } = await request.json().catch(() => ({}));
  if (!phone) return NextResponse.json({ error: 'phone required' }, { status: 400 });

  const supabase = getSupabase();
  const accountQuery = account_id
    ? supabase.from('instagram_accounts')
        .select('id, account_name, instagram_user_id, access_token, lora_status')
        .eq('id', account_id)
        .in('whatsapp_phone', phoneVariants(phone))
        .maybeSingle()
    : supabase.from('instagram_accounts')
        .select('id, account_name, instagram_user_id, access_token, lora_status')
        .in('whatsapp_phone', phoneVariants(phone))
        .eq('is_active', true)
        .maybeSingle();
  const { data: account } = await accountQuery;

  if (!account?.access_token || !account.instagram_user_id) {
    return NextResponse.json({ error: 'no_instagram', message: 'Connect Instagram first.' }, { status: 400 });
  }
  if (account.lora_status === 'training') {
    return NextResponse.json({ error: 'already_training', message: 'Already training — check back in ~20 minutes.' }, { status: 409 });
  }
  if (account.lora_status === 'ready') {
    return NextResponse.json({ error: 'already_ready', message: 'Brand LoRA already trained. Disconnect/reconnect to retrain.' }, { status: 409 });
  }

  const result = await startLoraTraining({
    accountId: account.id,
    igUserId: account.instagram_user_id,
    accessToken: account.access_token,
    accountName: account.account_name,
  });

  if (!result.ok) {
    return NextResponse.json({ error: 'training_failed', message: result.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    trainingId: result.trainingId,
    trigger: result.trigger,
    note: 'Training takes ~20 min. The cron will flip lora_status to "ready" automatically.',
  });
}
