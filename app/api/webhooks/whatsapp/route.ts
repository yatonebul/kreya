import { after } from 'next/server';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateCaption, generateCaptionVariants, generateImagePrompt, refineCaption } from '@/lib/caption-generator';
import { learnStyleFromInstagram } from '@/lib/style-memory';
import { publishToInstagram, publishCarouselToInstagram, type CarouselItem } from '@/lib/instagram-publish';
import { sendText, sendPostPreview, sendPostPublishedActions } from '@/lib/whatsapp-send';
import { buildImageUrl, detectStyle } from '@/lib/image-generator';
import { downloadAndHostMedia } from '@/lib/whatsapp-media';
import { transcribeVoice } from '@/lib/transcribe';
import { handleOnboarding, getProfileContextForPhone } from '@/lib/whatsapp-onboarding';
import { hasScheduleIntent, parseScheduleTime, formatScheduleConfirmation } from '@/lib/schedule-parser';
import { adminUrlToken } from '@/lib/session';

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN ?? 'kreya_whatsapp_2026';
const APP_URL      = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kreya-github.vercel.app';
const ADMIN_PHONE  = process.env.ADMIN_WHATSAPP_PHONE ?? '';

// WhatsApp sends phone without '+'; manual DB entries may have '+'. Query both.
function phoneVariants(phone: string): string[] {
  return phone.startsWith('+') ? [phone, phone.slice(1)] : [phone, `+${phone}`];
}

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
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const value   = body?.entry?.[0]?.changes?.[0]?.value;
  const msgType = value?.messages?.[0]?.type ?? 'none';
  const statuses = value?.statuses;
  if (statuses?.length) {
    for (const s of statuses) {
      if (s.status === 'failed') {
        console.error('[WA delivery FAILED] to:', s.recipient_id, 'errors:', JSON.stringify(s.errors));
      } else {
        console.log('[WA delivery]', s.status, 'to:', s.recipient_id);
      }
    }
  } else {
    console.log('[POST] received type:', msgType);
  }
  after(async () => { await processWebhook(body); });
  return NextResponse.json({ ok: true });
}

