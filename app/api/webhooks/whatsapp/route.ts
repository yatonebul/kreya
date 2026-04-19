import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateCaption, refineCaption } from '@/lib/caption-generator';
import { publishToInstagram } from '@/lib/instagram-publish';
import { sendText, sendPostPreview } from '@/lib/whatsapp-send';

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN ?? 'kreya_whatsapp_2026';
const DEFAULT_IMAGE_URL = 'https://images.pexels.com/photos/1591447/pexels-photo-1591447.jpeg';
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

  const value = body.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];
  if (!message) return NextResponse.json({ ok: true }); // status update, skip

  const from: string = message.from;
  const messageType: string = message.type;

  try {
    // Button reply (Approve / Edit / Discard)
    if (messageType === 'interactive') {
      const buttonId = message.interactive?.button_reply?.id;
      await handleButtonReply(from, buttonId);
      return NextResponse.json({ ok: true });
    }

    // Text or image message
    if (messageType === 'text' || messageType === 'image') {
      const pending = await getPending(from);

      // User is in edit mode — refine existing caption
      if (pending?.state === 'in_edit' && messageType === 'text') {
        await handleEditRefinement(from, pending, message.text.body);
        return NextResponse.json({ ok: true });
      }

      // New post request — discard any previous pending, generate fresh
      let prompt = '';
      let imageUrl = DEFAULT_IMAGE_URL;

      if (messageType === 'text') {
        prompt = message.text?.body ?? '';
      } else {
        prompt = message.image?.caption ?? 'A beautiful moment captured';
        // WhatsApp image download not yet implemented — uses default image
      }

      // Cancel previous pending posts for this user
      await getSupabase()
        .from('pending_posts')
        .update({ state: 'discarded' })
        .eq('whatsapp_phone', from)
        .in('state', ['pending_approval', 'in_edit']);

      await sendText(from, '✍️ Generating your caption...');

      const profileContext = await getProfileContext();
      const caption = await generateCaption(prompt, profileContext ?? undefined);

      await getSupabase().from('pending_posts').insert({
        whatsapp_phone: from,
        caption,
        image_url: imageUrl,
        state: 'pending_approval',
      });

      await sendPostPreview(from, imageUrl, caption);
      return NextResponse.json({ ok: true });
    }
  } catch (err: any) {
    console.error('[webhook error]', err.message);
    await sendText(from, '⚠️ Something went wrong. Please try again.').catch(() => {});
  }

  return NextResponse.json({ ok: true });
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

    await sendText(from, '✏️ What would you like to change? Just tell me and I\'ll update the caption.');

  } else if (buttonId === 'discard') {
    await getSupabase()
      .from('pending_posts')
      .update({ state: 'discarded' })
      .eq('id', pending.id);

    await sendText(from, '🗑️ Post discarded. Send a new message whenever you\'re ready to create content!');
  }
}

async function handleEditRefinement(from: string, pending: any, instruction: string) {
  const isImageRequest = /\b(image|photo|picture|pic|visual|regenerate|new image|different image|change image|swap image)\b/i.test(instruction);

  if (isImageRequest) {
    await sendText(from, '🖼️ AI image generation is coming soon! I can only edit the caption text for now.\n\nWhat would you like to change about the caption?');
    return;
  }

  await sendText(from, '✍️ Updating your caption...');

  const profileContext = await getProfileContext();
  const newCaption = await refineCaption(pending.caption, instruction, profileContext ?? undefined);

  await getSupabase()
    .from('pending_posts')
    .update({ caption: newCaption, state: 'pending_approval' })
    .eq('id', pending.id);

  await sendPostPreview(from, pending.image_url, newCaption);
}
