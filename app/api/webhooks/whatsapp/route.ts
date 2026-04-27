import { after } from 'next/server';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateCaption, generateCaptionVariants, generateImagePrompt, refineCaption, generateCarouselSpin, generateReelScriptSpin, generateStorySpin } from '@/lib/caption-generator';
import { learnStyleFromInstagram } from '@/lib/style-memory';
import { publishToInstagram, publishCarouselToInstagram, publishStoryToInstagram, postCommentReply, type CarouselItem } from '@/lib/instagram-publish';
import { sendText, sendPostPreview, sendPostPublishedActions, sendBrandSuggestion, sendRepurposeOffer, sendScheduledActions } from '@/lib/whatsapp-send';
import { buildImageUrl, buildBrandedImage, detectStyle } from '@/lib/image-generator';
import { downloadAndHostMedia } from '@/lib/whatsapp-media';
import { transcribeVoice } from '@/lib/transcribe';
import { handleOnboarding } from '@/lib/whatsapp-onboarding';
import { getProfileContextForPhone, updateActiveBrandProfile } from '@/lib/brand-profile';
import { hasScheduleIntent, parseScheduleTime, formatScheduleConfirmation } from '@/lib/schedule-parser';
import { adminUrlToken, createWaMagicToken } from '@/lib/session';

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

    // Button replies AND list replies — both surface here as type=interactive.
    // WA wraps them differently (button_reply vs list_reply) but the id we
    // encoded is structurally identical, so the rest of the routing is shared.
    if (messageType === 'interactive') {
      const rawId: string =
        message.interactive?.button_reply?.id ??
        message.interactive?.list_reply?.id ??
        '';
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
        if (isAccountsCommand(txt))   { await handleListAccounts(from);                       return; }
        const useHandle = parseUseAccountCommand(txt);
        if (useHandle)                { await handleUseAccount(from, useHandle);               return; }
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
            await sendScheduledActions(from, formatScheduleConfirmation(scheduleTime));
            return;
          }
        }
        // Show draft with clear instructions — user must explicitly discard to start fresh
        await sendText(from, '👆 Still got a draft on the line — tap *Approve* to post it, or *Discard* to start fresh:');
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
  // Surface routing: any video → Reels (IG no longer has standalone Feed
  // video). Photos and AI-generated images stay on Feed.
  const surface: 'feed' | 'reels' = isVideo ? 'reels' : 'feed';

  const captionPrompt = prompt || (isVideo
    ? '[No description — write a punchy, original Reel caption. Do not reference any specific product, topic or theme from recent posts.]'
    : '[No description — write a punchy, original caption for a photo post. Do not reference any specific product, topic or theme from recent posts.]');

  // Sibling AI flow shares one caption across both posts; variants only in the standard single-post flow.
  const variants = wantsAiAlso
    ? [await generateCaption(captionPrompt, profileContext ?? undefined, recentCaptions, surface)]
    : await generateCaptionVariants(captionPrompt, profileContext ?? undefined, recentCaptions, surface);
  const caption = variants[0] ?? '';

  const imageUrl = userMediaUrl ?? await buildBrandedImage(imagePromptText!, 'realistic', from);

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
      surface,
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
    const aiImageUrl = await buildBrandedImage(imagePromptText, 'realistic', from);
    const { data: aiPost } = await getSupabase()
      .from('pending_posts')
      .insert({
        whatsapp_phone: from,
        caption,
        image_url: aiImageUrl,
        image_source: 'ai',
        is_video: false,
        surface: 'feed',
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
  if (action === 'visit_dashboard') {
    await handleDashboardLink(from);
    return;
  }
  if (action === 'refresh_voice') {
    await handleLearnStyle(from);
    return;
  }
  if (action === 'apply_brand') {
    // postId here is "<encoded-niche>:<encoded-tone>" — decoded into updates.
    const [encNiche, encTone] = (postId ?? '').split(':');
    const niche = encNiche ? decodeURIComponent(encNiche) : undefined;
    const tone  = encTone  ? decodeURIComponent(encTone)  : undefined;
    if (!niche && !tone) {
      await sendText(from, "Hmm, I couldn't read the suggestion. Try /refresh voice and I'll send a new one.");
      return;
    }
    const result = await updateActiveBrandProfile(from, {
      ...(niche ? { niche } : {}),
      ...(tone  ? { tone  } : {}),
    });
    if (!result.ok) {
      await sendText(from, `Couldn't update brand profile: ${result.error ?? 'unknown error'}.`);
      return;
    }
    const target = result.account_name ? `@${result.account_name}` : 'your profile';
    const summary = [niche && `niche → *${niche}*`, tone && `tone → *${tone}*`].filter(Boolean).join('\n• ');
    await sendText(from, `✅ Updated ${target}:\n\n• ${summary}\n\nFuture captions will follow this. Type *brand* to view or edit.`);
    return;
  }
  if (action === 'skip_brand_update') {
    await sendText(from, "👌 Got it — keeping your brand profile as-is. You can always edit it on /account or with `set niche=...`.");
    return;
  }
  if (action === 'spin_skip') {
    await sendText(from, "👌 Got it. Send another voice note whenever you're ready for the next post.");
    return;
  }
  if (action === 'schedule' && postId) {
    // The post stays in pending_approval. The user replies with a time
    // ("tomorrow at 9am", "Friday 3pm") and the existing text-message
    // schedule-intent parser at the top of the webhook flips state to
    // 'scheduled' and confirms.
    await sendText(
      from,
      `📅 *When should I post it?*\n\nReply with a time, e.g.:\n• "tomorrow at 9am"\n• "Friday 3pm"\n• "in 2 hours"\n\nOr tap a draft option again to approve / edit / discard.`,
    );
    return;
  }
  if (action === 'spin_carousel' && postId) {
    await handleSpinCarousel(from, postId);
    return;
  }
  if (action === 'spin_reel' && postId) {
    await handleSpinReelScript(from, postId);
    return;
  }
  if (action === 'spin_story' && postId) {
    await handleSpinStory(from, postId);
    return;
  }
  if (action === 'comment_send' && postId) {
    await handleCommentSend(from, postId);
    return;
  }
  if (action === 'comment_skip' && postId) {
    await handleCommentSkip(from, postId);
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
    const isStory = post.surface === 'story';
    const postSurface: 'feed' | 'reels' = post.surface === 'reels' ? 'reels' : (post.is_video ? 'reels' : 'feed');

    await sendText(
      from,
      isCarousel
        ? `⏳ Publishing carousel (${carouselItems.length} slides)...`
        : isStory
          ? '⏳ Publishing to your Story...'
          : postSurface === 'reels'
            ? '⏳ Publishing your Reel to Instagram...'
            : '⏳ Publishing to Instagram...',
    );
    let result;
    try {
      result = isCarousel
        ? await publishCarouselToInstagram(from, post.caption, carouselItems)
        : isStory
          ? await publishStoryToInstagram(from, post.image_url, post.is_video ?? false)
          : await publishToInstagram(from, post.caption, post.image_url, post.is_video ?? false, postSurface);
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

    const postLabel = isCarousel
      ? 'carousel'
      : isStory
        ? 'Story'
        : postSurface === 'reels'
          ? 'Reel'
          : 'post';
    await sendPostPublishedActions(from, result.postUrl ?? undefined, postLabel);

    // Phase B repurpose offer — spin the same idea into another surface
    // so the creator can multiply one voice note into a week of content.
    // Stories already are the spin destination, so we don't double-offer.
    if (!isStory) {
      const sourceSurface: 'feed' | 'reels' | 'carousel' = isCarousel ? 'carousel' : postSurface;
      await sendRepurposeOffer(from, post.id, sourceSurface).catch(() => {});
    }

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
      ? buildBrandedImage(imagePrompt, detectStyle(instruction), from)
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

function isAccountsCommand(text: string): boolean {
  return /^(\/accounts|accounts|my\s+accounts|list\s+accounts|connected\s+accounts)[!?.\s]*$/i.test(text.trim());
}

function parseUseAccountCommand(text: string): string | null {
  const m = text.trim().match(/^(?:\/use|use|switch\s+to|post\s+as)\s+@?([A-Za-z0-9._-]+)[!?.\s]*$/i);
  return m ? m[1].trim() : null;
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
    `🤖 *Kreya commands*\n\n` +
    `*✨ Create*\n` +
    `🎙️ Voice note, photo, video, or one line → I draft the caption.\n` +
    `🎞️ */carousel* → drop 2–10 photos, then *done*.\n` +
    `🧠 */style* → re-read your last 50 IG captions to refresh my tone.\n\n` +
    `*📝 On a draft*\n` +
    `Tap ✅ Approve · ✏️ Edit · 🗑️ Discard.\n` +
    `Reply *1*, *2*, *3* to swap caption variant.\n` +
    `"Post tomorrow at 9am" / "Friday 3pm" → schedule it.\n\n` +
    `*🛠️ Manage*\n` +
    `*status* — see your queue.\n` +
    `*accounts* — list connected Instagram accounts.\n` +
    `*use @handle* — switch which account I post to.\n` +
    `*cancel scheduled* — drop the next scheduled post.\n` +
    `"Change my tone to casual" / "Update niche to fitness" / "Set brand name to ..."\n\n` +
    `🔗 ${accountUrl}`
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
    if (result.suggestedNiche || result.suggestedTone) {
      await sendBrandSuggestion(
        from,
        result.account ?? account.account_name,
        result.suggestedNiche,
        result.suggestedTone,
      ).catch(() => {});
    }
  } else if (result.captionsFound < 3) {
    await sendText(from, `🤔 I need at least 3 captions to learn from. *@${account.account_name}* has ${result.captionsFound} so far — post a few more, then try again.`);
  } else {
    await sendText(from, `⚠️ Couldn't update your voice profile right now — try again in a minute.`);
  }
}

async function handleListAccounts(from: string) {
  const supabase = getSupabase();
  const { data: accounts } = await supabase
    .from('instagram_accounts')
    .select('account_name, is_active, token_expires_at')
    .in('whatsapp_phone', phoneVariants(from))
    .order('account_name');

  if (!accounts?.length) {
    const connectUrl = `${APP_URL}/api/auth/instagram?phone=${encodeURIComponent(from)}`;
    await sendText(from, `📸 No Instagram accounts connected yet.\n\nConnect one:\n${connectUrl}`);
    return;
  }

  const lines = accounts.map(a => {
    const days = a.token_expires_at
      ? Math.ceil((new Date(a.token_expires_at).getTime() - Date.now()) / 86_400_000)
      : null;
    const expiry = days !== null ? ` _(${days}d)_` : '';
    const marker = a.is_active ? '*●*' : '○';
    return `${marker} @${a.account_name}${expiry}`;
  });

  const manageUrl = `${APP_URL}/connect?phone=${encodeURIComponent(from)}`;
  const connectUrl = `${APP_URL}/api/auth/instagram?phone=${encodeURIComponent(from)}`;
  await sendText(
    from,
    `📸 *Connected accounts*\n\n${lines.join('\n')}\n\n*●* = active (where I post)\n\n*Switch:* "use @handle"\n*Add another:* ${connectUrl}\n*Manage:* ${manageUrl}`,
  );
}

async function handleUseAccount(from: string, handle: string) {
  const supabase = getSupabase();
  const target = handle.toLowerCase();
  const { data: accounts } = await supabase
    .from('instagram_accounts')
    .select('instagram_user_id, account_name, is_active')
    .in('whatsapp_phone', phoneVariants(from));

  if (!accounts?.length) {
    await sendText(from, '📸 No accounts connected. Send *accounts* to see options.');
    return;
  }

  const match = accounts.find(a => a.account_name.toLowerCase() === target);
  if (!match) {
    const choices = accounts.map(a => `• @${a.account_name}`).join('\n');
    await sendText(from, `🤔 No *@${handle}* on your phone.\n\nConnected:\n${choices}`);
    return;
  }

  if (match.is_active) {
    await sendText(from, `✓ *@${match.account_name}* is already the active account.`);
    return;
  }

  await supabase
    .from('instagram_accounts')
    .update({ is_active: false })
    .in('whatsapp_phone', phoneVariants(from))
    .neq('instagram_user_id', match.instagram_user_id);

  await supabase
    .from('instagram_accounts')
    .update({ is_active: true })
    .eq('instagram_user_id', match.instagram_user_id);

  await sendText(from, `✓ Switched — I'll post to *@${match.account_name}* from now on.`);
}

// ── Phase B repurpose handlers ──────────────────────────────────────
// Take a published post and spin it into another surface. Source post
// caption + brand context goes into a Sonnet generator; the returned
// structure is rendered into a fresh pending draft (carousel) or a
// text storyboard (reel script). Drafts get parent_post_id pointing
// back to the source so analytics can aggregate ideas across surfaces.

async function handleCommentSend(from: string, eventId: string) {
  const supabase = getSupabase();
  const { data: event } = await supabase
    .from('ig_comment_events')
    .select('id, ig_comment_id, instagram_user_id, generated_reply, status')
    .eq('id', eventId)
    .maybeSingle();
  if (!event || event.status !== 'pending') {
    await sendText(from, "That reply was already handled — no action taken.");
    return;
  }

  const { data: account } = await supabase
    .from('instagram_accounts')
    .select('access_token')
    .eq('instagram_user_id', event.instagram_user_id)
    .maybeSingle();
  if (!account?.access_token) {
    await sendText(from, "⚠️ Can't post — IG access token expired. Reconnect on /connect.");
    return;
  }

  try {
    const sent = await postCommentReply(event.ig_comment_id, event.generated_reply ?? '', account.access_token);
    await supabase.from('ig_comment_events').update({
      status: 'sent',
      sent_reply_id: sent.id,
      resolved_at: new Date().toISOString(),
    }).eq('id', event.id);
    await sendText(from, '✅ Reply sent.');
  } catch (err: any) {
    console.error('[comment-send] failed:', err.message);
    await sendText(from, `⚠️ Couldn't post the reply: ${err.message?.slice(0, 200) ?? 'unknown error'}`);
  }
}

async function handleCommentSkip(from: string, eventId: string) {
  const supabase = getSupabase();
  await supabase.from('ig_comment_events').update({
    status: 'skipped',
    resolved_at: new Date().toISOString(),
  }).eq('id', eventId).eq('status', 'pending');
  await sendText(from, '👌 Skipped. The comment stays unanswered on IG.');
}

async function handleDashboardLink(from: string) {
  const token = await createWaMagicToken(from);
  const url = `${APP_URL}/api/auth/wa-magic?token=${token}&phone=${encodeURIComponent(from)}`;
  await sendText(
    from,
    `📊 *Tap to open your dashboard:*\n\n${url}\n\n_Link expires in 1 hour. Once you're in, your session sticks for 30 days._`,
  );
}

async function handleSpinCarousel(from: string, sourcePostId: string) {
  const supabase = getSupabase();
  const source = await getPostById(sourcePostId);
  if (!source) {
    await sendText(from, "I couldn't find that post anymore — try a fresh one.");
    return;
  }

  await sendText(from, '🖼️ Spinning your idea into a 5-slide carousel — this takes ~30 seconds...');

  const profileContext = await getProfileContextForPhone(from);
  const spin = await generateCarouselSpin(source.caption, profileContext ?? undefined);
  if (!spin) {
    await sendText(from, "⚠️ Couldn't generate the carousel — try /carousel to build one manually.");
    return;
  }

  // One AI image per slide. detectStyle is photorealistic-by-default
  // unless the prompt mentions something like "illustration" or "logo".
  // Brand LoRA flows in here too — when ready, every slide matches the
  // user's feed aesthetic, not generic Flux-realistic.
  const mediaItems: CarouselItem[] = await Promise.all(
    spin.slides.map(async s => ({
      url: await buildBrandedImage(`${s.imagePrompt} | overlay text: "${s.headline}"`, detectStyle(s.imagePrompt), from),
      is_video: false,
    })),
  );

  // Discard any other pending drafts so the new carousel has the lane to itself
  const { data: stale } = await supabase
    .from('pending_posts')
    .select('id, sibling_id')
    .eq('whatsapp_phone', from)
    .in('state', ['pending_approval', 'in_edit', 'collecting_carousel']);
  for (const d of stale ?? []) {
    await supabase.from('pending_posts').update({ state: 'discarded' }).eq('id', d.id);
    if (d.sibling_id) await supabase.from('pending_posts').update({ state: 'discarded' }).eq('id', d.sibling_id);
  }

  const { data: post } = await supabase
    .from('pending_posts')
    .insert({
      whatsapp_phone: from,
      caption: spin.caption,
      image_url: mediaItems[0].url,
      image_source: 'ai',
      is_video: false,
      surface: 'carousel',
      state: 'pending_approval',
      media_items: mediaItems,
      parent_post_id: sourcePostId,
    })
    .select('id')
    .single();
  if (!post) {
    await sendText(from, '⚠️ Saved the carousel but had trouble creating the draft — try again.');
    return;
  }

  await sendText(
    from,
    `📑 *Carousel storyboard:*\n\n${spin.slides.map((s, i) => `${i + 1}. *${s.headline}* — ${s.body}`).join('\n')}`,
  );
  await sendPostPreview(from, mediaItems[0].url, spin.caption, post.id, false, 'feed');
}

async function handleSpinStory(from: string, sourcePostId: string) {
  const supabase = getSupabase();
  const source = await getPostById(sourcePostId);
  if (!source) {
    await sendText(from, "I couldn't find that post anymore — try a fresh one.");
    return;
  }

  await sendText(from, '🌅 Spinning your idea into a Story — generating the visual...');

  const profileContext = await getProfileContextForPhone(from);
  const spin = await generateStorySpin(source.caption, profileContext ?? undefined);
  if (!spin) {
    await sendText(from, "⚠️ Couldn't generate the Story — try again.");
    return;
  }

  // Vertical 9:16 image with the hook baked into the prompt so it appears
  // as overlay text. detectStyle picks photoreal vs illustration based
  // on prompt vocabulary.
  const imageUrl = await buildBrandedImage(spin.imagePrompt, detectStyle(spin.imagePrompt), from);

  // Discard conflicting drafts so the Story has a clean lane
  const { data: stale } = await supabase
    .from('pending_posts')
    .select('id, sibling_id')
    .eq('whatsapp_phone', from)
    .in('state', ['pending_approval', 'in_edit', 'collecting_carousel']);
  for (const d of stale ?? []) {
    await supabase.from('pending_posts').update({ state: 'discarded' }).eq('id', d.id);
    if (d.sibling_id) await supabase.from('pending_posts').update({ state: 'discarded' }).eq('id', d.sibling_id);
  }

  // Stories have no IG caption — store the hook so the preview text
  // shows it. Publishing path uses publishStoryToInstagram which skips
  // the caption param entirely.
  const { data: post } = await supabase
    .from('pending_posts')
    .insert({
      whatsapp_phone: from,
      caption: spin.hook,
      image_url: imageUrl,
      image_source: 'ai',
      is_video: false,
      surface: 'story',
      state: 'pending_approval',
      parent_post_id: sourcePostId,
    })
    .select('id')
    .single();
  if (!post) {
    await sendText(from, '⚠️ Saved the Story idea but had trouble creating the draft — try again.');
    return;
  }

  await sendText(
    from,
    `🌅 *Story preview*\n\n` +
    `Hook (overlay): *${spin.hook}*\n\n` +
    `Stories don't have a caption — the visual carries the message. ` +
    `Approve to push to your 24h Story strip.`,
  );
  await sendPostPreview(from, imageUrl, spin.hook, post.id, false, 'feed');
}

async function handleSpinReelScript(from: string, sourcePostId: string) {
  const source = await getPostById(sourcePostId);
  if (!source) {
    await sendText(from, "I couldn't find that post anymore — try a fresh one.");
    return;
  }

  await sendText(from, '🎬 Sketching a 12-second Reel storyboard you can film today...');

  const profileContext = await getProfileContextForPhone(from);
  const spin = await generateReelScriptSpin(source.caption, profileContext ?? undefined);
  if (!spin) {
    await sendText(from, "⚠️ Couldn't write the script — try again.");
    return;
  }

  const scriptLines = spin.scenes
    .map((sc, i) => `*Scene ${i + 1} (~4s)*\n📷 ${sc.visual}\n🎙️ "${sc.voiceover}"\n💬 _${sc.textOverlay}_`)
    .join('\n\n');

  await sendText(
    from,
    `🎬 *Reel storyboard*\n\n` +
    `🪝 *Hook:* "${spin.hook}"\n\n` +
    `${scriptLines}\n\n` +
    `📝 *Caption:*\n${spin.caption}\n\n` +
    `Film it on your phone (vertical, 9:16). When you're done, send the video back here and I'll post it as a Reel with this caption already loaded. 🚀`,
  );
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
    surface: 'carousel',
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
