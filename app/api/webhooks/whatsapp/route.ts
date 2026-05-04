import { after } from 'next/server';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateCaption, generateCaptionVariants, generateImagePrompt, refineCaption, generateCarouselSpin, generateReelScriptSpin, generateStorySpin } from '@/lib/caption-generator';
import { learnStyleFromInstagram } from '@/lib/style-memory';
import { publishToInstagram, publishCarouselToInstagram, publishStoryToInstagram, postCommentReply, postInstagramDm, type CarouselItem } from '@/lib/instagram-publish';
import { sendText, sendPostPreview, sendPostPublishedActions, sendBrandSuggestion, sendRepurposeOffer, sendScheduledActions, sendConversationStarters, sendEditActionsMenu, sendCarouselSlideSelector, sendCarouselProgressButtons, sendRetryButton } from '@/lib/whatsapp-send';
import { buildImageUrl, buildBrandedImage, detectStyle } from '@/lib/image-generator';
import { downloadAndHostMedia } from '@/lib/whatsapp-media';
import { transcribeVoice } from '@/lib/transcribe';
import { handleOnboarding } from '@/lib/whatsapp-onboarding';
import { getProfileContextForPhone, updateActiveBrandProfile } from '@/lib/brand-profile';
import { hasScheduleIntent, parseScheduleTime, formatScheduleConfirmation } from '@/lib/schedule-parser';
import { findBestTimeForUser, nextOccurrenceOfBestTime, type BestTime } from '@/lib/best-time';
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
        // /setplan <phone> <free|pro|agency> — manually toggle a user's plan for testing
        const setplanMatch = txt.match(/^\/setplan\s+(\S+)\s+(free|pro|agency)$/i);
        if (setplanMatch) {
          const targetRaw = setplanMatch[1];
          const newPlan   = setplanMatch[2].toLowerCase();
          const targetVariants = phoneVariants(targetRaw.startsWith('+') ? targetRaw : `+${targetRaw}`);
          const { error: spErr } = await getSupabase()
            .from('user_profiles')
            .update({ plan: newPlan })
            .in('whatsapp_phone', targetVariants);
          await sendText(from, spErr
            ? `⚠️ setplan failed: ${spErr.message}`
            : `✅ Plan set to *${newPlan}* for ${targetRaw}`);
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
        if (isHelpCommand(txt))        { await handleHelp(from);                               return; }
        if (isStatusCheck(txt))        { await handleStatus(from);                             return; }
        if (isCancelScheduled(txt))    { await handleCancelScheduled(from);                    return; }
        if (isTrainBrandCommand(txt))  { await handleTrainBrand(from);                         return; }
        if (isLearnStyleCommand(txt))  { await handleLearnStyle(from);                         return; }
        if (isCarouselCommand(txt))    { await handleCarouselStart(from);                      return; }
        if (isAccountsCommand(txt))   { await handleListAccounts(from);                       return; }
        if (isJournalListCommand(txt)){ await handleJournalList(from);                         return; }
        if (isJournalCommand(txt))    { await handleJournalArm(from);                          return; }
        if (isCreatePostCommand(txt))  { await handleCreatePostIntent(from);                   return; }
        const journalIdx = parseJournalUseCommand(txt);
        if (journalIdx !== null)      { await handleJournalUse(from, journalIdx);              return; }
        const searchTopic = parseSearchCommand(txt);
        if (searchTopic)              { await handleContentSearch(from, searchTopic);          return; }
        const engCmd = parseEngagementCommand(txt);
        if (engCmd)                   { await handleEngagementCommand(from, engCmd);            return; }
        const useHandle = parseUseAccountCommand(txt);
        if (useHandle)                { await handleUseAccount(from, useHandle);               return; }
        const profileEdit = parseProfileUpdate(txt);
        if (profileEdit)              { await handleProfileUpdate(from, profileEdit);          return; }
      }

      // ── Explicit edit states — checked FIRST so stale carousel sessions
      //    can never intercept an active caption/image edit. ──────────────

      // Carousel slide replace (awaiting_slide_replace) — 10-min expiry
      const awaitingSlideReplace = await getPostByState(from, 'awaiting_slide_replace');
      if (awaitingSlideReplace) {
        const ageMs = Date.now() - new Date(
          (awaitingSlideReplace as any).updated_at ?? awaitingSlideReplace.created_at
        ).getTime();
        if (ageMs > 10 * 60 * 1000) {
          await getSupabase().from('pending_posts')
            .update({ state: 'pending_approval', editing_slide_idx: null })
            .eq('id', awaitingSlideReplace.id);
        } else if (['image', 'video'].includes(messageType)) {
          await handleSlideReplace(from, awaitingSlideReplace, message, messageType);
          return;
        } else if (messageType === 'text' && /^cancel/i.test(message.text?.body?.trim() ?? '')) {
          await getSupabase().from('pending_posts')
            .update({ state: 'pending_approval', editing_slide_idx: null })
            .eq('id', awaitingSlideReplace.id);
          await sendText(from, '✋ Cancelled. Here\'s your draft:');
          const refreshed = await getPostById(awaitingSlideReplace.id);
          if (refreshed) {
            const items = Array.isArray(refreshed.media_items) ? refreshed.media_items : [];
            await sendPostPreview(from, refreshed.image_url, refreshed.caption, refreshed.id, false, 'carousel', items.length);
          }
          return;
        } else {
          const idx = awaitingSlideReplace.editing_slide_idx ?? 0;
          await sendText(from, `🖼️ Send the replacement photo or video for slide ${idx + 1}, or type *cancel* to go back.`);
          return;
        }
      }

      // Image-style sub-state (awaiting_image_style) — 10-min expiry
      const awaitingImageStyle = await getPostByState(from, 'awaiting_image_style');
      if (awaitingImageStyle) {
        const ageMs = Date.now() - new Date(
          (awaitingImageStyle as any).updated_at ?? awaitingImageStyle.created_at
        ).getTime();
        if (ageMs > 10 * 60 * 1000) {
          await getSupabase().from('pending_posts')
            .update({ state: 'pending_approval' })
            .eq('id', awaitingImageStyle.id);
        } else {
          if (messageType === 'text') {
            await handleImageStyleInput(from, awaitingImageStyle, message.text.body);
            return;
          }
          if (messageType === 'audio') {
            await sendText(from, '🎙️ Transcribing — one sec...');
            try {
              const instruction = await transcribeVoice(message.audio?.id, message.audio?.mime_type ?? 'audio/ogg');
              await handleImageStyleInput(from, awaitingImageStyle, instruction);
            } catch {
              await sendText(from, '🎙️ Couldn\'t transcribe — please type your image style instead.');
            }
            return;
          }
          if (['image', 'video', 'document'].includes(messageType)) {
            await handleEditWithNewMedia(from, awaitingImageStyle, message, messageType);
            return;
          }
        }
      }

      // Caption-edit sub-state (awaiting_caption_edit) — 10-min expiry
      const awaitingCaptionEdit = await getPostByState(from, 'awaiting_caption_edit');
      if (awaitingCaptionEdit) {
        const ageMs = Date.now() - new Date(
          (awaitingCaptionEdit as any).updated_at ?? awaitingCaptionEdit.created_at
        ).getTime();
        if (ageMs > 10 * 60 * 1000) {
          await getSupabase().from('pending_posts')
            .update({ state: 'pending_approval' })
            .eq('id', awaitingCaptionEdit.id);
        } else if (messageType === 'text') {
          await handleCaptionEditInput(from, awaitingCaptionEdit, message.text.body);
          return;
        } else if (messageType === 'audio') {
          await sendText(from, '🎙️ Transcribing — one sec...');
          try {
            const instruction = await transcribeVoice(message.audio?.id, message.audio?.mime_type ?? 'audio/ogg');
            await handleCaptionEditInput(from, awaitingCaptionEdit, instruction);
          } catch {
            await sendText(from, '🎙️ Couldn\'t transcribe — please type your caption instruction instead.');
          }
          return;
        }
      }

      // General edit fallback (in_edit)
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

      // ── Carousel collection — runs AFTER explicit edit states so a stale
      //    collecting_carousel session can't swallow caption-edit instructions.
      //    Sessions older than 30 minutes are auto-discarded. ───────────────
      const collecting = await getPostByState(from, 'collecting_carousel');
      if (collecting) {
        const carouselAgeMs = Date.now() - new Date(
          (collecting as any).updated_at ?? collecting.created_at
        ).getTime();
        if (carouselAgeMs > 30 * 60 * 1000) {
          // Stale session — discard silently and fall through to new-post flow
          await getSupabase().from('pending_posts')
            .update({ state: 'discarded' })
            .eq('id', collecting.id);
        } else {
          if (messageType === 'text') {
            const txt = message.text?.body ?? '';
            if (isCarouselFinishCommand(txt)) { await handleCarouselFinish(from, collecting); return; }
            if (/^cancel/i.test(txt.trim()))  { await handleCarouselCancel(from, collecting); return; }

            // "reorder" → show current order and ask for new sequence
            if (/^re-?order$/i.test(txt.trim())) {
              const items: CarouselItem[] = Array.isArray(collecting.media_items) ? collecting.media_items : [];
              if (items.length < 2) {
                await sendText(from, '📸 Send at least 2 slides before reordering.');
                return;
              }
              const list = items.map((it, i) => `${i + 1}. ${it.is_video ? '🎬 Video' : '📷 Photo'}`).join('\n');
              await sendText(from, `🔀 *Current order:*\n\n${list}\n\nReply with the new order as numbers, e.g. *2,1,3*.`);
              return;
            }

            // "2,1,3" or "3, 1, 2" → apply reorder
            const reorderMatch = txt.trim().match(/^(\d+(?:\s*,\s*\d+)+)$/);
            if (reorderMatch) {
              const indices = reorderMatch[1].split(',').map((s: string) => parseInt(s.trim(), 10) - 1);
              const items: CarouselItem[] = Array.isArray(collecting.media_items) ? collecting.media_items : [];
              const isValid =
                indices.length === items.length &&
                indices.every((i: number) => i >= 0 && i < items.length) &&
                new Set(indices).size === indices.length;
              if (isValid) {
                const reordered = indices.map((i: number) => items[i]);
                await getSupabase().from('pending_posts').update({ media_items: reordered }).eq('id', collecting.id);
                const list = reordered.map((it, i) => `${i + 1}. ${it.is_video ? '🎬 Video' : '📷 Photo'}`).join('\n');
                await sendCarouselProgressButtons(from, collecting.id, reordered.length);
                await sendText(from, `✅ Reordered!\n\n${list}`);
                return;
              }
            }

            await sendCarouselProgressButtons(from, collecting.id, Array.isArray(collecting.media_items) ? collecting.media_items.length : 0);
            return;
          }
          if (messageType === 'image') {
            await handleCarouselAppend(from, collecting, message);
            return;
          }
          if (messageType === 'video') {
            await handleCarouselAppendVideo(from, collecting, message);
            return;
          }
          if (messageType === 'audio' || messageType === 'document') {
            await sendText(from, '🎞️ Carousels support photos and short videos — send media, or type *done* / *cancel*.');
            return;
          }
        }
      }

      // All videos outside an active edit flow go into a collecting_carousel session.
      // handleCarouselFinish decides the surface: 1 video → Reel, 1 photo → Feed, 2+ → Carousel.
      // This prevents the video-first race where a lone video becomes a Reel before the
      // user's burst photos arrive and create a separate Carousel session.
      if (messageType === 'video') {
        await handleAutoCarouselVideo(from, message, message.video?.media_group_id ?? null);
        return;
      }

      // All images outside an active edit or collection flow: auto-carousel buffer.
      //   2+ images → carousel  |  1 image → regular post
      if (messageType === 'image') {
        await handleAutoCarouselImage(from, message, (message.image?.caption ?? '').trim());
        return;
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
            await sendPostPreview(from, pendingApproval.image_url, newCaption, pendingApproval.id, pendingApproval.is_video ?? false, deriveSurface(pendingApproval), deriveSlideCount(pendingApproval));
            return;
          }
          if (newCaption === pendingApproval.caption) {
            await sendText(from, `That's already the active caption — tap *Approve* to post, or reply with the other number to swap.`);
            return;
          }
        }

        if (hasScheduleIntent(text)) {
          // "best time" intent — resolve via past-insights aggregator
          // before falling through to the natural-language parser.
          const wantsBestTime = /\bbest\s*time\b/i.test(text);
          let scheduleTime: Date | null = null;
          let bestTimeMeta: BestTime | null = null;
          if (wantsBestTime) {
            bestTimeMeta = await findBestTimeForUser(from);
            scheduleTime = nextOccurrenceOfBestTime(bestTimeMeta);
          } else {
            scheduleTime = await parseScheduleTime(text);
          }

          if (scheduleTime && scheduleTime > new Date()) {
            await getSupabase().from('pending_posts')
              .update({ state: 'scheduled', scheduled_for: scheduleTime.toISOString() })
              .eq('id', pendingApproval.id);

            const baseLabel = formatScheduleConfirmation(scheduleTime);
            const label = bestTimeMeta?.source === 'history'
              ? `${baseLabel} — your historical best slot (${bestTimeMeta.weekdayLabel} ${bestTimeMeta.hourLabel}, based on ${bestTimeMeta.sampleSize} past posts)`
              : bestTimeMeta?.source === 'default'
                ? `${baseLabel} — using a sensible default (Tue 7pm). I'll personalise once you have ~5 posts with insights.`
                : baseLabel;
            await sendScheduledActions(from, label);
            return;
          }
        }
        // Show draft with clear instructions — user must explicitly discard to start fresh
        await sendText(from, '👆 Still got a draft on the line — tap *Approve* to post it, or *Discard* to start fresh:');
        await sendPostPreview(from, pendingApproval.image_url, pendingApproval.caption, pendingApproval.id, pendingApproval.is_video ?? false, deriveSurface(pendingApproval), deriveSlideCount(pendingApproval));
        return;
      }

      // For media (image/video/audio): auto-discard any stale pending drafts before creating new
      if (['image', 'video', 'audio', 'document'].includes(messageType) && pendingApproval) {
        await getSupabase().from('pending_posts').update({ state: 'discarded' }).eq('id', pendingApproval.id);
        if (pendingApproval.sibling_id) {
          await getSupabase().from('pending_posts').update({ state: 'discarded' }).eq('id', pendingApproval.sibling_id);
        }
      }

      // Journal-armed branch: if the user typed /journal in the last 5
      // minutes, the next inbound message becomes a journal entry, not
      // a draft. Auto-clears the flag after consumption (or after the
      // 5-min TTL even without consumption).
      const wasArmed = await consumeJournalArmIfActive(from);
      if (wasArmed) {
        await captureJournalEntry(from, message, messageType);
        return;
      }

      // For plain text that's not a media upload and not in a special state,
      // show conversation starters instead of auto-creating a post.
      // Users must explicitly choose "create post" or send media to start creation.
      if (messageType === 'text') {
        const { data: profile } = await getSupabase()
          .from('user_profiles')
          .select('brand_name')
          .eq('whatsapp_phone', from)
          .maybeSingle();
        await sendConversationStarters(from, profile?.brand_name ?? 'there');
        return;
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

  const imageResult = userMediaUrl
    ? { url: userMediaUrl, overflowed: false }
    : await buildBrandedImage(imagePromptText!, 'realistic', from);
  const imageUrl = imageResult.url;

  // Discard any stale pending_approval before creating new post
  const { data: staleDrafts } = await getSupabase()
    .from('pending_posts').select('id, sibling_id').eq('whatsapp_phone', from).eq('state', 'pending_approval');
  for (const d of staleDrafts ?? []) {
    await getSupabase().from('pending_posts').update({ state: 'discarded' }).eq('id', d.id);
    if (d.sibling_id) await getSupabase().from('pending_posts').update({ state: 'discarded' }).eq('id', d.sibling_id);
  }

  // Create the primary post — store source_prompt so caption refinements can
  // chain on the original subject matter (e.g. "Greece, Lindos views...")
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
      ...(prompt ? { source_prompt: prompt } : {}),
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
    const { url: aiImageUrl } = await buildBrandedImage(imagePromptText, 'realistic', from);
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

  if (imageResult.overflowed) {
    await sendText(from, `⚡ Daily Pro limit reached — using standard generation for the rest of today. [Upgrade quota at ${APP_URL}/account]`);
  }
}