async function processWebhook(body: any) {
  const value = body.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];
  if (!message) return;

  const from: string = message.from;
  const messageType: string = message.type;
  console.log('[webhook] from:', from, 'type:', messageType);

  try {
    // Admin shortcut — only responds to the configured admin phone
    if (messageType === 'text' && ADMIN_PHONE) {
      const adminPhoneClean = ADMIN_PHONE.replace(/^\+/, '');
      const fromClean       = from.replace(/^\+/, '');
      if (fromClean === adminPhoneClean) {
        const txt = message.text?.body?.trim() ?? '';
        if (/^(\/admin|admin\s*link|admin\s*url|my\s*admin)$/i.test(txt)) {
          const secret   = process.env.ADMIN_SECRET ?? '';
          const token    = adminUrlToken(secret);
          const adminUrl = `${APP_URL}/admin?secret=${token}`;
          await sendText(from, `🔐 *Admin dashboard*\n\n${adminUrl}`);
          return;
        }
      }
    }

    // Onboarding — gate all messages until setup is complete
    if (messageType !== 'interactive') {
      const text = messageType === 'text' ? message.text?.body : undefined;
      const stillOnboarding = await handleOnboarding(from, messageType, text);
      if (stillOnboarding) return;
    }

    // Button replies
    if (messageType === 'interactive') {
      const rawId: string = message.interactive?.button_reply?.id ?? '';
      const colonIdx = rawId.indexOf(':');
      const action = colonIdx >= 0 ? rawId.slice(0, colonIdx) : rawId;
      const postId = colonIdx >= 0 ? rawId.slice(colonIdx + 1) : null;
      await handleButtonReply(from, action, postId);
      return;
    }

    // Text or media messages
    if (['text', 'image', 'video', 'document', 'audio'].includes(messageType)) {
      // Greeting from existing user — show account status instead of generating a post
      if (messageType === 'text' && isGreeting(message.text?.body ?? '')) {
        await handleGreeting(from);
        return;
      }

      // Command shortcuts — bypass pending draft so they always work
      if (messageType === 'text') {
        const txt = message.text?.body ?? '';
        if (isHelpCommand(txt))       { await handleHelp(from);                               return; }
        if (isStatusCheck(txt))       { await handleStatus(from);                             return; }
        if (isCancelScheduled(txt))   { await handleCancelScheduled(from);                    return; }
        if (isLearnStyleCommand(txt)) { await handleLearnStyle(from);                         return; }
        if (isCarouselCommand(txt))   { await handleCarouselStart(from);                      return; }
        const profileEdit = parseProfileUpdate(txt);
        if (profileEdit)              { await handleProfileUpdate(from, profileEdit);          return; }
      }

      // If actively collecting a carousel, route every text/image into the collection flow
      const collecting = await getPostByState(from, 'collecting_carousel');
      if (collecting) {
        if (messageType === 'text') {
          const txt = message.text?.body ?? '';
          if (isCarouselFinishCommand(txt)) { await handleCarouselFinish(from, collecting); return; }
          if (/^cancel/i.test(txt.trim()))  { await handleCarouselCancel(from, collecting); return; }
          await sendText(from, '📸 Send another photo, or type *done* to publish — *cancel* to bail.');
          return;
        }
        if (messageType === 'image') {
          await handleCarouselAppend(from, collecting, message);
          return;
        }
        if (messageType === 'video' || messageType === 'audio' || messageType === 'document') {
          await sendText(from, '🎞️ Carousels are photos only for now — send a JPG/PNG, or type *done* / *cancel*.');
          return;
        }
      }

      // If in edit mode, route to refinement
      const inEdit = await getPostByState(from, 'in_edit');
      if (inEdit) {
        if (messageType === 'text') {
          await handleEditRefinement(from, inEdit, message.text.body);
          return;
        }
        if (['image', 'video', 'document'].includes(messageType)) {
          await handleEditWithNewMedia(from, inEdit, message, messageType);
          return;
        }
      }

      // If a draft is waiting — check for schedule intent first, then offer choice
      const pendingApproval = await getPostByState(from, 'pending_approval');
      if (pendingApproval && messageType === 'text') {
        const text: string = message.text.body;

        // Variant swap — bare "1"/"2"/"3" picks an alternate caption
        const variantPick = text.trim().match(/^([123])$/);
        const variants = pendingApproval.caption_variants as string[] | null;
        if (variantPick && Array.isArray(variants) && variants.length >= Number(variantPick[1])) {
          const idx = Number(variantPick[1]) - 1;
          const newCaption = variants[idx];
          if (newCaption && newCaption !== pendingApproval.caption) {
            await getSupabase()
              .from('pending_posts')
              .update({ caption: newCaption })
              .eq('id', pendingApproval.id);
            await sendPostPreview(from, pendingApproval.image_url, newCaption, pendingApproval.id, pendingApproval.is_video ?? false);
            return;
          }
          if (newCaption === pendingApproval.caption) {
            await sendText(from, `That's already the active caption — tap *Approve* to post, or reply with the other number to swap.`);
            return;
          }
        }

        if (hasScheduleIntent(text)) {
          const scheduleTime = await parseScheduleTime(text);
          if (scheduleTime && scheduleTime > new Date()) {
            await getSupabase().from('pending_posts')
              .update({ state: 'scheduled', scheduled_for: scheduleTime.toISOString() })
              .eq('id', pendingApproval.id);
            await sendText(from, `🗓️ Scheduled for ${formatScheduleConfirmation(scheduleTime)}. I'll post it automatically.`);
            return;
          }
        }
        // Show draft with clear instructions — user must explicitly discard to start fresh
        await sendText(from, '👆 You have an unfinished post. Tap *Discard* to start a new one, or *Approve* to post this:');
        await sendPostPreview(from, pendingApproval.image_url, pendingApproval.caption, pendingApproval.id, pendingApproval.is_video ?? false);
        return;
      }

      // For media (image/video/audio): auto-discard any stale pending drafts before creating new
      if (['image', 'video', 'audio', 'document'].includes(messageType) && pendingApproval) {
        await getSupabase().from('pending_posts').update({ state: 'discarded' }).eq('id', pendingApproval.id);
        if (pendingApproval.sibling_id) {
          await getSupabase().from('pending_posts').update({ state: 'discarded' }).eq('id', pendingApproval.sibling_id);
        }
      }

      await handleNewPost(from, message, messageType);
    }
  } catch (err: any) {
    console.error('[webhook error]', err.message);
    const msg = err.userFacing ? err.message : '⚠️ Something went wrong. Please try again.';
    await sendText(from, msg).catch(() => {});
  }
}

