import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkLoraTraining } from '@/lib/lora';
import { sendText } from '@/lib/whatsapp-send';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kreya-github.vercel.app';

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// Hourly sweep over accounts with lora_status='training' to ask
// Replicate "is it done yet?". On success, the helper stamps
// lora_model_id + flips status='ready'. We notify the user via WA.
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const { data: training } = await supabase
    .from('instagram_accounts')
    .select('id, account_name, lora_training_id, whatsapp_phone')
    .eq('lora_status', 'training');

  if (!training?.length) {
    return NextResponse.json({ ok: true, checked: 0 });
  }

  const results: { account: string; status: string }[] = [];
  for (const acc of training) {
    if (!acc.lora_training_id) continue;
    try {
      const status = await checkLoraTraining(acc.id, acc.lora_training_id);
      results.push({ account: acc.account_name, status });

      if (status === 'ready' && acc.whatsapp_phone) {
        await sendText(
          acc.whatsapp_phone,
          `🎨 *@${acc.account_name}* brand image style is ready!\n\n` +
          `From now on, every AI-generated image for this account will match your feed's aesthetic — same lighting, framing, vibe.\n\n` +
          `Send me anything to see it in action. 🚀`,
        ).catch(() => {});
      }
      if (status === 'failed' && acc.whatsapp_phone) {
        await sendText(
          acc.whatsapp_phone,
          `⚠️ Brand image training for *@${acc.account_name}* failed. Most common cause: not enough public photos on the account. Try again later, or visit ${APP_URL}/account.`,
        ).catch(() => {});
      }
    } catch (err: any) {
      console.error('[poll-lora]', acc.account_name, err.message);
      results.push({ account: acc.account_name, status: 'error' });
    }
  }

  return NextResponse.json({ ok: true, checked: training.length, results });
}