async function getPostById(id: string) {
  const { data } = await getSupabase().from('pending_posts').select('*').eq('id', id).maybeSingle();
  return data;
}

function deriveSurface(post: any): 'feed' | 'reels' | 'carousel' | 'story' {
  if (Array.isArray(post.media_items) && post.media_items.length > 1) return 'carousel';
  if (post.surface === 'story') return 'story';
  if (post.surface === 'reels' || post.is_video) return 'reels';
  return 'feed';
}

function deriveSlideCount(post: any): number | undefined {
  const items = Array.isArray(post.media_items) ? post.media_items : [];
  return items.length > 1 ? items.length : undefined;
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
  // Conversation starters
  if (action === 'create_post') {
    await sendText(from, "✨ I'm ready — send a voice note, photo, video, or one line and I'll write your next post.");
    return;
  }
  if (action === 'check_status') {
    await handleStatus(from);
    return;
  }

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
    const parts = postId.split(':');
    const actualPostId = parts[0];
    const retryCount = parts[1] ? (parseInt(parts[1], 10) || 0) : 0;
    await handleSpinStory(from, actualPostId, retryCount);
    return;
  }

  // Carousel collection action buttons
  if (action === 'carousel_done' && postId) {
    const post = await getPostById(postId);
    if (!post || post.state !== 'collecting_carousel') {
      await sendText(from, '👌 That session has already been finalised.');
      return;
    }
    await handleCarouselFinish(from, post as any);
    return;
  }
  if (action === 'carousel_reorder' && postId) {
    const post = await getPostById(postId);
    if (!post || post.state !== 'collecting_carousel') {
      await sendText(from, '👌 That session is no longer active.');
      return;
    }
    const items: CarouselItem[] = Array.isArray(post.media_items) ? post.media_items : [];
    if (items.length < 2) {
      await sendText(from, '📸 Nothing to reorder yet — send at least 2 slides first.');
      return;
    }
    const list = items.map((it, i) => `${i + 1}. ${it.is_video ? '🎬 Video' : '📷 Photo'}`).join('\n');
    await sendText(from, `🔀 *Current order:*\n\n${list}\n\nReply with your preferred order as numbers, e.g. *2,1,3* to put slide 2 first.`);
    return;
  }
  if (action === 'carousel_discard' && postId) {
    const post = await getPostById(postId);
    if (post) await handleCarouselCancel(from, post);
    return;
  }

  // Edit action sub-menu handlers
  if (action === 'edit_caption' && postId) {
    const post = await getPostById(postId);
    if (!post) {
      await sendText(from, 'Post not found.');
      return;
    }
    await getSupabase().from('pending_posts')
      .update({ state: 'awaiting_caption_edit' })
      .eq('id', postId);
    await sendText(from, '✍️ *Edit the caption:*\n\nExamples:\n• "Make it shorter"\n• "Change tone to energetic"\n• "Add a call-to-action"\n• "Translate to Spanish"\n\nWhat\'ll it be?');
    return;
  }
  if (action === 'edit_image' && postId) {
    const post = await getPostById(postId);
    if (!post) {
      await sendText(from, 'Post not found.');
      return;
    }
    await getSupabase().from('pending_posts')
      .update({ state: 'awaiting_image_style' })
      .eq('id', postId);
    const hasUserPhoto = !!post.user_image_url;
    const imageMsg = '🖼️ *Regenerate the image:*\n\nExamples:\n• "Ryanair realistic"\n• "Moody cinematic"\n• "3D illustration"\n• "Dark and dramatic"\n' +
      (hasUserPhoto ? '\n• "Use my photo" (revert to your upload)' : '') +
      '\n\nWhat style?';
    await sendText(from, imageMsg);
    return;
  }
  if (action === 'edit_video' && postId) {
    const post = await getPostById(postId);
    if (!post) {
      await sendText(from, 'Post not found.');
      return;
    }
    await sendText(from, '🎬 *Replace the video:*\n\nSend your new video now, or reply "cancel" to go back.');
    return;
  }
  // Carousel slide picker: show list of slides so user can select one to replace
  if (action === 'edit_slide_picker' && postId) {
    const post = await getPostById(postId);
    if (!post) { await sendText(from, 'Post not found.'); return; }
    const items: CarouselItem[] = Array.isArray(post.media_items) ? post.media_items : [];
    if (items.length < 2) {
      // Fallback to normal image edit if somehow not a carousel
      await getSupabase().from('pending_posts').update({ state: 'awaiting_image_style' }).eq('id', postId);
      await sendText(from, '🖼️ *Regenerate the image:*\n\nWhat style? (e.g. "Moody cinematic", "3D illustration")');
      return;
    }
    await sendCarouselSlideSelector(from, postId, items.length);
    return;
  }
  // Specific slide selected for replacement
  if (action === 'edit_slide' && postId) {
    const parts = postId.split(':');
    const actualPostId = parts[0];
    const slideIdx = parts[1] !== undefined ? parseInt(parts[1], 10) : 0;
    const post = await getPostById(actualPostId);
    if (!post) { await sendText(from, 'Post not found.'); return; }
    await getSupabase().from('pending_posts')
      .update({ state: 'awaiting_slide_replace', editing_slide_idx: slideIdx })
      .eq('id', actualPostId);
    await sendText(from, `🖼️ *Replace slide ${slideIdx + 1}:*\n\nSend your replacement photo or video now, or type *cancel* to go back.`);
    return;
  }
  // Replace all slides: restart carousel collection with a clean session
  if (action === 'edit_all_slides' && postId) {
    const post = await getPostById(postId);
    if (!post) { await sendText(from, 'Post not found.'); return; }
    await getSupabase().from('pending_posts')
      .update({ state: 'collecting_carousel', media_items: [], editing_slide_idx: null })
      .eq('id', postId);
    await sendText(from, '🎞️ *Carousel reset* — send your new photos/videos one by one, then type *done* to publish.');
    return;
  }
  if (action === 'add_slides' && postId) {
    const post = await getPostById(postId);
    if (!post) { await sendText(from, 'Post not found.'); return; }
    if (post.is_video) {
      await sendText(from, "📹 Video posts can't become carousels — post it as a Reel instead.");
      return;
    }
    const firstSlide: CarouselItem = { url: post.image_url, is_video: false };
    await getSupabase().from('pending_posts')
      .update({ state: 'collecting_carousel', surface: 'carousel', media_items: [firstSlide] })
      .eq('id', postId);
    await sendText(from,
      `🎞️ *Carousel mode* — your current image is slide 1.\n\nSend 1–9 more photos, then type *done* to publish, or *cancel* to go back.`
    );
    return;
  }
  if (action === 'cancel_edit' && postId) {
    const post = await getPostById(postId);
    if (!post) {
      await sendText(from, 'Post not found.');
      return;
    }
    await getSupabase().from('pending_posts')
      .update({ state: 'pending_approval' })
      .eq('id', postId);
    await sendText(from, '✋ Edit cancelled. Here\'s your draft again:');
    await sendPostPreview(from, post.image_url, post.caption, post.id, !!post.is_video, deriveSurface(post), deriveSlideCount(post));
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
  if (action === 'dm_send' && postId) {
    await handleDmSend(from, postId);
    return;
  }
  if (action === 'dm_skip' && postId) {
    await handleDmSkip(from, postId);
    return;
  }
  if (action === 'eng_on_all' && postId) {
    await handleEngagementToggle(from, postId, { dm: true,  comment: true  });
    return;
  }
  if (action === 'eng_on_comments' && postId) {
    await handleEngagementToggle(from, postId, { dm: false, comment: true  });
    return;
  }
  if (action === 'eng_off' && postId) {
    await handleEngagementToggle(from, postId, { dm: false, comment: false });
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
      const contentType = isCarousel ? 'carousel' : isStory ? 'Story' : 'post';
      const errorMsg = err.message?.includes('platform') || err.message?.includes('failed')
        ? `⚠️ Instagram is having trouble posting your ${contentType} right now. Try again in a moment — your draft is saved.`
        : `⚠️ Couldn't post your ${contentType} right now. Try again in a moment — your draft is saved.`;
      await sendText(from, errorMsg);
      return;
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

    const mediaItemCount = Array.isArray(post.media_items) ? post.media_items.length : 0;
    await sendEditActionsMenu(from, post.id, !!post.is_video, mediaItemCount);

  } else if (action === 'discard') {
    await getSupabase().from('pending_posts').update({ state: 'discarded' }).eq('id', post.id);
    if (post.sibling_id) {
      await getSupabase().from('pending_posts').update({ state: 'discarded' }).eq('id', post.sibling_id);
    }
    // Also discard any orphaned collecting_carousel session — prevents stale
    // sessions from accumulating items from future bursts after a discard.
    await getSupabase().from('pending_posts')
      .update({ state: 'discarded' })
      .eq('whatsapp_phone', from)
      .eq('state', 'collecting_carousel');
    await sendText(from, '🗑️ Post discarded. Send a new message whenever you\'re ready!');
  }
}