async function handleNewPost(from: string, message: any, messageType: string) {
  const isVideo = messageType === 'video';
  const isDocument = messageType === 'document';
  const isUserMedia = messageType === 'image' || isVideo || isDocument;

  let prompt = '';
  let userMediaUrl: string | null = null;

  if (isUserMedia) {
    const media = message.image ?? message.video ?? message.document;
    const mediaId = media?.id;
    const mimeType = media?.mime_type ?? (isVideo ? 'video/mp4' : 'image/jpeg');
    prompt = (message.image?.caption ?? message.video?.caption ?? message.document?.caption ?? '').trim();

    const mediaLabel = isVideo ? 'video' : 'photo';
    await sendText(from, `📥 Processing your ${mediaLabel}...`);
    console.log('[webhook] mediaId:', mediaId, 'mimeType:', mimeType);
    try {
      userMediaUrl = await downloadAndHostMedia(mediaId, mimeType);
      console.log('[webhook] userMediaUrl:', userMediaUrl);
    } catch (err: any) {
      throw Object.assign(
        new Error(`📎 Couldn't download your ${mediaLabel} — please try sending it again.`),
        { userFacing: true }
      );
    }
  } else if (messageType === 'audio') {
    const mediaId = message.audio?.id;
    const mimeType = message.audio?.mime_type ?? 'audio/ogg';
    await sendText(from, '🎙️ Transcribing your voice note...');
    try {
      prompt = await transcribeVoice(mediaId, mimeType);
    } catch {
      throw Object.assign(new Error('🎙️ Couldn\'t transcribe your voice note — please try again.'), { userFacing: true });
    }
    await sendText(from, '✍️ Creating your post...');
  } else {
    prompt = message.text?.body ?? '';
    await sendText(from, '✍️ Generating your post...');
  }

  const wantsAiAlso = isUserMedia && !isVideo && !isDocument &&
    /\b(also.?generate|ai.?version|generate.?too|ai.?image.?too|both)\b/i.test(prompt);

  const [profileContext, recentCaptions, imagePromptText] = await Promise.all([
    getProfileContextForPhone(from),
    getRecentCaptions(),
    !isUserMedia || wantsAiAlso ? generateImagePrompt(prompt || 'creative visual') : Promise.resolve(null),
  ]);
  const captionPrompt = prompt || (isVideo
    ? '[No description — write a punchy, original caption for a video post. Do not reference any specific product, topic or theme from recent posts.]'
    : '[No description — write a punchy, original caption for a photo post. Do not reference any specific product, topic or theme from recent posts.]');

  // Sibling AI flow shares one caption across both posts; variants only in the standard single-post flow.
  const variants = wantsAiAlso
    ? [await generateCaption(captionPrompt, profileContext ?? undefined, recentCaptions)]
    : await generateCaptionVariants(captionPrompt, profileContext ?? undefined, recentCaptions);
  const caption = variants[0] ?? '';

  const imageUrl = userMediaUrl ?? buildImageUrl(imagePromptText!, 'realistic');

  // Discard any stale pending_approval before creating new post
  const { data: staleDrafts } = await getSupabase()
    .from('pending_posts').select('id, sibling_id').eq('whatsapp_phone', from).eq('state', 'pending_approval');
  for (const d of staleDrafts ?? []) {
    await getSupabase().from('pending_posts').update({ state: 'discarded' }).eq('id', d.id);
    if (d.sibling_id) await getSupabase().from('pending_posts').update({ state: 'discarded' }).eq('id', d.sibling_id);
  }

  // Create the primary post
  const { data: primaryPost } = await getSupabase()
    .from('pending_posts')
    .insert({
      whatsapp_phone: from,
      caption,
      image_url: imageUrl,
      user_image_url: userMediaUrl,
      image_source: userMediaUrl ? 'user' : 'ai',
      is_video: isVideo,
      state: 'pending_approval',
    })
    .select('id')
    .single();

  if (!primaryPost) return;

  // Store variants for later swap (graceful: if column not yet migrated, the
  // update fails silently and the user just won't see the swap follow-up).
  if (variants.length > 1) {
    const { error: variantsErr } = await getSupabase()
      .from('pending_posts')
      .update({ caption_variants: variants })
      .eq('id', primaryPost.id);
    if (variantsErr) console.warn('[caption_variants update]', variantsErr.message);
  }

  // If user sent a photo AND asked for AI version — generate sibling post
  if (wantsAiAlso && imagePromptText) {
    const aiImageUrl = buildImageUrl(imagePromptText, 'realistic');
    const { data: aiPost } = await getSupabase()
      .from('pending_posts')
      .insert({
        whatsapp_phone: from,
        caption,
        image_url: aiImageUrl,
        image_source: 'ai',
        is_video: false,
        sibling_id: primaryPost.id,
        state: 'pending_approval',
      })
      .select('id')
      .single();

    if (aiPost) {
      await getSupabase().from('pending_posts').update({ sibling_id: aiPost.id }).eq('id', primaryPost.id);
      await sendText(from, '📸 Your photo version:');
      await sendPostPreview(from, imageUrl, caption, primaryPost.id);
      await sendText(from, '🤖 AI-generated version:');
      await sendPostPreview(from, aiImageUrl, caption, aiPost.id);
      await sendText(from, 'Approve the one you want to post. The other will be discarded.');
      return;
    }
  }

  await sendPostPreview(from, imageUrl, caption, primaryPost.id, isVideo);

  if (variants.length > 1) {
    const others = variants.slice(1).map((v, i) => {
      const trimmed = v.length > 140 ? v.slice(0, 140).trimEnd() + '…' : v;
      return `*${i + 2}.* ${trimmed}`;
    }).join('\n\n');
    await sendText(from, `💡 Try a different angle — reply *2* or *3* to swap the caption:\n\n${others}`);
  }
}

