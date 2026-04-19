import { after } from 'next/server';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateCaption, generateImagePrompt, refineCaption } from '@/lib/caption-generator';
import { publishToInstagram } from '@/lib/instagram-publish';
import { sendText, sendPostPreview } from '@/lib/whatsapp-send';
import { buildImageUrl, detectStyle } from '@/lib/image-generator';

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN ?? 'kreya_whatsapp_2026';
const IG_ACCOUNT = 'nepostnuto';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  return NextResponse.json({ error: 'Invalid verification token' }, { status: 403 });
}

export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Return 200 to Meta immediately — prevents retries on slow AI calls.
  // All processing happens in after() which runs after the response is sent.
  after(async () => {
    await processWebhook(body);
  });

  return NextResponse.json({ ok: true });
}

async function processWebhook(body: any) {
  const value = body.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];
  if (!message) return;

  const from: string = message.from;
  const messageType: string = message.type;

  try {
    // Button reply (Approve / Edit / Discard)
    if (messageType === 'interactive') {
      await handleButtonReply(from, message.interactive?.button_reply?.id);
      return;
    }

    if (messageType === 'text' || messageType === 'image') {
      const pending = await getPending(from);

      // User is in edit conversation
      if (pending?.state === 'in_edit' && messageType === 'text') {
        await handleEditRefinement(from, pending, message.text.body);
        return;
      }

      // User already has a pending post — resend it instead of creating a new one.
      // Handles "did it stuck?" or accidental double-sends.
      if (pending?.state === 'pending_approval') {
        await sendText(from, '👆 Your draft is still waiting:');
        await sendPostPreview(from, pending.image_url, pending.caption);
        return;
      }

      // New post
      let prompt = '';
      if (messageType === 'text') {
        prompt = message.text?.body ?? '';
      } else {
        prompt = message.image?.caption ?? 'A beautiful moment captured';
      }

      await sendText(from, '✍️ Generating your post...');

      const [profileContext, recentCaptions, imagePrompt] = await Promise.all([
        getProfileContext(),
        getRecentCaptions(),
        generateImagePrompt(prompt),
      ]);
      const [caption] = await Promise.all([
        generateCaption(prompt, profileContext ?? undefined, recentCaptions),
      ]);
      const imageUrl = buildImageUrl(imagePrompt, 'realistic');

      await getSupabase().from('pending_posts').insert({
        whatsapp_phone: from,
        caption,
        image_url: imageUrl,
        state: 'pending_approval',
      });

      await sendPostPreview(from, imageUrl, caption);
    }
  } catch (err: any) {
    console.error('[webhook error]', err.message);
    await sendText(from, '⚠️ Something went wrong. Please try again.').catch(() => {});
  }
}

async function getPending(phone: string) {
  const { data } = await getSupabase()
    .from('pending_posts')
    .select('*')
    .eq('whatsapp_phone', phone)
    .in('state', ['pending_approval', 'in_edit'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function getProfileContext(): Promise<string | null> {
  const { data } = await getSupabase()
    .from('instagram_accounts')
    .select('profile_context')
    .eq('account_name', IG_ACCOUNT)
    .maybeSingle();
  return data?.profile_context ?? null;
}

async function getRecentCaptions(): Promise<string[]> {
  const { data } = await getSupabase()
    .from('pending_posts')
    .select('caption')
    .eq('state', 'published')
    .order('created_at', { ascending: false })
    .limit(5);
  return data?.map(r => r.caption) ?? [];
}

async function handleButtonReply(from: string, buttonId: string) {
  const pending = await getPending(from);

  if (!pending) {
    await sendText(from, 'No pending post found. Send me a message to create a new post! 💬');
    return;
  }

  if (buttonId === 'approve') {
    await sendText(from, '⏳ Publishing to Instagram...');
    const result = await publishToInstagram(pending.caption, pending.image_url);

    await getSupabase()
      .from('pending_posts')
      .update({ state: 'published', ig_post_id: result.postId, ig_post_url: result.postUrl ?? null })
      .eq('id', pending.id);

    const linkLine = result.postUrl ? `\n\n🔗 ${result.postUrl}` : '';
    await sendText(from, `🎉 Your post is live!${linkLine}\n\nKeep creating — every post builds your audience. 🚀`);

  } else if (buttonId === 'edit') {
    await getSupabase()
      .from('pending_posts')
      .update({ state: 'in_edit' })
      .eq('id', pending.id);

    await sendText(from, '✏️ What would you like to change?\n\nCaption: tone, length, angle, language\nImage: say "new image" and describe any style — cinematic, moody, vintage, 3d, anime, watercolour…');

  } else if (buttonId === 'discard') {
    await getSupabase()
      .from('pending_posts')
      .update({ state: 'discarded' })
      .eq('id', pending.id);

    await sendText(from, '🗑️ Post discarded. Send a new message whenever you\'re ready!');
  }
}

async function handleEditRefinement(from: string, pending: any, instruction: string) {
  const isImageRequest = /\b(image|photo|picture|pic|visual|regenerate|new image|different image|change image|swap)\b/i.test(instruction);

  const captionInstruction = instruction
    .replace(/\b(regenerate|change|new|different|swap|avoid|fix)\s*(the\s*)?(image|photo|picture|pic|visual|faces?|blurr\w*)\b/gi, '')
    .replace(/\band\b/gi, '')
    .trim();
  const hasCaptionInstruction = captionInstruction.length > 3;

  if (!isImageRequest && !hasCaptionInstruction) {
    await sendText(from, '✏️ I didn\'t catch that — what would you like to change? Caption, tone, length, or ask for a new image.');
    return;
  }

  const statusParts: string[] = [];
  if (isImageRequest) statusParts.push('image');
  if (hasCaptionInstruction) statusParts.push('caption');
  await sendText(from, `✍️ Updating ${statusParts.join(' & ')}...`);

  const [profileContext, imagePrompt] = await Promise.all([
    hasCaptionInstruction ? getProfileContext() : Promise.resolve(null),
    isImageRequest ? generateImagePrompt(pending.caption) : Promise.resolve(null),
  ]);

  const [newCaption, newImageUrl] = await Promise.all([
    hasCaptionInstruction
      ? refineCaption(pending.caption, captionInstruction, profileContext ?? undefined)
      : Promise.resolve(pending.caption),
    isImageRequest && imagePrompt
      ? Promise.resolve(buildImageUrl(imagePrompt, detectStyle(instruction)))
      : Promise.resolve(pending.image_url),
  ]);

  await getSupabase()
    .from('pending_posts')
    .update({ caption: newCaption, image_url: newImageUrl, state: 'pending_approval' })
    .eq('id', pending.id);

  await sendPostPreview(from, newImageUrl, newCaption);
}