// Caption-only refinement for the in_edit fallback path. Image changes must
// be made explicitly via the 🖼️ Image button in the edit sub-menu.
async function handleEditRefinement(from: string, pending: any, instruction: string) {
  if (instruction.trim().length < 3) {
    await sendText(from, '✏️ Not sure what to change — try "Make it shorter" or "Add a CTA".\nTo swap the visual, pick 🖼️ Image from the edit menu.');
    return;
  }
  await sendText(from, '✍️ Updating caption...');
  const profileContext = await getProfileContextForPhone(from);
  const newCaption = await refineCaption(pending.caption, instruction, profileContext ?? undefined, pending.source_prompt ?? undefined);
  await getSupabase().from('pending_posts')
    .update({ caption: newCaption, state: 'pending_approval' })
    .eq('id', pending.id);
  await sendPostPreview(from, pending.image_url, newCaption, pending.id, pending.is_video ?? false, deriveSurface(pending), deriveSlideCount(pending));
}

// Called when the user has explicitly tapped "Edit Image" and sent their
// style instruction.  Always treats the input as an image-generation prompt —
// never as a caption edit — regardless of whether the instruction contains
// the word "image".
async function handleImageStyleInput(from: string, post: any, instruction: string) {
  // Carousel upgrade: user says "carousel" / "add slides" instead of a style.
  if (/\b(carousel|add.*slide|make.*carousel|turn.*carousel|multi.*slide)\b/i.test(instruction)) {
    if (post.is_video) {
      await sendText(from, "📹 Video posts can't become carousels — post it as a Reel instead.");
      return;
    }
    const firstSlide: CarouselItem = { url: post.image_url, is_video: false };
    await getSupabase().from('pending_posts')
      .update({ state: 'collecting_carousel', surface: 'carousel', media_items: [firstSlide] })
      .eq('id', post.id);
    await sendText(from,
      `🎞️ *Carousel mode* — your current image is slide 1.\n\nSend 1–9 more photos, then type *done* to publish, or *cancel* to go back.`
    );
    return;
  }

  const isRevert = !!post.user_image_url &&
    /\b(use my photo|my photo|my image|original|uploaded|revert)\b/i.test(instruction);

  if (isRevert) {
    await getSupabase().from('pending_posts')
      .update({ image_url: post.user_image_url, image_source: 'user', state: 'pending_approval' })
      .eq('id', post.id);
    const updated = await getPostById(post.id);
    if (updated) await sendPostPreview(from, updated.image_url, updated.caption, updated.id, post.is_video ?? false, deriveSurface(updated), deriveSlideCount(updated));
    return;
  }

  await sendText(from, '🖼️ Generating new image style...');

  const imagePrompt = await generateImagePrompt(post.caption);
  // Combine original caption context with the user's style instruction so the
  // subject stays consistent (e.g. "sunset beach" + "Ryanair realistic style").
  const combinedPrompt = `${imagePrompt}, ${instruction}`;
  const imageResult = await buildBrandedImage(combinedPrompt, detectStyle(instruction), from);

  await getSupabase().from('pending_posts')
    .update({ image_url: imageResult.url, image_source: 'ai', state: 'pending_approval' })
    .eq('id', post.id);

  if (post.user_image_url) {
    await sendText(from, '💡 Switched to AI image. Say "use my photo" to revert.');
  }
  await sendPostPreview(from, imageResult.url, post.caption, post.id, post.is_video ?? false, deriveSurface(post), deriveSlideCount(post));
  if (imageResult.overflowed) {
    await sendText(from, `⚡ Daily Pro limit reached — using standard generation for the rest of today. [Upgrade quota at ${APP_URL}/account]`);
  }
}