async function getPostById(id: string) {
  const { data } = await getSupabase().from('pending_posts').select('*').eq('id', id).maybeSingle();
  return data;
}

async function getPostByState(phone: string, state: string) {
  const { data } = await getSupabase()
    .from('pending_posts').select('*')
    .eq('whatsapp_phone', phone).eq('state', state)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  return data;
}

async function getRecentCaptions(): Promise<string[]> {
  const { data } = await getSupabase()
    .from('pending_posts').select('caption').eq('state', 'published')
    .order('created_at', { ascending: false }).limit(5);
  return data?.map(r => r.caption) ?? [];
}

async function handleButtonReply(from: string, action: string, postId: string | null) {
  // Engagement-loop actions sent after publish — no pending post is required.
  if (action === 'next_post') {
    await sendText(from, "✨ I'm ready — voice-note, photo, or one line and I'll write your next post.");
    return;
  }
  if (action === 'schedule_next') {
    await sendText(
      from,
      "📅 Send your next draft, then reply with a time:\n\n• \"post tomorrow at 9am\"\n• \"schedule for Friday 3pm\"\n• \"best time this week\"",
    );
    return;
  }
  if (action === 'refresh_voice') {
    await handleLearnStyle(from);
    return;
  }

  const post = postId ? await getPostById(postId) : await getPostByState(from, 'pending_approval');

  if (!post) {
    await sendText(from, 'No pending post found. Send me a message to create a new post! 💬');
    return;
  }

  if (action === 'approve') {
    // Guard: ensure user has Instagram connected before publishing
    const { data: igAccount } = await getSupabase()
      .from('instagram_accounts')
      .select('account_name')
      .in('whatsapp_phone', phoneVariants(from))
      .eq('is_active', true)
      .maybeSingle();

    if (!igAccount) {
      const connectUrl = `${APP_URL}/api/auth/instagram?phone=${encodeURIComponent(from)}`;
      await sendText(from, `📸 Connect your Instagram first:\n\n${connectUrl}\n\nOnce connected, tap *Approve* again.`);
      return;
    }

    const carouselItems: CarouselItem[] | null = Array.isArray(post.media_items) ? post.media_items : null;
    const isCarousel = carouselItems !== null && carouselItems.length > 1;

    await sendText(from, isCarousel ? `⏳ Publishing carousel (${carouselItems.length} slides)...` : '⏳ Publishing to Instagram...');
    let result;
    try {
      result = isCarousel
        ? await publishCarouselToInstagram(from, post.caption, carouselItems)
        : await publishToInstagram(from, post.caption, post.image_url, post.is_video ?? false);
    } catch (err: any) {
      if (err.message?.startsWith('INSTAGRAM_TOKEN_EXPIRED')) {
        const reconnectUrl = `${APP_URL}/api/auth/instagram?phone=${encodeURIComponent(from)}`;
        await sendText(from, `🔑 Your Instagram access expired.\n\nReconnect here:\n${reconnectUrl}\n\nThen tap *Approve* again to post.`);
        return;
      }
      throw err;
    }

    await getSupabase().from('pending_posts')
      .update({
        state: 'published',
        ig_post_id: result.postId,
        ig_post_url: result.postUrl ?? null,
        published_at: new Date().toISOString(),
      })
      .eq('id', post.id);

    if (post.sibling_id) {
      await getSupabase().from('pending_posts').update({ state: 'discarded' }).eq('id', post.sibling_id);
    }

    const postLabel = post.is_video ? 'video' : 'post';
    await sendPostPublishedActions(from, result.postUrl ?? undefined, postLabel);

  } else if (action === 'edit') {
    await getSupabase().from('pending_posts')
      .update({ state: 'pending_approval' })
      .eq('whatsapp_phone', from).eq('state', 'in_edit').neq('id', post.id);

    await getSupabase().from('pending_posts').update({ state: 'in_edit' }).eq('id', post.id);

    const isVideoPost = !!post.is_video;
    const hasUserPhoto = !!post.user_image_url && !isVideoPost;
    const editMsg = isVideoPost
      ? '✏️ What would you like to change?\n\nCaption: tone, length, angle, language\nVideo: send a new video to replace it'
      : '✏️ What would you like to change?\n\nCaption: tone, length, angle, language\nImage: say "new image" + any style (cinematic, moody, 3d, anime…)' +
        (hasUserPhoto ? '\n\nSay "use my photo" to revert to your uploaded image.' : '');
    await sendText(from, editMsg);

  } else if (action === 'discard') {
    await getSupabase().from('pending_posts').update({ state: 'discarded' }).eq('id', post.id);
    if (post.sibling_id) {
      await getSupabase().from('pending_posts').update({ state: 'discarded' }).eq('id', post.sibling_id);
    }
    await sendText(from, '🗑️ Post discarded. Send a new message whenever you\'re ready!');
  }
}

