import { createClient } from '@supabase/supabase-js';

// Per-brand LoRA training via Replicate. We fine-tune Flux Dev on the
// user's last ~30 IG photos so generated images match their actual feed
// aesthetic — same lighting, same composition, same vibe. ~$5 + 20 min
// per brand, one-time. Stored model id then folded into every
// subsequent buildImageUrl call.
//
// All Replicate calls go through fetch + REPLICATE_API_TOKEN. The
// training pipeline:
//   1. Pull last 30 IG media items (image_url field).
//   2. Filter to images only (skip videos / carousels).
//   3. POST to Replicate training endpoint with the URLs.
//   4. Store the training id + status='training'.
//   5. A weekly cron polls open trainings; on success it copies the
//      output model id into instagram_accounts.lora_model_id and
//      flips status to 'ready'.

const REPLICATE_OWNER  = 'ostris';
const REPLICATE_MODEL  = 'flux-dev-lora-trainer';
const REPLICATE_VERSION = process.env.REPLICATE_LORA_TRAINER_VERSION ?? '4ffd32160efd92e956d39c5338a9b8fbafca58e03f791f6d8011f3e20e8ea6fa';
// trigger_word is what we'll inject into prompts so the LoRA fires;
// keeping it short + brand-specific minimises bleed into generic prompts.
const TRIGGER_PREFIX = 'kreyabrand_';

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function replicateConfigured(): boolean {
  return !!process.env.REPLICATE_API_TOKEN;
}

async function fetchIgPhotoUrls(igUserId: string, accessToken: string, limit = 30): Promise<string[]> {
  const url = `https://graph.instagram.com/v21.0/${igUserId}/media?fields=media_type,media_url,thumbnail_url&limit=${limit}&access_token=${accessToken}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!Array.isArray(data?.data)) return [];
  return data.data
    .filter((m: any) => m.media_type === 'IMAGE' || m.media_type === 'CAROUSEL_ALBUM')
    .map((m: any) => m.media_url ?? m.thumbnail_url)
    .filter(Boolean)
    .slice(0, 25);
}

// Kicks off a Replicate LoRA training run. Returns the training id so
// the caller can stamp the account row + later poll for completion.
export async function startLoraTraining(args: {
  accountId: string;
  igUserId: string;
  accessToken: string;
  accountName: string;
}): Promise<{ ok: boolean; trainingId?: string; trigger?: string; error?: string }> {
  if (!replicateConfigured()) {
    return { ok: false, error: 'REPLICATE_API_TOKEN not set in Vercel env' };
  }

  const photos = await fetchIgPhotoUrls(args.igUserId, args.accessToken);
  if (photos.length < 8) {
    return { ok: false, error: `need at least 8 photos, found ${photos.length}` };
  }

  const trigger = `${TRIGGER_PREFIX}${args.accountName.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 12)}`;
  // Replicate training endpoint shape — pinned to our trainer version.
  // The destination model is created automatically by Replicate based
  // on the auth'd user; we'll see the new model id in the training output.
  const res = await fetch(
    `https://api.replicate.com/v1/models/${REPLICATE_OWNER}/${REPLICATE_MODEL}/versions/${REPLICATE_VERSION}/trainings`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: {
          input_images: photos,
          trigger_word: trigger,
          steps: 1000,
          lora_rank: 16,
        },
        // Per-account destination model. Replicate auto-creates it on the
        // auth'd user / org if it doesn't exist.
        destination: `${process.env.REPLICATE_USERNAME ?? 'kreya'}/brand-${args.accountId.slice(0, 12)}`,
      }),
    },
  );
  const data = await res.json();
  if (!data?.id) {
    return { ok: false, error: data?.detail ?? data?.error ?? 'training POST failed' };
  }

  await db().from('instagram_accounts').update({
    lora_status: 'training',
    lora_training_id: data.id,
  }).eq('id', args.accountId);

  return { ok: true, trainingId: data.id, trigger };
}

// Polls Replicate for the status of a training run. Updates the
// account row when training succeeds (sets lora_model_id, status='ready')
// or fails (status='failed').
export async function checkLoraTraining(accountId: string, trainingId: string): Promise<'training' | 'ready' | 'failed'> {
  if (!replicateConfigured()) return 'training';

  const res = await fetch(`https://api.replicate.com/v1/trainings/${trainingId}`, {
    headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` },
  });
  const data = await res.json();
  const status = data?.status as string | undefined;

  if (status === 'succeeded') {
    const modelVersion: string | undefined = data?.output?.version;
    await db().from('instagram_accounts').update({
      lora_status: 'ready',
      lora_model_id: modelVersion ?? null,
      lora_trained_at: new Date().toISOString(),
    }).eq('id', accountId);
    return 'ready';
  }
  if (status === 'failed' || status === 'canceled') {
    await db().from('instagram_accounts').update({
      lora_status: 'failed',
    }).eq('id', accountId);
    return 'failed';
  }
  return 'training';
}

// Generates a brand-aware image URL. When a ready LoRA exists for the
// active IG account, route through Replicate's prediction endpoint with
// the user's trigger word folded in; otherwise fall back to the
// existing buildImageUrl pipeline (pollinations).
export async function buildBrandImageUrl(
  prompt: string,
  account: { lora_model_id?: string | null; lora_status?: string | null; account_name?: string } | null,
): Promise<string | null> {
  if (!replicateConfigured() || !account?.lora_model_id || account.lora_status !== 'ready') {
    return null; // caller falls back to pollinations buildImageUrl
  }

  const trigger = `${TRIGGER_PREFIX}${(account.account_name ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 12)}`;
  const fullPrompt = `${trigger}, ${prompt}`;

  const res = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: account.lora_model_id,
      input: {
        prompt: fullPrompt,
        aspect_ratio: '1:1',
        num_inference_steps: 28,
        guidance: 3.5,
        output_format: 'jpg',
        output_quality: 90,
      },
    }),
  });
  const data = await res.json();
  // Replicate returns immediately with a status URL; for a quick MVP
  // we poll a few times. Production would use webhooks or store the
  // prediction id and resolve later.
  let prediction = data;
  for (let i = 0; i < 30 && prediction?.status !== 'succeeded' && prediction?.status !== 'failed'; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const poll = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
      headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` },
    });
    prediction = await poll.json();
  }
  if (prediction?.status === 'succeeded' && Array.isArray(prediction.output) && prediction.output[0]) {
    return prediction.output[0] as string;
  }
  return null;
}