// Called when the user has explicitly tapped "Edit Caption" and sent their
// instruction.  Always treats the input as a caption refinement.
async function handleCaptionEditInput(from: string, post: any, instruction: string) {
  await sendText(from, '✍️ Updating caption...');
  const profileContext = await getProfileContextForPhone(from);
  const newCaption = await refineCaption(post.caption, instruction, profileContext ?? undefined, post.source_prompt ?? undefined);
  await getSupabase().from('pending_posts')
    .update({ caption: newCaption, state: 'pending_approval' })
    .eq('id', post.id);
  await sendPostPreview(from, post.image_url, newCaption, post.id, post.is_video ?? false, deriveSurface(post), deriveSlideCount(post));
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
    // Single media replacement always resets to feed/reels — user is not modifying a carousel via this path
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

function isTrainBrandCommand(text: string): boolean {
  return /^(\/train|train\s+(my\s+)?(brand|style|lora|image\s*style)|retrain\s+(brand|style|lora))[!?.\s]*$/i.test(text.trim());
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

function isCreatePostCommand(text: string): boolean {
  return /^(\/create|create\s+(a\s+)?post|new\s+post|start\s+post|make\s+post|write\s+post|draft)[!?.\s]*$/i.test(text.trim());
}

function parseSearchCommand(text: string): string | null {
  const m = text.trim().match(/^(?:\/find|\/search|find|search|past\s+posts?\s+(?:about\s+)?)\s+(.+?)[!?.\s]*$/i);
  return m ? m[1].trim() : null;
}

function isJournalCommand(text: string): boolean {
  return /^(\/journal|journal\s+this|save\s+for\s+later)[!?.\s]*$/i.test(text.trim());
}

// Engagement toggle commands — match phrasings creators actually type.
// Returns { feature: 'all' | 'dm' | 'comment', mode: 'on' | 'off' | 'status' } | null.
function parseEngagementCommand(text: string): {
  feature: 'all' | 'dm' | 'comment';
  mode: 'on' | 'off' | 'status';
} | null {
  const t = text.trim().toLowerCase();
  // Status check
  if (/^(engagement\s+(status|state)|status\s+engagement|dm\s+autoreply\s+status|comment\s+autoreply\s+status)[!?.\s]*$/i.test(t)) {
    return { feature: 'all', mode: 'status' };
  }
  const m = t.match(/^(engagement|dm\s+autoreply|comments?\s+autoreply|dm|comments?)\s+(on|off|enable|disable)[!?.\s]*$/i);
  if (!m) return null;
  const target = m[1].includes('dm') ? 'dm' : m[1].startsWith('comment') ? 'comment' : 'all';
  const mode   = (m[2] === 'on' || m[2] === 'enable') ? 'on' : 'off';
  return { feature: target, mode };
}

function isJournalListCommand(text: string): boolean {
  return /^(\/journal\s+list|journal\s+list|my\s+journal|list\s+journal)[!?.\s]*$/i.test(text.trim());
}

function parseJournalUseCommand(text: string): number | null {
  const m = text.trim().match(/^(?:\/use|use\s+journal|use)\s+#?(\d+)[!?.\s]*$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n >= 1 && n <= 10 ? n : null;
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

async function handleCreatePostIntent(from: string) {
  await sendText(from, "✨ I'm ready — send a voice note, photo, video, or one line and I'll write your next post.");
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

async function handleTrainBrand(from: string) {
  const supabase = getSupabase();

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('plan')
    .in('whatsapp_phone', phoneVariants(from))
    .maybeSingle();

  if ((profile?.plan ?? 'free') !== 'pro') {
    await sendText(
      from,
      `🎨 *Brand image style training is a Pro feature.*\n\n` +
      `Upgrade to unlock:\n` +
      `• Custom LoRA trained on your Instagram feed\n` +
      `• Up to 10 high-quality AI images per day\n` +
      `• Visual consistency across every post\n\n` +
      `👉 Upgrade now: ${APP_URL}/api/billing/create-checkout`,
    );
    return;
  }

  const { data: account } = await supabase
    .from('instagram_accounts')
    .select('id, account_name, instagram_user_id, access_token, lora_status')
    .in('whatsapp_phone', phoneVariants(from))
    .eq('is_active', true)
    .maybeSingle();

  if (!account?.access_token || !account.instagram_user_id) {
    await sendText(from, `📸 Connect Instagram first — ${APP_URL}/api/auth/instagram?phone=${encodeURIComponent(from)}`);
    return;
  }
  if (account.lora_status === 'training') {
    await sendText(from, `◐ Already training — I'll WhatsApp you when @${account.account_name} is ready (~20 min).`);
    return;
  }
  if (account.lora_status === 'ready') {
    await sendText(from, `● Brand style already trained for @${account.account_name}. Every AI image already matches your feed aesthetic.`);
    return;
  }

  const { startLoraTraining } = await import('@/lib/lora');
  const result = await startLoraTraining({
    accountId: account.id,
    igUserId: account.instagram_user_id,
    accessToken: account.access_token,
    accountName: account.account_name,
  });

  if (!result.ok) {
    await sendText(from, `⚠️ Couldn't start training: ${result.error ?? 'please try again.'}`);
    return;
  }

  await sendText(from, `🎨 Training kicked off for @${account.account_name}! Replicate takes ~20 min — I'll WhatsApp you when it's ready.`);
}

// Content repository search — Postgres FTS over caption column.
// Returns top 3 matches; user gets dates + IG links so they can riff
// on past content instead of repeating themselves.
async function handleContentSearch(from: string, topic: string) {
  const supabase = getSupabase();
  const { data: matches } = await supabase
    .from('pending_posts')
    .select('id, caption, ig_post_url, published_at, surface')
    .eq('whatsapp_phone', from)
    .eq('state', 'published')
    .textSearch('caption', topic, { type: 'plain', config: 'english' })
    .order('published_at', { ascending: false })
    .limit(3);

  if (!matches?.length) {
    await sendText(from, `🔍 No past posts about *${topic}* yet. Send me a voice note to make one!`);
    return;
  }

  const lines = matches.map((m, i) => {
    const date = m.published_at
      ? new Date(m.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : '?';
    const surface = m.surface ?? 'feed';
    const snippet = (m.caption ?? '').slice(0, 140).replace(/\n+/g, ' ');
    const link    = m.ig_post_url ? `\n   🔗 ${m.ig_post_url}` : '';
    return `*${i + 1}.* ${date} · ${surface}\n   _${snippet}${m.caption && m.caption.length > 140 ? '…' : ''}_${link}`;
  }).join('\n\n');

  await sendText(from, `🔍 *Past posts about "${topic}":*\n\n${lines}\n\nSay "use 1" / "use 2" / "use 3" to riff on one as a fresh post.`);
}

// Returns true if the user had /journal-armed within the last 5 minutes,
// AND clears the flag in the same call. Idempotent: a second call
// returns false because the flag is gone.
async function consumeJournalArmIfActive(from: string): Promise<boolean> {
  const supabase = getSupabase();
  const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data } = await supabase
    .from('user_profiles')
    .select('journal_armed_at')
    .eq('whatsapp_phone', from)
    .maybeSingle();
  if (!data?.journal_armed_at || data.journal_armed_at < fiveMinAgo) return false;
  await supabase
    .from('user_profiles')
    .update({ journal_armed_at: null })
    .eq('whatsapp_phone', from);
  return true;
}

// Stores a voice / text message as a journal_entry without firing the
// generation pipeline. Voice notes are transcribed first so the entry
// is searchable and previewable.
async function captureJournalEntry(from: string, message: any, messageType: string) {
  const supabase = getSupabase();
  let body = '';

  if (messageType === 'text') {
    body = message?.text?.body ?? '';
  } else if (messageType === 'audio') {
    const mediaId  = message?.audio?.id;
    const mimeType = message?.audio?.mime_type ?? 'audio/ogg';
    if (mediaId) {
      try {
        body = await transcribeVoice(mediaId, mimeType);
      } catch (err) {
        console.error('[journal-capture] voice transcribe failed:', err);
      }
    }
  } else {
    await sendText(from, '📓 Journal supports voice notes and text only for now — try sending a thought instead.');
    return;
  }

  if (!body.trim()) {
    await sendText(from, "📓 I didn't catch anything to save. Try /journal again with a clear voice note or text.");
    return;
  }

  await supabase.from('pending_posts').insert({
    whatsapp_phone: from,
    caption: body.trim(),
    state: 'journal_entry',
    image_url: '',
    image_source: 'ai',
    is_video: false,
    surface: 'feed',
  });

  await sendText(
    from,
    `📓 *Saved to your journal.*\n\n_"${body.trim().slice(0, 200)}${body.trim().length > 200 ? '…' : ''}"_\n\n` +
    `Pull it up anytime with \`journal list\`, or turn it into a post with \`use 1\`.`,
  );
}

// /journal — arm the next message as a journal entry.
async function handleJournalArm(from: string) {
  const supabase = getSupabase();
  await supabase
    .from('user_profiles')
    .update({ journal_armed_at: new Date().toISOString() })
    .eq('whatsapp_phone', from);
  await sendText(
    from,
    '📓 *Journal armed.*\n\nSend your next thought (voice note or text) and I\'ll save it without making a post. ' +
    'Pull it up later with `journal list` or promote it to a draft with `use 1`.\n\n' +
    '_Auto-cancels after 5 minutes if you don\'t send anything._',
  );
}

// `journal list` — show last 5 entries with previews + numbers.
async function handleJournalList(from: string) {
  const supabase = getSupabase();
  const { data: entries } = await supabase
    .from('pending_posts')
    .select('id, caption, created_at')
    .eq('whatsapp_phone', from)
    .eq('state', 'journal_entry')
    .order('created_at', { ascending: false })
    .limit(5);

  if (!entries?.length) {
    await sendText(from, '📓 Your journal is empty. Type `/journal` to save your next thought without posting it.');
    return;
  }

  const lines = entries.map((e, i) => {
    const date    = new Date(e.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const snippet = (e.caption ?? '').slice(0, 120).replace(/\n+/g, ' ');
    return `*${i + 1}.* ${date}\n   _${snippet}${e.caption && e.caption.length > 120 ? '…' : ''}_`;
  }).join('\n\n');

  await sendText(from, `📓 *Your journal* (last ${entries.length}):\n\n${lines}\n\nSay "use 1" to turn one into a draft.`);
}

// `use <N>` — promote journal entry N to a pending_approval draft.
async function handleJournalUse(from: string, idx: number) {
  const supabase = getSupabase();
  const { data: entries } = await supabase
    .from('pending_posts')
    .select('id, caption')
    .eq('whatsapp_phone', from)
    .eq('state', 'journal_entry')
    .order('created_at', { ascending: false })
    .limit(5);

  if (!entries || entries.length < idx) {
    await sendText(from, `📓 You don't have a journal entry #${idx}. Try \`journal list\` to see what's there.`);
    return;
  }

  const target = entries[idx - 1];
  // Hand off to handleNewPost via a synthetic text message — keeps
  // generation, image, variants, and surface routing identical to a
  // brand-new voice-note flow.
  await sendText(from, `📓 Using journal #${idx} — generating a fresh post from it now…`);
  await handleNewPost(from, { text: { body: target.caption } }, 'text');
  // Mark the journal entry as used so it doesn't keep showing up.
  await supabase.from('pending_posts').update({ state: 'discarded' }).eq('id', target.id);
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

async function handleDmSend(from: string, eventId: string) {
  const supabase = getSupabase();
  const { data: event } = await supabase
    .from('ig_dm_events')
    .select('id, ig_message_id, instagram_user_id, sender_psid, generated_reply, status')
    .eq('id', eventId)
    .maybeSingle();
  if (!event || event.status !== 'pending') {
    await sendText(from, 'That DM was already handled — no action taken.');
    return;
  }

  const { data: account } = await supabase
    .from('instagram_accounts')
    .select('access_token')
    .eq('instagram_user_id', event.instagram_user_id)
    .maybeSingle();
  if (!account?.access_token) {
    await sendText(from, "⚠️ Can't send DM — IG access token expired. Reconnect on /connect.");
    return;
  }

  try {
    const sent = await postInstagramDm(
      event.instagram_user_id,
      event.sender_psid,
      event.generated_reply ?? '',
      account.access_token,
    );
    await supabase.from('ig_dm_events').update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      resolved_at: new Date().toISOString(),
    }).eq('id', event.id);
    await sendText(from, `✅ DM sent (id ${sent.message_id.slice(0, 12)}…)`);
  } catch (err: any) {
    console.error('[dm-send] failed:', err.message);
    const hint = err.message?.includes('24') || err.message?.includes('window')
      ? ' (the 24-hour DM window has likely closed — IG only allows replies within 24h of the user\'s last message)'
      : '';
    await sendText(from, `⚠️ Couldn't send the DM${hint}: ${err.message?.slice(0, 200) ?? 'unknown error'}`);
  }
}

async function handleDmSkip(from: string, eventId: string) {
  const supabase = getSupabase();
  await supabase.from('ig_dm_events').update({
    status: 'skipped',
    resolved_at: new Date().toISOString(),
  }).eq('id', eventId).eq('status', 'pending');
  await sendText(from, '👌 Skipped. The DM stays unanswered on IG.');
}

// Applies the chosen flags to a single IG account. Called from the
// 3-button eng_on_all / eng_on_comments / eng_off flow that fires
// the first time an event lands on an opt-out account.
async function handleEngagementToggle(
  from: string,
  igUserId: string,
  flags: { dm: boolean; comment: boolean },
) {
  const supabase = getSupabase();
  const { error, data } = await supabase
    .from('instagram_accounts')
    .update({
      dm_autoreply_enabled:      flags.dm,
      comment_autoreply_enabled: flags.comment,
      engagement_offered_at:     new Date().toISOString(),
    })
    .eq('instagram_user_id', igUserId)
    .in('whatsapp_phone', phoneVariants(from))
    .select('account_name')
    .maybeSingle();

  if (error || !data) {
    await sendText(from, "⚠️ Couldn't update — that account may not be linked to this number.");
    return;
  }

  const summary = flags.dm && flags.comment
    ? '✅ *Both DMs and comments* will get drafted replies for approval.'
    : flags.comment
      ? '💬 *Comments only* — DMs stay quiet.'
      : '👋 *Auto-reply off.* I won\'t draft anything; events stay in Vercel logs only.';
  await sendText(from, `Got it for *@${data.account_name}*.\n\n${summary}\n\nFlip later with: \`engagement on\`, \`dm autoreply off\`, etc.`);
}

// Free-form WA commands — apply across all of the user's IG accounts
// (multi-account users usually want the same engagement pref everywhere;
// per-account control sits on /account UI).
async function handleEngagementCommand(
  from: string,
  cmd: { feature: 'all' | 'dm' | 'comment'; mode: 'on' | 'off' | 'status' },
) {
  const supabase = getSupabase();
  const { data: accounts } = await supabase
    .from('instagram_accounts')
    .select('account_name, dm_autoreply_enabled, comment_autoreply_enabled')
    .in('whatsapp_phone', phoneVariants(from))
    .order('account_name');

  if (!accounts?.length) {
    await sendText(from, '📸 Connect Instagram first on /connect, then engagement settings make sense.');
    return;
  }

  if (cmd.mode === 'status') {
    const lines = accounts.map(a =>
      `• *@${a.account_name}*: DM ${a.dm_autoreply_enabled ? '✅ on' : '⚪️ off'} · Comments ${a.comment_autoreply_enabled ? '✅ on' : '⚪️ off'}`,
    ).join('\n');
    await sendText(
      from,
      `📊 *Engagement auto-reply status:*\n\n${lines}\n\nChange with: \`engagement on/off\`, \`dm autoreply on\`, \`comment autoreply off\`.`,
    );
    return;
  }

  const enable = cmd.mode === 'on';
  const patch: Record<string, boolean | string> = { engagement_offered_at: new Date().toISOString() };
  if (cmd.feature === 'all' || cmd.feature === 'dm')      patch.dm_autoreply_enabled      = enable;
  if (cmd.feature === 'all' || cmd.feature === 'comment') patch.comment_autoreply_enabled = enable;

  await supabase
    .from('instagram_accounts')
    .update(patch)
    .in('whatsapp_phone', phoneVariants(from));

  const what = cmd.feature === 'all' ? 'Both DM and comment' : cmd.feature === 'dm' ? 'DM' : 'Comment';
  const verb = enable ? 'enabled' : 'disabled';
  await sendText(
    from,
    `${enable ? '✅' : '👋'} *${what} auto-reply ${verb}* across ${accounts.length} account${accounts.length === 1 ? '' : 's'}.\n\nType \`engagement status\` anytime to see current settings.`,
  );
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

  // One AI image per slide — failures fall back to Pollinations so a single
  // slow/throttled generation doesn't abort the entire carousel.
  const mediaResults = await Promise.all(
    spin.slides.map(async s => {
      const prompt = `${s.imagePrompt} | overlay text: "${s.headline}"`;
      try {
        return await buildBrandedImage(prompt, detectStyle(s.imagePrompt), from);
      } catch {
        return { url: buildImageUrl(prompt, 'realistic'), overflowed: false };
      }
    }),
  );
  const mediaItems: CarouselItem[] = mediaResults.map(r => ({ url: r.url, is_video: false }));
  const carouselOverflowed = mediaResults.some(r => r.overflowed);

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
  await sendPostPreview(from, mediaItems[0].url, spin.caption, post.id, false, 'carousel', mediaItems.length);
  if (carouselOverflowed) {
    await sendText(from, `⚡ Daily Pro limit reached — some slides used standard generation. [Upgrade quota at ${APP_URL}/account]`);
  }
}

async function handleSpinStory(from: string, sourcePostId: string, retryCount = 0) {
  const supabase = getSupabase();
  const source = await getPostById(sourcePostId);
  if (!source) {
    await sendText(from, "I couldn't find that post anymore — try a fresh one.");
    return;
  }

  // Prefer existing user assets over AI generation — stories are strongest
  // when they reuse the original photo/video the creator already approved.
  const sourceItems: CarouselItem[] = Array.isArray(source.media_items) ? source.media_items as CarouselItem[] : [];
  const existingAsset: { url: string; isVideo: boolean } | null =
    source.user_image_url
      ? { url: source.user_image_url as string, isVideo: !!(source.is_video) }
      : sourceItems.length > 0
        ? { url: sourceItems[0].url, isVideo: !!sourceItems[0].is_video }
        : null;

  await sendText(from, existingAsset
    ? '📱 Building your Story using your original visual...'
    : '🌅 Spinning your idea into a Story — generating the visual...');

  const profileContext = await getProfileContextForPhone(from);
  const spin = await generateStorySpin(source.caption, profileContext ?? undefined);
  if (!spin) {
    if (retryCount >= 2) {
      await sendText(from, "⚠️ Story generation kept failing after a few tries. Let's start fresh:");
      const { data: profile } = await supabase.from('user_profiles').select('brand_name').in('whatsapp_phone', phoneVariants(from)).maybeSingle();
      await sendConversationStarters(from, profile?.brand_name ?? 'there');
    } else {
      await sendRetryButton(from, `spin_story:${sourcePostId}:${retryCount + 1}`, "⚠️ Couldn't generate the Story — want to try again?");
    }
    return;
  }

  let imageUrl: string;
  let imageSource: string;
  let isVideo = false;
  let storyOverflowed = false;

  if (existingAsset) {
    // Use the original photo/video directly — no AI generation
    imageUrl = existingAsset.url;
    imageSource = 'user';
    isVideo = existingAsset.isVideo;
  } else {
    // No user asset — generate a vertical 9:16 branded image
    const built = await buildBrandedImage(spin.imagePrompt, detectStyle(spin.imagePrompt), from, { w: 1080, h: 1920 });
    imageUrl = built.url;
    imageSource = 'ai';
    storyOverflowed = built.overflowed;
  }

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

  const { data: post } = await supabase
    .from('pending_posts')
    .insert({
      whatsapp_phone: from,
      caption: spin.hook,
      image_url: imageUrl,
      user_image_url: existingAsset?.url ?? null,
      image_source: imageSource,
      is_video: isVideo,
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
    `📱 *Story preview*\n\n` +
    `Hook (overlay): *${spin.hook}*\n\n` +
    `Stories don't have a caption — the visual carries the message. ` +
    `Approve to push to your 24h Story strip.`,
  );
  await sendPostPreview(from, imageUrl, spin.hook, post.id, isVideo, 'story');
  if (storyOverflowed) {
    await sendText(from, `⚡ Daily Pro limit reached — using standard generation for the rest of today. [Upgrade quota at ${APP_URL}/account]`);
  }
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

// Handles a burst video (has media_group_id) arriving outside an active collection.
// Creates or joins a collecting_carousel session the same way handleAutoCarouselImage
// does for photos — ensures videos and photos from the same camera-roll selection are
// always combined into one carousel regardless of arrival order.
async function handleAutoCarouselVideo(from: string, message: any, mediaGroupId: string | null) {
  const supabase = getSupabase();

  const wasArmed = await consumeJournalArmIfActive(from);
  if (wasArmed) {
    await captureJournalEntry(from, message, 'video');
    return;
  }

  const mediaId = message.video?.id;
  const mimeType = message.video?.mime_type ?? 'video/mp4';
  if (!mediaId) return;

  let url: string;
  try {
    url = await downloadAndHostMedia(mediaId, mimeType);
  } catch {
    await sendText(from, '📎 Couldn\'t download that video — try again.');
    return;
  }

  // Find existing session by media_group_id first (most precise), then any
  // recent session within a 60s burst window — avoids joining a stale session
  // from a previous upload that the user never typed "done" for.
  const { data: byGroup } = mediaGroupId ? await supabase
    .from('pending_posts')
    .select('id')
    .eq('whatsapp_phone', from)
    .eq('state', 'collecting_carousel')
    .eq('media_group_id', mediaGroupId)
    .maybeSingle() : { data: null };

  const { data: anyCandidateSession } = !byGroup ? await supabase
    .from('pending_posts')
    .select('id, updated_at, created_at')
    .eq('whatsapp_phone', from)
    .eq('state', 'collecting_carousel')
    .maybeSingle() : { data: null };

  // Only join a session that was active within the last 60 seconds
  const anySession = anyCandidateSession && (
    Date.now() - new Date((anyCandidateSession as any).updated_at ?? anyCandidateSession.created_at).getTime() <= 60_000
  ) ? anyCandidateSession : null;

  // Discard stale orphaned session so it doesn't accumulate future items
  if (anyCandidateSession && !anySession) {
    await supabase.from('pending_posts').update({ state: 'discarded' }).eq('id', anyCandidateSession.id);
  }

  let sessionId: string;

  if (byGroup ?? anySession) {
    sessionId = (byGroup ?? anySession)!.id;
  } else {
    // Discard stale drafts so the lane is clean
    const { data: stale } = await supabase.from('pending_posts').select('id, sibling_id')
      .eq('whatsapp_phone', from).in('state', ['pending_approval', 'in_edit']);
    for (const d of stale ?? []) {
      await supabase.from('pending_posts').update({ state: 'discarded' }).eq('id', d.id);
      if (d.sibling_id) await supabase.from('pending_posts').update({ state: 'discarded' }).eq('id', d.sibling_id);
    }

    const { data: created, error: insertErr } = await supabase.from('pending_posts').insert({
      whatsapp_phone: from,
      state: 'collecting_carousel',
      surface: 'carousel',
      media_items: [],
      caption: '',
      image_url: '',
      media_group_id: mediaGroupId,
    }).select('id').single();

    if (insertErr || !created) {
      if (insertErr?.code !== '23505') {
        console.error('[carousel session create (video)]', insertErr?.code, insertErr?.message);
      }
      const { data: winner } = await supabase.from('pending_posts')
        .select('id').eq('whatsapp_phone', from).eq('state', 'collecting_carousel').maybeSingle();
      if (!winner) {
        await sendText(from, '⚠️ Couldn\'t start a session — please try again.');
        return;
      }
      sessionId = winner.id;
    } else {
      sessionId = created.id;
    }
  }

  const { data: newCount } = await supabase.rpc('append_carousel_item', {
    p_post_id: sessionId,
    p_item: { url, is_video: true },
  });
  const count = typeof newCount === 'number' ? newCount : 1;
  await sendCarouselProgressButtons(from, sessionId, count, count >= 10);
}

// Handles any image sent outside an active edit flow or collecting_carousel session.
// Creates (or joins) a collecting_carousel session and appends the image directly
// via the atomic RPC — no sleep, no buffer race, immediate per-image feedback.
// The unique partial index (migration 27) prevents duplicate sessions under concurrency.
async function handleAutoCarouselImage(from: string, message: any, userCaption: string) {
  const supabase = getSupabase();

  // Journal-armed flow takes priority — user typed /journal then sent a photo.
  const wasArmed = await consumeJournalArmIfActive(from);
  if (wasArmed) {
    await captureJournalEntry(from, message, 'image');
    return;
  }

  const mediaId = message.image?.id;
  const mimeType = message.image?.mime_type ?? 'image/jpeg';
  if (!mediaId) return;

  let url: string;
  try {
    url = await downloadAndHostMedia(mediaId, mimeType);
  } catch {
    await sendText(from, '📎 Couldn\'t download that photo — try again.');
    return;
  }

  const imageGroupId: string | undefined = message.image?.media_group_id;

  let sessionId: string;
  // Look for an existing session: same media_group_id first, then any active session
  let existingQuery = supabase
    .from('pending_posts')
    .select('id, caption')
    .eq('whatsapp_phone', from)
    .eq('state', 'collecting_carousel');

  if (imageGroupId) {
    existingQuery = existingQuery.eq('media_group_id', imageGroupId);
  }

  const { data: existing } = await existingQuery.maybeSingle();
  // Fallback: find any active session if group-id search found nothing
  const { data: anyExisting } = !existing ? await supabase
    .from('pending_posts')
    .select('id, caption')
    .eq('whatsapp_phone', from)
    .eq('state', 'collecting_carousel')
    .maybeSingle() : { data: null };

  const resolvedExisting = existing ?? anyExisting;

  if (resolvedExisting) {
    sessionId = resolvedExisting.id;
    const updates: Record<string, string> = {};
    if (userCaption && !resolvedExisting.caption) updates.caption = userCaption;
    // Store source_prompt on first photo with a caption text
    if (userCaption && !(resolvedExisting as any).source_prompt) updates.source_prompt = userCaption;
    if (Object.keys(updates).length) await supabase.from('pending_posts').update(updates).eq('id', sessionId);
  } else {
    // Discard stale drafts so the lane is clean
    const { data: stale } = await supabase.from('pending_posts').select('id, sibling_id')
      .eq('whatsapp_phone', from).in('state', ['pending_approval', 'in_edit']);
    for (const d of stale ?? []) {
      await supabase.from('pending_posts').update({ state: 'discarded' }).eq('id', d.id);
      if (d.sibling_id) await supabase.from('pending_posts').update({ state: 'discarded' }).eq('id', d.sibling_id);
    }

    const { data: created, error: insertErr } = await supabase.from('pending_posts').insert({
      whatsapp_phone: from,
      state: 'collecting_carousel',
      surface: 'carousel',
      media_items: [],
      caption: userCaption,
      image_url: '',
      ...(imageGroupId ? { media_group_id: imageGroupId } : {}),
      ...(userCaption ? { source_prompt: userCaption } : {}),
    }).select('id').single();

    if (insertErr || !created) {
      if (insertErr?.code !== '23505') {
        console.error('[carousel session create]', insertErr?.code, insertErr?.message);
      }
      const { data: winner } = await supabase.from('pending_posts')
        .select('id').eq('whatsapp_phone', from).eq('state', 'collecting_carousel').maybeSingle();
      if (!winner) {
        await sendText(from, '⚠️ Couldn\'t start a session — please try again.');
        return;
      }
      sessionId = winner.id;
    } else {
      sessionId = created.id;
    }
  }

  // Atomically append this image; the RPC returns the new array length.
  const { data: newCount } = await supabase.rpc('append_carousel_item', {
    p_post_id: sessionId,
    p_item: { url, is_video: false },
  });
  const count = typeof newCount === 'number' ? newCount : 1;

  if (count >= 10) {
    await sendText(from, `📸 Photo ${count} added — that's the max! Type *done* to publish your carousel.`);
  } else if (count === 1) {
    await sendText(from, '📸 Got your photo! Send another to make a carousel, or type *done* to post it.');
  } else {
    await sendText(from, `📸 Photo ${count} added. Send more, or type *done* to publish your ${count}-slide carousel.`);
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
    surface: 'carousel',
    media_items: [],
    caption: '',
    image_url: '',
  });

  await sendText(
    from,
    "🎞️ *Carousel mode*\n\nSend 2–10 photos one by one. Type *done* when you're ready, or *cancel* to bail.",
  );
}

async function handleCarouselAppend(from: string, post: { id: string; media_items: CarouselItem[] | null }, message: { image?: { id?: string; mime_type?: string } }) {
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

  // Atomically append; RPC returns new array length so we get the accurate count
  // even when multiple photos arrive concurrently.
  const { data: newCount } = await getSupabase().rpc('append_carousel_item', {
    p_post_id: post.id,
    p_item: { url, is_video: false },
  });
  const count = typeof newCount === 'number' ? newCount : (post.media_items ?? []).length + 1;
  await sendCarouselProgressButtons(from, post.id, count, count >= 10);
}

// Appends a video item to an active carousel session.
// Used both for explicit /carousel collection and for burst-detection routing.
async function handleCarouselAppendVideo(from: string, post: { id: string; media_items: CarouselItem[] | null }, message: any) {
  const mediaId = message.video?.id;
  const mimeType = message.video?.mime_type ?? 'video/mp4';
  if (!mediaId) {
    await sendText(from, '📎 Couldn\'t read that video — try sending it again.');
    return;
  }

  let url: string;
  try {
    url = await downloadAndHostMedia(mediaId, mimeType);
  } catch {
    await sendText(from, '📎 Couldn\'t download that video — try again.');
    return;
  }

  const { data: newCount } = await getSupabase().rpc('append_carousel_item', {
    p_post_id: post.id,
    p_item: { url, is_video: true },
  });
  const count = typeof newCount === 'number' ? newCount : (post.media_items ?? []).length + 1;
  await sendCarouselProgressButtons(from, post.id, count, count >= 10);
}

// Finds an active collecting_carousel session that a burst video should join.
// Priority: same media_group_id → then any session updated in the last 5 seconds.
async function findBurstCarouselSession(phone: string, mediaGroupId: string | undefined) {
  const supabase = getSupabase();

  if (mediaGroupId) {
    const { data } = await supabase
      .from('pending_posts')
      .select('id, media_items')
      .eq('whatsapp_phone', phone)
      .eq('state', 'collecting_carousel')
      .eq('media_group_id', mediaGroupId)
      .maybeSingle();
    if (data) return data;
  }

  // Fallback: any carousel session touched in the last 5 seconds
  const cutoff = new Date(Date.now() - 5000).toISOString();
  const { data } = await supabase
    .from('pending_posts')
    .select('id, media_items')
    .eq('whatsapp_phone', phone)
    .eq('state', 'collecting_carousel')
    .gte('updated_at', cutoff)
    .maybeSingle();
  return data ?? null;
}

// Replaces a specific slide in a carousel (awaiting_slide_replace state).
async function handleSlideReplace(from: string, post: any, message: any, messageType: string) {
  const isVideo = messageType === 'video';
  const media = isVideo ? message.video : message.image;
  const mediaId = media?.id;
  const mimeType = media?.mime_type ?? (isVideo ? 'video/mp4' : 'image/jpeg');
  const slideIdx: number = post.editing_slide_idx ?? 0;

  if (!mediaId) {
    await sendText(from, '📎 Couldn\'t read that file — try sending it again.');
    return;
  }

  await sendText(from, `📥 Processing slide ${slideIdx + 1} replacement...`);

  let url: string;
  try {
    url = await downloadAndHostMedia(mediaId, mimeType);
  } catch {
    throw Object.assign(new Error('📎 Couldn\'t download that file — please try again.'), { userFacing: true });
  }

  const currentItems: CarouselItem[] = Array.isArray(post.media_items) ? [...post.media_items] : [];
  if (slideIdx < currentItems.length) {
    currentItems[slideIdx] = { url, is_video: isVideo };
  } else {
    currentItems.push({ url, is_video: isVideo });
  }

  const newImageUrl = currentItems[0]?.url ?? post.image_url;
  await getSupabase().from('pending_posts')
    .update({
      state: 'pending_approval',
      editing_slide_idx: null,
      media_items: currentItems,
      image_url: newImageUrl,
    })
    .eq('id', post.id);

  await sendText(from, `✅ Slide ${slideIdx + 1} replaced.`);
  await sendPostPreview(from, newImageUrl, post.caption, post.id, false, 'carousel', currentItems.length);
}

async function handleCarouselFinish(from: string, post: { id: string; media_items: CarouselItem[] | null }) {
  // Safety flush: clear any stale carousel_buffer entries that may have been
  // left by an older code path or a failed previous run.
  const { data: bufPending } = await getSupabase()
    .from('carousel_buffer')
    .select('url, created_at')
    .eq('carousel_post_id', post.id)
    .order('created_at', { ascending: true });

  if (bufPending && bufPending.length > 0) {
    for (const item of bufPending) {
      await getSupabase().rpc('append_carousel_item', {
        p_post_id: post.id,
        p_item: { url: item.url, is_video: false },
      });
    }
    await getSupabase().from('carousel_buffer').delete().eq('carousel_post_id', post.id);
  }

  // Re-fetch so media_items reflects the flushed buffer.
  const fresh = await getPostById(post.id);
  const items: CarouselItem[] = (fresh?.media_items as CarouselItem[] | null) ?? [];

  if (items.length === 0) {
    await sendText(from, '⚠️ No photos yet — send at least one photo first, or type *cancel* to bail.');
    return;
  }

  if (items.length === 1) {
    const [profileContext, recentCaptions] = await Promise.all([
      getProfileContextForPhone(from),
      getRecentCaptions(),
    ]);
    if (items[0].is_video) {
      // Single video — treat as Reel
      await sendText(from, '📥 Processing your video...');
      const captionPrompt = (fresh?.caption ?? '') ||
        '[No description — write a punchy Reel caption. Do not reference any specific product, topic or theme from recent posts.]';
      const variants = await generateCaptionVariants(captionPrompt, profileContext ?? undefined, recentCaptions, 'reels');
      const caption = variants[0] ?? '';
      await getSupabase().from('pending_posts').update({
        state: 'pending_approval', surface: 'reels', caption, is_video: true,
        image_url: items[0].url, user_image_url: items[0].url,
        image_source: 'user', media_items: null,
        ...(variants.length > 1 ? { caption_variants: variants } : {}),
      }).eq('id', post.id);
      await sendPostPreview(from, items[0].url, caption, post.id, true, 'reels');
      if (variants.length > 1) {
        const others = variants.slice(1).map((v, i) => {
          const trimmed = v.length > 140 ? v.slice(0, 140).trimEnd() + '…' : v;
          return `*${i + 2}.* ${trimmed}`;
        }).join('\n\n');
        await sendText(from, `💡 Try a different angle — reply *2* or *3* to swap:\n\n${others}`);
      }
      return;
    }

    // Single photo — treat exactly like a regular user-photo post
    await sendText(from, '📥 Processing your photo...');
    const captionPrompt = (fresh?.caption ?? '') ||
      '[No description — write a punchy, original caption for a photo post. Do not reference any specific product, topic or theme from recent posts.]';
    const variants = await generateCaptionVariants(captionPrompt, profileContext ?? undefined, recentCaptions, 'feed');
    const caption = variants[0] ?? '';
    await getSupabase().from('pending_posts').update({
      state: 'pending_approval', surface: 'feed', caption,
      image_url: items[0].url, user_image_url: items[0].url,
      image_source: 'user', media_items: null,
      ...(variants.length > 1 ? { caption_variants: variants } : {}),
    }).eq('id', post.id);
    await sendPostPreview(from, items[0].url, caption, post.id, false);
    if (variants.length > 1) {
      const others = variants.slice(1).map((v, i) => {
        const trimmed = v.length > 140 ? v.slice(0, 140).trimEnd() + '…' : v;
        return `*${i + 2}.* ${trimmed}`;
      }).join('\n\n');
      await sendText(from, `💡 Try a different angle — reply *2* or *3* to swap:\n\n${others}`);
    }
    return;
  }

  const mediaLabel = items.every(i => i.is_video) ? 'videos' : items.some(i => i.is_video) ? 'photos and videos' : 'photos';
  await sendText(from, `✍️ Writing caption for your ${items.length}-slide carousel (${mediaLabel})…`);

  const sourcePrompt: string | null = (fresh as any)?.source_prompt ?? null;
  const carouselBase = sourcePrompt
    ? `${sourcePrompt} — carousel of ${items.length} ${mediaLabel}`
    : `[Carousel of ${items.length} ${mediaLabel}. Write a single caption that frames the whole set; do not number or itemize each slide.]`;

  const [profileContext, recentCaptions] = await Promise.all([
    getProfileContextForPhone(from),
    getRecentCaptions(),
  ]);
  const variants = await generateCaptionVariants(carouselBase, profileContext ?? undefined, recentCaptions, 'carousel');
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

  await sendPostPreview(from, items[0].url, caption, post.id, false, 'carousel', items.length);

  if (variants.length > 1) {
    const others = variants.slice(1).map((v, i) => {
      const trimmed = v.length > 140 ? v.slice(0, 140).trimEnd() + '…' : v;
      return `*${i + 2}.* ${trimmed}`;
    }).join('\n\n');
    await sendText(from, `💡 Try a different angle — reply *2* or *3* to swap the caption:\n\n${others}`);
  }
}

async function handleCarouselCancel(from: string, post: { id: string }) {
  await getSupabase().from('carousel_buffer').delete().eq('carousel_post_id', post.id);
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
      ? `📸 Instagram: *@${igAccount.account_name}* ✓`
      : `📸 Instagram: *@${igAccount.account_name}* ⚠️ Token expires in ${days}d. Renew: ${connectUrl}`;
  } else {
    igLine = `📸 Instagram: *not connected*. Connect: ${connectUrl}`;
  }

  await sendText(from, `${igLine}\n\n🔗 Your account: ${APP_URL}/account?phone=${encodeURIComponent(from)}`);
  await sendConversationStarters(from, name);
}