async function handleEditRefinement(from: string, pending: any, instruction: string) {
  const isImageRequest = /\b(image|photo|picture|pic|visual|regenerate|new image|different image|change image|swap)\b/i.test(instruction);
  const isRevertPhoto = !!pending.user_image_url &&
    /\b(use my photo|my photo|my image|original|uploaded|revert)\b/i.test(instruction);

  // Revert to user's uploaded photo
  if (isRevertPhoto) {
    await getSupabase().from('pending_posts')
      .update({ image_url: pending.user_image_url, image_source: 'user', state: 'pending_approval' })
      .eq('id', pending.id);
    const updated = await getPostById(pending.id);
    if (updated) await sendPostPreview(from, updated.image_url, updated.caption, updated.id, pending.is_video ?? false);
    return;
  }

  const captionInstruction = instruction
    .replace(/\b(edit|update|regenerate|change|new|different|swap|avoid|fix|redo|create|generate|make)\s*(the\s*)?(image|photo|picture|pic|visual|faces?|blurr\w*)\b/gi, '')
    .replace(/\b(edit|update|redo)\b/gi, '')  // remove leftover action verbs with no caption target
    .replace(/\band\b/gi, '')
    .trim();
  const hasCaptionInstruction = captionInstruction.length > 3;

  if (!isImageRequest && !hasCaptionInstruction) {
    await sendText(from, '✏️ I didn\'t catch that — what would you like to change?');
    return;
  }

  const statusParts: string[] = [];
  if (isImageRequest) statusParts.push('image');
  if (hasCaptionInstruction) statusParts.push('caption');
  await sendText(from, `✍️ Updating ${statusParts.join(' & ')}...`);

  const [profileContext, imagePrompt] = await Promise.all([
    hasCaptionInstruction ? getProfileContextForPhone(from) : Promise.resolve(null),
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

  const newSource = isImageRequest ? 'ai' : pending.image_source;

  const { data: updated } = await getSupabase()
    .from('pending_posts')
    .update({ caption: newCaption, image_url: newImageUrl, image_source: newSource, state: 'pending_approval' })
    .eq('id', pending.id)
    .select('id')
    .single();

  if (updated?.id) {
    if (isImageRequest && pending.user_image_url) {
      await sendText(from, '💡 Switched to AI image. Say "use my photo" to revert.');
    }
    await sendPostPreview(from, newImageUrl, newCaption, updated.id, pending.is_video ?? false);
  }
}

async function handleEditWithNewMedia(from: string, pending: any, message: any, messageType: string) {
  const isVideo = messageType === 'video';
  const media = message.image ?? message.video ?? message.document;
  const mediaId = media?.id;
  const mimeType = media?.mime_type ?? (isVideo ? 'video/mp4' : 'image/jpeg');

  await sendText(from, `📥 Processing your ${isVideo ? 'video' : 'photo'}...`);
  let userMediaUrl: string;
  try {
    userMediaUrl = await downloadAndHostMedia(mediaId, mimeType);
  } catch {
    throw Object.assign(new Error(`📎 Couldn't download your photo — please try again.`), { userFacing: true });
  }

  const { data: updated } = await getSupabase()
    .from('pending_posts')
    .update({ image_url: userMediaUrl, user_image_url: userMediaUrl, image_source: 'user', is_video: isVideo, state: 'pending_approval' })
    .eq('id', pending.id)
    .select('id')
    .single();

  if (updated?.id) {
    await sendPostPreview(from, userMediaUrl, pending.caption, updated.id, isVideo);
  }
}

function isGreeting(text: string): boolean {
  return /^(hi|hello|hey|hola|yo|sup|howdy|greetings|ciao|start)([\s,!.]*kreya)?[!.?,\s]*$/i.test(text.trim());
}

function isHelpCommand(text: string): boolean {
  return /^(help|\/help|\?|commands|what can you do|how does this work)[!?.\s]*$/i.test(text.trim());
}

function isStatusCheck(text: string): boolean {
  return /\b(status|what.*pending|what.*scheduled|my posts|my queue|queue|upcoming)\b/i.test(text.trim());
}

function isCancelScheduled(text: string): boolean {
  return /\b(cancel|remove|delete|discard)\s+(my\s+)?(next\s+)?(scheduled|upcoming)\s*(post)?\b/i.test(text.trim());
}

function isLearnStyleCommand(text: string): boolean {
  return /^(\/style|learn\s+(my\s+)?(voice|style|tone)|refresh\s+(my\s+)?(voice|style|tone)|update\s+(my\s+)?(voice|style))[!?.\s]*$/i.test(text.trim());
}

function isCarouselCommand(text: string): boolean {
  return /^(\/carousel|carousel|new\s+carousel|start\s+carousel)[!?.\s]*$/i.test(text.trim());
}

function isCarouselFinishCommand(text: string): boolean {
  return /^(done|finish|finalize|ready|publish|that['’]?s\s+all)[!?.\s]*$/i.test(text.trim());
}

type ProfileField = { field: 'brand_name' | 'niche' | 'tone'; value: string };

function parseProfileUpdate(text: string): ProfileField | null {
  const t = text.trim();
  let m: RegExpMatchArray | null;
  m = t.match(/\b(?:change|update|set)\s+(?:my\s+)?(?:brand[\s-]?name|name)\s+to\s+(.+)/i);
  if (m) return { field: 'brand_name', value: m[1].trim() };
  m = t.match(/\b(?:change|update|set)\s+(?:my\s+)?(?:tone|voice|style|writing style)\s+to\s+(.+)/i);
  if (m) return { field: 'tone', value: m[1].trim() };
  m = t.match(/\b(?:change|update|set)\s+(?:my\s+)?niche\s+to\s+(.+)/i);
  if (m) return { field: 'niche', value: m[1].trim() };
  return null;
}

async function handleHelp(from: string) {
  const accountUrl = `${APP_URL}/account?phone=${encodeURIComponent(from)}`;
  await sendText(from,
    `🤖 *Here's what I can do:*\n\n` +
    `📸 *Create a post*\nSend any text, photo, video, or voice note — I write the caption and prepare your post for review.\n\n` +
    `🎞️ *Carousel*\nSend: */carousel* — then drop 2–10 photos and type *done*.\n\n` +
    `✅ *Approve / Edit / Discard*\nAfter each draft, tap the buttons to publish, refine, or bin it.\n\n` +
    `🗓️ *Schedule*\nWhile a draft is waiting, reply with a time:\n"Post tomorrow at 9am" · "Schedule for Friday 3pm"\n\n` +
    `✏️ *Edit your profile*\n"Change my tone to casual"\n"Update niche to fitness"\n"Set brand name to ..."\n\n` +
    `📊 *Check your queue*\nSend: *status*\n\n` +
    `🚫 *Cancel a scheduled post*\nSend: *cancel scheduled*\n\n` +
    `🧠 *Refresh my voice*\nSend: *learn my style* — I'll re-read your last 50 IG captions and match your tone better.\n\n` +
    `🔗 *Web dashboard*\n${accountUrl}`
  );
}

async function handleStatus(from: string) {
  const supabase = getSupabase();
  const { data: posts } = await supabase
    .from('pending_posts')
    .select('state, caption, scheduled_for')
    .eq('whatsapp_phone', from)
    .in('state', ['pending_approval', 'in_edit', 'scheduled'])
    .order('created_at', { ascending: false });

  if (!posts?.length) {
    await sendText(from, '✅ Queue is clear — no pending or scheduled posts.\n\nSend me a message, photo, or voice note to create one!');
    return;
  }

  const lines = posts.map(p => {
    const preview = p.caption ? p.caption.slice(0, 60) + (p.caption.length > 60 ? '…' : '') : '(no caption)';
    if (p.state === 'scheduled' && p.scheduled_for) {
      const when = new Date(p.scheduled_for).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Prague' });
      return `🗓️ *Scheduled for ${when}*\n${preview}`;
    }
    if (p.state === 'pending_approval') return `⏳ *Needs your approval*\n${preview}`;
    if (p.state === 'in_edit')         return `✏️ *In edit*\n${preview}`;
    return `• ${preview}`;
  });

  await sendText(from, `📋 *Your queue (${posts.length})*\n\n${lines.join('\n\n')}`);
}

async function handleLearnStyle(from: string) {
  const { data: account } = await getSupabase()
    .from('instagram_accounts')
    .select('instagram_user_id, access_token, account_name')
    .in('whatsapp_phone', phoneVariants(from))
    .eq('is_active', true)
    .maybeSingle();

  if (!account?.access_token || !account.instagram_user_id) {
    const connectUrl = `${APP_URL}/api/auth/instagram?phone=${encodeURIComponent(from)}`;
    await sendText(from, `📸 Connect Instagram first so I can read your past captions:\n\n${connectUrl}`);
    return;
  }

  await sendText(from, `🧠 Reading your last 50 captions from *@${account.account_name}* to learn your voice...`);
  const result = await learnStyleFromInstagram(from, account.instagram_user_id, account.access_token);
  if (result.ok) {
    await sendText(from, `✨ Voice updated — analyzed ${result.captionsFound} past captions. Your next post will sound more like you.`);
  } else if (result.captionsFound < 3) {
    await sendText(from, `🤔 I need at least 3 captions to learn from. *@${account.account_name}* has ${result.captionsFound} so far — post a few more, then try again.`);
  } else {
    await sendText(from, `⚠️ Couldn't update your voice profile right now — try again in a minute.`);
  }
}

async function handleCarouselStart(from: string) {
  const supabase = getSupabase();
  // Discard any existing pending draft so the collection lane is clean
  const { data: stale } = await supabase
    .from('pending_posts').select('id, sibling_id')
    .eq('whatsapp_phone', from)
    .in('state', ['pending_approval', 'in_edit', 'collecting_carousel']);
  for (const d of stale ?? []) {
    await supabase.from('pending_posts').update({ state: 'discarded' }).eq('id', d.id);
    if (d.sibling_id) await supabase.from('pending_posts').update({ state: 'discarded' }).eq('id', d.sibling_id);
  }

  await supabase.from('pending_posts').insert({
    whatsapp_phone: from,
    state: 'collecting_carousel',
    media_items: [],
    caption: '',
  });

  await sendText(
    from,
    "🎞️ *Carousel mode*\n\nSend 2–10 photos one by one. Type *done* when you're ready, or *cancel* to bail.",
  );
}

async function handleCarouselAppend(from: string, post: { id: string; media_items: CarouselItem[] | null }, message: { image?: { id?: string; mime_type?: string } }) {
  const items: CarouselItem[] = post.media_items ?? [];
  if (items.length >= 10) {
    await sendText(from, "⚠️ Carousels max out at 10 photos. Type *done* to publish what you've got.");
    return;
  }

  const mediaId = message.image?.id;
  const mimeType = message.image?.mime_type ?? 'image/jpeg';
  if (!mediaId) {
    await sendText(from, '📎 Couldn\'t read that photo — try sending it again.');
    return;
  }

  let url: string;
  try {
    url = await downloadAndHostMedia(mediaId, mimeType);
  } catch {
    await sendText(from, '📎 Couldn\'t download that photo — try again.');
    return;
  }

  const next = [...items, { url, is_video: false }];
  await getSupabase()
    .from('pending_posts')
    .update({ media_items: next })
    .eq('id', post.id);

  const remaining = 10 - next.length;
  const tail = remaining === 0
    ? 'That\'s the max — type *done* to publish.'
    : remaining === 1
      ? 'Room for 1 more, or type *done* to publish.'
      : `Send up to ${remaining} more, or type *done* to publish.`;
  await sendText(from, `✅ Photo *${next.length}* added. ${tail}`);
}

async function handleCarouselFinish(from: string, post: { id: string; media_items: CarouselItem[] | null }) {
  const items: CarouselItem[] = post.media_items ?? [];
  if (items.length < 2) {
    await sendText(from, '⚠️ A carousel needs at least 2 photos. Send another, or type *cancel*.');
    return;
  }

  await sendText(from, '✍️ Writing caption for your carousel…');

  const [profileContext, recentCaptions] = await Promise.all([
    getProfileContextForPhone(from),
    getRecentCaptions(),
  ]);
  const variants = await generateCaptionVariants(
    `[Carousel of ${items.length} photos. Write a single caption that frames the whole set; do not number or itemize each slide.]`,
    profileContext ?? undefined,
    recentCaptions,
  );
  const caption = variants[0] ?? '';

  await getSupabase()
    .from('pending_posts')
    .update({
      state: 'pending_approval',
      caption,
      image_url: items[0].url,
    })
    .eq('id', post.id);

  if (variants.length > 1) {
    const { error } = await getSupabase()
      .from('pending_posts')
      .update({ caption_variants: variants })
      .eq('id', post.id);
    if (error) console.warn('[caption_variants update]', error.message);
  }

  await sendText(from, `🎞️ Carousel ready — *${items.length} slides*. First slide previewed below.`);
  await sendPostPreview(from, items[0].url, caption, post.id, false);

  if (variants.length > 1) {
    const others = variants.slice(1).map((v, i) => {
      const trimmed = v.length > 140 ? v.slice(0, 140).trimEnd() + '…' : v;
      return `*${i + 2}.* ${trimmed}`;
    }).join('\n\n');
    await sendText(from, `💡 Try a different angle — reply *2* or *3* to swap the caption:\n\n${others}`);
  }
}

async function handleCarouselCancel(from: string, post: { id: string }) {
  await getSupabase().from('pending_posts').update({ state: 'discarded' }).eq('id', post.id);
  await sendText(from, '🗑️ Carousel cancelled.');
}

async function handleCancelScheduled(from: string) {
  const { data: post } = await getSupabase()
    .from('pending_posts')
    .select('id, caption, scheduled_for')
    .eq('whatsapp_phone', from)
    .eq('state', 'scheduled')
    .order('scheduled_for', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!post) {
    await sendText(from, '📭 No scheduled posts to cancel.');
    return;
  }

  await getSupabase().from('pending_posts').update({ state: 'discarded' }).eq('id', post.id);
  const preview = post.caption?.slice(0, 60) ?? '';
  const when = post.scheduled_for
    ? new Date(post.scheduled_for).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Prague' })
    : '';
  await sendText(from, `🗑️ Cancelled the post scheduled for ${when}:\n"${preview}…"\n\nSend a new message whenever you're ready.`);
}

async function handleProfileUpdate(from: string, edit: ProfileField) {
  const supabase = getSupabase();
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('brand_name, niche, tone')
    .eq('whatsapp_phone', from)
    .maybeSingle();

  if (!profile) {
    await sendText(from, "⚠️ I couldn't find your profile. Complete your onboarding first.");
    return;
  }

  await supabase.from('user_profiles').update({ [edit.field]: edit.value }).eq('whatsapp_phone', from);

  const labels: Record<ProfileField['field'], string> = { brand_name: 'Brand name', niche: 'Niche', tone: 'Tone' };
  await sendText(from, `✅ *${labels[edit.field]} updated*\n\nNew value: *${edit.value}*\n\nYour next post will reflect this change.`);
}

async function handleGreeting(from: string) {
  const supabase = getSupabase();

  const [{ data: profile }, { data: igAccount }] = await Promise.all([
    supabase.from('user_profiles').select('brand_name').eq('whatsapp_phone', from).maybeSingle(),
    supabase.from('instagram_accounts').select('account_name, token_expires_at').in('whatsapp_phone', phoneVariants(from)).eq('is_active', true).maybeSingle(),
  ]);

  const name = profile?.brand_name ?? 'there';
  const connectUrl = `${APP_URL}/api/auth/instagram?phone=${encodeURIComponent(from)}`;

  let igLine: string;
  if (igAccount) {
    const days = Math.ceil((new Date(igAccount.token_expires_at).getTime() - Date.now()) / 86_400_000);
    igLine = days > 7
      ? `📸 Instagram: *@${igAccount.account_name}* ✓\nWant to switch accounts? ${connectUrl}`
      : `📸 Instagram: *@${igAccount.account_name}* ⚠️ Token expires in ${days}d\nRenew: ${connectUrl}`;
  } else {
    igLine = `📸 Instagram: *not connected*\nConnect here: ${connectUrl}`;
  }

  await sendText(
    from,
    `👋 Hey *${name}*!\n\n${igLine}\n\n🔗 Your account: ${APP_URL}/account?phone=${encodeURIComponent(from)}\n\nSend me a message, photo, video, or voice note to create your next post.`
  );
}
