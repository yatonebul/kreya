const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;

// WA error codes we care about handling explicitly (vs generic 5xx).
// 131030 — recipient phone not in test allowlist (Meta app in Dev mode);
// 131047 — re-engagement window expired (24h since last user message);
// 100    — invalid parameter, often template name typo / locked phone.
export const WA_RECIPIENT_NOT_ALLOWED = 131030;
export const WA_REENGAGEMENT_EXPIRED  = 131047;

export type WaResult = { ok: true; data: any } | { ok: false; code?: number; message?: string; data: any };

function getToken() {
  return process.env.WHATSAPP_ACCESS_TOKEN!;
}

async function wa(body: object): Promise<WaResult> {
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(body),
    }
  );
  const data = await res.json();
  if (!res.ok) {
    const code = data?.error?.code;
    // 131030 happens for everyone outside the test allowlist while the
    // Meta app is in Development mode. Log at warn level (not error) so
    // we can spot real bugs in logs once the app is published.
    if (code === WA_RECIPIENT_NOT_ALLOWED) {
      console.warn('[WA] recipient not in dev allowlist (Meta app needs App Review):', body);
    } else {
      console.error('[WA send error]', JSON.stringify(data));
    }
    return { ok: false, code, message: data?.error?.message, data };
  }
  return { ok: true, data };
}

export function sendImageMessage(to: string, url: string, caption?: string): Promise<WaResult> {
  return wa({
    messaging_product: 'whatsapp',
    to,
    type: 'image',
    image: { link: url, ...(caption ? { caption } : {}) },
  });
}

export function sendVideoMessage(to: string, url: string): Promise<WaResult> {
  return wa({
    messaging_product: 'whatsapp',
    to,
    type: 'video',
    video: { link: url },
  });
}

export function sendAudioMessage(to: string, url: string): Promise<WaResult> {
  return wa({
    messaging_product: 'whatsapp',
    to,
    type: 'audio',
    audio: { link: url },
  });
}

export async function sendMusicCandidatesPicker(
  to: string,
  postId: string,
  candidates: Array<{ title: string; artist: string }>,
): Promise<WaResult> {
  const list = candidates.map((c, i) => `*${i + 1}.* ${c.title} — ${c.artist}`).join('\n');
  return wa({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: `🎵 *Music options (heard above):*\n\n${list}\n\nReply with a number to swap, or:` },
      action: {
        buttons: [
          { type: 'reply', reply: { id: `music_keep:${postId}`,  title: '✓ Keep current' } },
          { type: 'reply', reply: { id: `music_more:${postId}`,  title: '🔄 New options' } },
          { type: 'reply', reply: { id: `music_none:${postId}`,  title: '🔇 No music' } },
        ],
      },
    },
  });
}

export function sendAnimateToReelOffer(to: string, sessionId: string): Promise<WaResult> {
  return wa({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text:
          '📸 *Got your photo!*\n\n' +
          'I can animate it into a Reel with motion & music, or just post it as a photo.\n\n' +
          'Send more photos to build a carousel instead.',
      },
      action: {
        buttons: [
          { type: 'reply', reply: { id: `reel_from_image:${sessionId}`, title: '🎬 Animate to Reel' } },
          { type: 'reply', reply: { id: `carousel_done:${sessionId}`,   title: '✅ Post as photo'   } },
        ],
      },
    },
  });
}

export function sendAnimationStyleChoice(to: string, postId: string, includeQuick: boolean = false): Promise<WaResult> {
  let body: string;
  let buttons: Array<{ type: 'reply'; reply: { id: string; title: string } }>;

  if (includeQuick) {
    // Multi-photo mode: include quick-zoom transitions
    body =
      '🎬 *Choose your animation style:*\n\n' +
      '⚡ *Quick* — Fast transitions\n' +
      '✨ *Elegant* — Smooth pan\n' +
      '🌅 *Cinematic* — Epic motion';
    buttons = [
      { type: 'reply', reply: { id: `anim_quick:${postId}`, title: '⚡ Quick' } },
      { type: 'reply', reply: { id: `anim_elegant:${postId}`, title: '✨ Elegant' } },
      { type: 'reply', reply: { id: `anim_cinematic:${postId}`, title: '🌅 Cinematic' } },
    ];
  } else {
    // Single photo mode: skip quick-zoom (no cuts to make), show other styles
    body =
      '🎬 *Choose your animation style:*\n\n' +
      '✨ *Elegant* — Smooth pan\n' +
      '🌅 *Cinematic* — Epic motion\n' +
      '💫 *Float* — Gentle drift';
    buttons = [
      { type: 'reply', reply: { id: `anim_elegant:${postId}`, title: '✨ Elegant' } },
      { type: 'reply', reply: { id: `anim_cinematic:${postId}`, title: '🌅 Cinematic' } },
      { type: 'reply', reply: { id: `anim_float:${postId}`, title: '💫 Float' } },
    ];
  }

  return wa({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      action: { buttons },
    },
  });
}

export function sendPreviewOptions(to: string, postId: string, previewUrl: string, caption?: string, editUrl?: string): Promise<WaResult> {
  const captionLine = caption ? `\n\n*Caption:*\n${caption}` : '';
  const editLine    = editUrl  ? `\n\n✏️ Edit on web: ${editUrl}` : '';
  return wa({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: {
        text: `✅ *Here's your preview!*${captionLine}${editLine}\n\nHappy with it? Or tweak before posting.`,
      },
      action: {
        button: '⚙️ Options',
        sections: [
          {
            rows: [
              { id: `approve_reel:${postId}`,  title: '👍 Continue',         description: 'Looks great — publish it' },
              { id: `retry_music:${postId}`,   title: '🎵 Different music',  description: 'Pick a new track' },
              { id: `retry_anim:${postId}`,    title: '🎨 Different style',  description: 'Change animation style' },
              { id: `edit_caption:${postId}`,  title: '✏️ Edit caption',     description: 'Change the caption text' },
              { id: `bg_style:${postId}`,      title: '🖼️ Background',       description: 'Blur fill or black bars' },
              { id: `discard_reel:${postId}`,  title: '🗑️ Discard',          description: 'Throw this away and start fresh' },
            ],
          },
        ],
      },
    },
  });
}

export function sendBgStyleChoice(to: string, postId: string): Promise<WaResult> {
  return wa({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: '🖼️ *Background style*\n\n🌫️ *Blur fill* — blurred version of your clip fills the frame (looks great on Reels)\n⬛ *Black bars* — classic letterbox',
      },
      action: {
        buttons: [
          { type: 'reply', reply: { id: `bg_blur:${postId}`,  title: '🌫️ Blur fill'   } },
          { type: 'reply', reply: { id: `bg_black:${postId}`, title: '⬛ Black bars'   } },
        ],
      },
    },
  });
}

export function sendMusicChoice(to: string, postId: string): Promise<WaResult> {
  return wa({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text:
          '🎵 *Sound it up?*\n\n' +
          '🔥 *Trending* — Hot audio that matches your vibe\n' +
          '🧘 *Calm* — Peaceful, soothing background\n' +
          '🔇 *Silent* — Just the visual (no music)',
      },
      action: {
        buttons: [
          { type: 'reply', reply: { id: `music_trending:${postId}`, title: '🔥 Trending' } },
          { type: 'reply', reply: { id: `music_calm:${postId}`, title: '🧘 Calm' } },
          { type: 'reply', reply: { id: `music_none:${postId}`, title: '🔇 Silent' } },
        ],
      },
    },
  });
}

export function sendText(to: string, text: string): Promise<WaResult> {
  return wa({
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text },
  });
}

// Sends OTP via an authentication template (works outside the 24-hour messaging window).
// Falls back to free-form text when WHATSAPP_OTP_TEMPLATE is not set.
export async function sendOtpCode(to: string, code: string) {
  const templateName = process.env.WHATSAPP_OTP_TEMPLATE;
  if (templateName) {
    return wa({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'en' },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: code }] },
          { type: 'button', sub_type: 'COPY_CODE', index: '0', parameters: [{ type: 'coupon_code', coupon_code: code }] },
        ],
      },
    });
  }
  return sendText(to, `Your Kreya verification code: *${code}*\n\nValid for 10 minutes. Don't share this with anyone.`);
}

// Outbound invite — requires a template approved in Meta Business Manager.
// Template name configured via WHATSAPP_INVITE_TEMPLATE env var.
// Returns the WaResult so callers can branch on dev-mode (131030) without
// retrying or surfacing the raw Meta error to end users.
export async function sendInviteTemplate(to: string): Promise<WaResult> {
  const templateName = process.env.WHATSAPP_INVITE_TEMPLATE ?? 'kreya_welcome';
  return wa({
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'en_US' },
    },
  });
}

// AI-suggested niche/tone after voice learning. Encodes the suggestion in
// the button id so the webhook can apply it without re-fetching captions.
// Niche/tone may contain spaces; we URI-encode and keep it short (WA caps
// button id at 256 chars). Title is capped at 20 chars by WhatsApp.
export async function sendBrandSuggestion(
  to: string,
  accountName: string,
  niche: string | undefined,
  tone: string | undefined,
) {
  if (!niche && !tone) return;
  const parts: string[] = [];
  if (niche) parts.push(`niche → *${niche}*`);
  if (tone)  parts.push(`tone → *${tone}*`);
  const body =
    `🪞 Based on @${accountName}'s captions, your voice reads as:\n\n` +
    parts.map((p) => `• ${p}`).join('\n') +
    `\n\nUpdate the brand profile so future posts match this?`;

  const id = `apply_brand:${encodeURIComponent(niche ?? '')}:${encodeURIComponent(tone ?? '')}`;
  return wa({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      action: {
        buttons: [
          { type: 'reply', reply: { id: id.slice(0, 256), title: '✅ Yes, update' } },
          { type: 'reply', reply: { id: 'skip_brand_update',  title: '👌 Skip' } },
        ],
      },
    },
  });
}

// One-shot opt-in prompt sent the first time a comment or DM lands on
// an account that hasn't enabled engagement yet. Buttons map to
// engagement-flag mutations: enable both, comments only, or skip.
// engagement_offered_at is stamped after this fires so we don't keep
// asking on every event.
export async function sendEngagementOptIn(
  to: string,
  igUserId: string,
  accountName: string | null,
) {
  const accountTag = accountName ? `@${accountName}` : 'your account';
  return wa({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text:
          `📨 Someone just commented or DMed *${accountTag}*.\n\n` +
          `Want me to draft replies in your brand voice? You'll always approve before anything sends — I never reply on my own.\n\n` +
          `_(You can change this anytime: 'engagement on/off' on WA, or via /account.)_`,
      },
      action: {
        buttons: [
          { type: 'reply', reply: { id: `eng_on_all:${igUserId}`,      title: '✅ Yes, both' } },
          { type: 'reply', reply: { id: `eng_on_comments:${igUserId}`, title: '💬 Comments only' } },
          { type: 'reply', reply: { id: `eng_off:${igUserId}`,         title: '👋 No thanks' } },
        ],
      },
    },
  });
}

// DM auto-reply approval card — same shape as sendCommentApproval but
// routed through dm_send / dm_skip handlers since IG comment replies
// and IG DM sends use different Graph API endpoints.
export async function sendDmApproval(
  to: string,
  eventId: string,
  accountName: string | null,
  messageText: string,
  draftReply: string,
) {
  const accountTag = accountName ? `@${accountName}` : 'your account';
  const body =
    `📨 *New DM to ${accountTag}*\n\n` +
    `_"${messageText.slice(0, 220)}"_\n\n` +
    `🤖 *Draft reply:*\n${draftReply}`;
  return wa({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      action: {
        buttons: [
          { type: 'reply', reply: { id: `dm_send:${eventId}`, title: '✅ Send DM' } },
          { type: 'reply', reply: { id: `dm_skip:${eventId}`, title: '👋 Skip' } },
        ],
      },
    },
  });
}

// Engagement auto-reply approval card. Surfaces a stranger's comment
// + an AI-drafted brand-voice reply with [Send / Edit / Skip]. Edit
// flow currently maps to Skip + ask user to reply manually — full
// edit-in-place is a Phase D.5.
export async function sendCommentApproval(
  to: string,
  eventId: string,
  accountName: string | null,
  commenter: string,
  commentText: string,
  draftReply: string,
) {
  const accountTag = accountName ? `@${accountName}` : 'your account';
  const body =
    `💬 *New comment on ${accountTag}*\n\n` +
    `From *@${commenter}*:\n_"${commentText.slice(0, 220)}"_\n\n` +
    `🤖 *Draft reply:*\n${draftReply}`;
  return wa({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      action: {
        buttons: [
          { type: 'reply', reply: { id: `comment_send:${eventId}`, title: '✅ Send reply' } },
          { type: 'reply', reply: { id: `comment_skip:${eventId}`, title: '👋 Skip' } },
        ],
      },
    },
  });
}

// Sent right after a publish succeeds — offers to repurpose the just-
// published idea into other surfaces. Source surface determines what
// makes sense:
//   feed photo → carousel (deeper version) + reel script (film it)
//   reel       → carousel (extract narrative)
//   carousel   → reel script (one-liner version)
// Button ids encode the source post id so the handler can fetch the
// caption and brand voice without extra round-trips.
export async function sendRepurposeOffer(
  to: string,
  postId: string,
  sourceSurface: 'feed' | 'reels' | 'carousel',
) {
  // WA caps button messages at 3 buttons. Always offer Story (most
  // creators undersell their idea by not also putting it on Stories)
  // plus one of Carousel/Reel depending on what the source isn't.
  const buttons: { type: 'reply'; reply: { id: string; title: string } }[] = [
    { type: 'reply', reply: { id: `spin_story:${postId}`, title: '🌅 Story' } },
  ];
  if (sourceSurface !== 'carousel') {
    buttons.push({ type: 'reply', reply: { id: `spin_carousel:${postId}`, title: '🖼️ Carousel' } });
  } else {
    buttons.push({ type: 'reply', reply: { id: `spin_reel:${postId}`, title: '🎬 Reel script' } });
  }
  buttons.push({ type: 'reply', reply: { id: 'spin_skip', title: '👌 Not now' } });

  return wa({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text:
          '🔁 *Repurpose this idea?*\n\n' +
          'I can spin the same idea into a different format — keeps your week of content flowing from one voice note.',
      },
      action: { buttons },
    },
  });
}

// Post-publish engagement loop — three quick-reply buttons that keep the
// creator in the chat instead of ending the conversation on a flat 'live!'
// message. Button IDs are routed in the webhook (handleButtonReply).
// Schedule is no longer here because it now lives in the draft preview list.
export async function sendRetryButton(to: string, retryActionId: string, message: string) {
  return wa({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: message },
      action: {
        buttons: [
          { type: 'reply', reply: { id: retryActionId, title: '🔄 Try again' } },
        ],
      },
    },
  });
}

// Shown after a publish failure so the user can retry or discard without typing.
// retryActionId maps to `approve:${postId}` — tapping re-triggers the full publish flow.
export async function sendPublishFailureActions(to: string, postId: string, contentType: string) {
  return wa({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: `⚠️ Couldn't post your ${contentType} — Instagram returned a temporary error. Your draft is saved.` },
      action: {
        buttons: [
          { type: 'reply', reply: { id: `approve:${postId}`,  title: '🔄 Try again' } },
          { type: 'reply', reply: { id: `discard:${postId}`,  title: '🗑️ Discard' } },
        ],
      },
    },
  });
}

export async function sendConversationStarters(to: string, name: string) {
  const body = `👋 Hey *${name}*!\n\nWhat would you like to do?`;
  return wa({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'create_post',   title: '✨ Create a post' } },
          { type: 'reply', reply: { id: 'check_status',  title: '📋 Check status' } },
          { type: 'reply', reply: { id: 'visit_dashboard', title: '📊 Dashboard' } },
        ],
      },
    },
  });
}

export async function sendPostPublishedActions(to: string, postUrl: string | undefined, postLabel: string, platforms?: string[]) {
  const linkLine = postUrl ? `\n\n🔗 ${postUrl}` : '';
  const platformSuffix = platforms && platforms.length > 1
    ? ` on ${platforms.map(p => p === 'instagram' ? 'Instagram' : 'TikTok').join(' + ')}`
    : '';
  const body = `🎉 Your ${postLabel} is live${platformSuffix}!${linkLine}\n\nKeep the streak going — what's next?`;
  return wa({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'next_post',       title: '➕ Next post' } },
          { type: 'reply', reply: { id: 'refresh_voice',   title: '🧠 Refresh voice' } },
          { type: 'reply', reply: { id: 'visit_dashboard', title: '📊 Dashboard' } },
        ],
      },
    },
  });
}

// Used after a draft is approved-and-scheduled (state='scheduled') so the
// user gets the same post-publish engagement loop, just with a different
// confirmation line.
export async function sendScheduledActions(to: string, scheduledForLabel: string, platforms?: string[]) {
  const platformSuffix = platforms && platforms.length > 0
    ? ` on ${platforms.map(p => p === 'instagram' ? 'Instagram' : 'TikTok').join(' + ')}`
    : '';
  return wa({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: `📅 Scheduled for *${scheduledForLabel}*${platformSuffix}. I'll post it automatically — no need to do anything else.\n\nWhile you're here:`,
      },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'next_post',       title: '➕ Next post' } },
          { type: 'reply', reply: { id: 'refresh_voice',   title: '🧠 Refresh voice' } },
          { type: 'reply', reply: { id: 'visit_dashboard', title: '📊 Dashboard' } },
        ],
      },
    },
  });
}

// Draft preview now uses an interactive *list* (up to 10 rows) so we can
// expose Approve / Schedule / Edit / Discard up front. WhatsApp button
// messages cap at 3 buttons, which forced Schedule into a separate
// post-publish nudge — but that timing was wrong (user has already
// committed by then). With a list we can offer all actions at draft time.
//
// Photos: image is sent as its own WA media message first so the user
// can see what they're approving, since list messages don't support
// image headers (only text). Videos: text header noting it's a Reel
// preview.
export async function sendPostPreview(
  to: string,
  imageUrl: string,
  caption: string,
  postId: string,
  isVideo = false,
  surface: 'feed' | 'reels' | 'carousel' | 'story' = isVideo ? 'reels' : 'feed',
  slideCount?: number,
) {
  const isReel    = surface === 'reels';
  const isCarousel = surface === 'carousel';
  const isStory   = surface === 'story';

  // Send the first slide / cover photo so the user sees it alongside the action list.
  if (!isVideo && imageUrl) {
    await wa({
      messaging_product: 'whatsapp',
      to,
      type: 'image',
      image: { link: imageUrl },
    });
  }

  const captionLabel = isStory ? '🎙️ *Hook (overlay text):*' : '🎙️ *Caption:*';
  await sendText(to, `${captionLabel}\n\n${caption}`);

  const headerText = isCarousel
    ? `🎡 Carousel Draft${slideCount && slideCount > 1 ? ` (${slideCount} slides)` : ''}`
    : isStory
      ? '📱 Story Draft'
      : isReel
        ? '🎬 Reel Draft'
        : isVideo
          ? '🎬 Video ready'
          : '📷 Draft';

  const bodyText = isCarousel
    ? 'Carousel ready. Approve, schedule, or refine before posting.'
    : isStory
      ? 'Story ready — no caption, just the visual. Approve to push to your 24-hour Story strip.'
      : isReel
        ? 'How do you want to send this Reel? It will show on your Reels tab AND your grid.'
        : 'How do you want to send this?';

  return wa({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: headerText },
      body: { text: bodyText },
      footer: { text: 'Tip: tap an option below' },
      action: {
        button: 'Choose action',
        sections: [
          {
            title: 'Send it',
            rows: [
              { id: `approve:${postId}`,  title: '✅ Approve & post now', description: 'Publishes immediately to Instagram' },
              { id: `schedule:${postId}`, title: '📅 Schedule for later',  description: 'Pick a time, I post automatically' },
            ],
          },
          {
            title: 'Refine or drop',
            rows: [
              { id: `edit:${postId}`,    title: '✏️ Edit',    description: 'Change caption, image, or style' },
              { id: `discard:${postId}`, title: '🗑️ Discard', description: 'Drop this draft' },
            ],
          },
        ],
      },
    },
  });
}

// Shown when user taps "Add Slides" on a single-image post.
// Lets them choose between uploading photos or generating AI slides.
export async function sendAddSlidesChoice(to: string, postId: string) {
  return wa({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: '🎞️ *Carousel mode* — your current image is slide 1.\n\nSend more photos to add them, or generate AI slides:' },
      action: {
        buttons: [
          { type: 'reply', reply: { id: `gen_ai_slides:${postId}`, title: '🤖 Generate AI slides' } },
          { type: 'reply', reply: { id: `cancel_edit:${postId}`,   title: '❌ Cancel' } },
        ],
      },
    },
  });
}

export async function sendEditActionsMenu(to: string, postId: string, isVideo: boolean, mediaItemCount = 0) {
  const isCarousel = mediaItemCount > 1;
  const editOptions: { id: string; title: string; description: string }[] = [
    { id: `edit_caption:${postId}`, title: '✍️ Caption', description: 'Tone, length, angle, language' },
  ];

  if (!isVideo) {
    if (isCarousel) {
      // Carousel: offer slide-level picker instead of single image edit, no "Add Slides"
      editOptions.push({ id: `edit_slide_picker:${postId}`, title: '🖼️ Edit Media', description: 'Replace or generate a slide' });
      editOptions.push({ id: `carousel_reorder:${postId}`, title: '🔀 Re-order', description: 'Change the slide sequence' });
    } else {
      editOptions.push({ id: `edit_image:${postId}`, title: '🖼️ Image', description: 'Regenerate or change style' });
      editOptions.push({ id: `add_slides:${postId}`, title: '🎞️ Add Slides', description: 'Turn into a multi-image carousel' });
    }
    editOptions.push({ id: `spin_story:${postId}`, title: '🌅 Story', description: 'Convert into a vertical Story' });
  } else {
    editOptions.push({ id: `edit_video:${postId}`, title: '🎬 Video', description: 'Replace with a new video' });
  }

  editOptions.push({ id: `cancel_edit:${postId}`, title: '✖️ Cancel', description: 'Discard changes, back to draft' });

  return wa({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: '✏️ What to edit?' },
      body: { text: 'Choose what you\'d like to change:' },
      footer: { text: 'Tip: tap an option below' },
      action: {
        button: 'Edit options',
        sections: [
          {
            title: 'Edit',
            rows: editOptions,
          },
        ],
      },
    },
  });
}

// Carousel slide selector: lets the user pick which slide to replace during edit.
// Supports up to 8 slides (WA list max is 10 rows; reserve 2 for Replace All + Generate AI).
export async function sendCarouselSlideSelector(to: string, postId: string, slideCount: number) {
  const rows: { id: string; title: string; description: string }[] = Array.from(
    { length: Math.min(slideCount, 8) },
    (_, i) => ({
      id: `edit_slide:${postId}:${i}`,
      title: `🖼️ Slide ${i + 1}`,
      description: `Upload photo/video or generate AI image`,
    }),
  );
  rows.push({
    id: `edit_all_slides:${postId}`,
    title: '🎞️ Replace All',
    description: 'Clear all slides and send new ones',
  });
  rows.push({
    id: `gen_ai_carousel_slide:${postId}`,
    title: '🤖 Generate AI slide',
    description: 'Pick a slot and describe the image',
  });

  return wa({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: '🖼️ Which slide to replace?' },
      body: { text: `Your carousel has ${slideCount} slides. Pick the one you want to change:` },
      footer: { text: 'Send new media after selecting' },
      action: {
        button: 'Choose slide',
        sections: [{ title: 'Slides', rows }],
      },
    },
  });
}

export async function sendSlideReplacePrompt(to: string, postId: string, slideIdx: number) {
  return wa({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: `🖼️ *Replace slide ${slideIdx + 1}*\n\nSend a photo or video to replace it, or generate a new AI image.` },
      action: {
        buttons: [
          { type: 'reply', reply: { id: `gen_ai_slide_pick:${postId}:${slideIdx}`, title: '🤖 Generate AI' } },
          { type: 'reply', reply: { id: `cancel_slide_replace:${postId}`,          title: '✖️ Cancel' } },
        ],
      },
    },
  });
}

// Button-driven reorder menu. Shows each slide as a tappable row that moves
// it to the front (most common reorder need). For 2 slides: offers swap.
export async function sendCarouselReorderMenu(
  to: string,
  postId: string,
  items: { url: string; is_video?: boolean }[],
  appUrl: string,
) {
  const n = items.length;

  if (n === 2) {
    // For 2 slides, offer a single "Swap" button — unambiguous
    return wa({
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        header: { type: 'text', text: '🔀 Reorder slides' },
        body: {
          text: `1. ${items[0].is_video ? '🎬 Video' : '📷 Photo'} — ${appUrl}/p/${postId}/0\n2. ${items[1].is_video ? '🎬 Video' : '📷 Photo'} — ${appUrl}/p/${postId}/1\n\nSwap the two slides?`,
        },
        action: {
          buttons: [
            { type: 'reply', reply: { id: `reorder_swap:${postId}`, title: '🔄 Swap order' } },
            { type: 'reply', reply: { id: `carousel_done:${postId}`, title: '✅ Keep as is' } },
          ],
        },
      },
    });
  }

  // For 3–10 slides: list with "Put slide N first" + a "Keep order" row
  const rows = items.map((it, i) => ({
    id: `reorder_first:${postId}:${i}`,
    title: `📍 Put slide ${i + 1} first`,
    description: `${it.is_video ? '🎬 Video' : '📷 Photo'} — ${appUrl}/p/${postId}/${i}`,
  }));
  rows.push({ id: `carousel_done:${postId}`, title: '✅ Keep current order', description: 'Proceed without changing order' });

  return wa({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: '🔀 Reorder slides' },
      body: { text: `${n} slides collected. Tap a slide to move it to position 1, or keep the current order.` },
      action: {
        button: 'Reorder',
        sections: [{ title: 'Move a slide to the front', rows }],
      },
    },
  });
}

// Shown after each media item is added to a collecting_carousel session.
// Full list menu so user can pick the output surface or edit the set.
export async function sendCarouselProgressButtons(to: string, postId: string, slideCount: number, isAtMax = false) {
  const header = isAtMax
    ? `🎞️ ${slideCount} slides — max reached`
    : `📸 ${slideCount} slide${slideCount === 1 ? '' : 's'} collected`;
  const body = isAtMax
    ? 'Choose what to create, or send fewer slides first:'
    : 'Send more media, or choose what to create:';

  return wa({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: header },
      body: { text: body },
      action: {
        button: 'Choose action',
        sections: [
          {
            title: 'Create',
            rows: [
              { id: `carousel_done:${postId}`,     title: '🎠 Carousel',    description: 'Write caption & post as a swipeable carousel' },
              { id: `carousel_as_story:${postId}`, title: '📱 Story strip',  description: 'Post all slides to your 24h Story strip' },
              { id: `carousel_as_reel:${postId}`,  title: '🎬 Reel',        description: 'Turn the video into a Reel post' },
            ],
          },
          {
            title: 'Edit',
            rows: [
              { id: `carousel_reorder:${postId}`,  title: '🔀 Re-order',    description: 'Change the slide sequence' },
              { id: `carousel_discard:${postId}`,  title: '🗑️ Discard',     description: 'Delete everything and start over' },
            ],
          },
        ],
      },
    },
  });
}

// Before any repurpose spin, ask whether to reuse originals or generate new AI visuals.
export async function sendRepurposeAssetChoice(
  to: string,
  postId: string,
  targetSurface: 'carousel' | 'story' | 'reel',
  assetCount: number,
) {
  const label = targetSurface === 'carousel' ? '🎠 Carousel' : targetSurface === 'story' ? '📱 Story' : '🎬 Reel';
  const assetLabel = assetCount === 1 ? '1 original' : `${assetCount} originals`;
  return wa({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: `${label} — *which visuals should I use?*\n\nYou have ${assetLabel} from this post. Use them, or generate fresh AI images?`,
      },
      action: {
        buttons: [
          { type: 'reply', reply: { id: `spin_${targetSurface}_assets:${postId}`, title: '📸 Use my originals' } },
          { type: 'reply', reply: { id: `spin_${targetSurface}_ai:${postId}`,     title: '🤖 Generate new' } },
          { type: 'reply', reply: { id: 'spin_skip',                              title: '❌ Cancel' } },
        ],
      },
    },
  });
}

// For multi-story drafts: list each asset with a "Remove" row so user can
// prune the set before publishing. Unlike carousel, stories are independent
// so removal makes more sense than replacement.
export async function sendStorySlideManager(to: string, postId: string, items: { url: string; is_video?: boolean }[]) {
  const rows = items.map((it, i) => ({
    id: `story_remove:${postId}:${i}`,
    title: `🗑️ Remove ${it.is_video ? 'Video' : 'Photo'} ${i + 1}`,
    description: `Drop slide ${i + 1} from your Story strip`,
  }));

  return wa({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: `📱 ${items.length} Stories ready` },
      body: { text: 'Tap a slide to remove it from the batch, or approve to publish all:' },
      footer: { text: 'Removed slides are dropped permanently' },
      action: {
        button: 'Manage slides',
        sections: [{ title: 'Remove a slide', rows }],
      },
    },
  });
}

export async function sendReelSurfaceToggle(to: string, postId: string, currentSurface: 'reels' | 'feed' = 'reels') {
  return wa({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text:
          '🎯 *Where should this Reel go?*\n\n' +
          `Currently set to: *${currentSurface === 'reels' ? 'Reels tab + Grid' : 'Feed / Grid only'}*\n\n` +
          (currentSurface === 'reels'
            ? 'Publishing to Reels shows your video on the Reels tab AND your grid for maximum reach.'
            : 'Publishing to Feed shows your video only on your grid.'),
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: {
              id: `set_surface:${postId}:reels`,
              title: `${currentSurface === 'reels' ? '✓ ' : ''}🎬 Reels tab + Grid`,
            },
          },
          {
            type: 'reply',
            reply: {
              id: `set_surface:${postId}:feed`,
              title: `${currentSurface === 'feed' ? '✓ ' : ''}📷 Feed / Grid only`,
            },
          },
        ],
      },
    },
  });
}

export async function sendCoverFramePicker(to: string, postId: string, frameUrls: string[]) {
  if (!frameUrls.length) return;

  // Send frames as a carousel of images
  for (let i = 0; i < frameUrls.length; i++) {
    await wa({
      messaging_product: 'whatsapp',
      to,
      type: 'image',
      image: { link: frameUrls[i] },
    });
  }

  // Send selection menu
  return wa({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: '🖼️ Pick a cover frame' },
      body: { text: `Choose which frame should be your Reel thumbnail. You have ${frameUrls.length} keyframes to pick from.` },
      footer: { text: 'The cover shows on your grid' },
      action: {
        button: 'Select frame',
        sections: [
          {
            title: 'Cover frames',
            rows: frameUrls.map((_, idx) => ({
              id: `pick_frame:${postId}:${idx}`,
              title: `Frame ${idx + 1}`,
              description: `${((idx + 1) / frameUrls.length * 100).toFixed(0)}% through the video`,
            })),
          },
        ],
      },
    },
  });
}

// Send animation failure with fallback options to post as static image
export async function sendAnimationFailureWithFallbacks(
  to: string,
  postId: string,
  errorReason: string,
) {
  const messageText = `⚠️ Reel animation couldn't be generated\n\n*Why:* ${errorReason}\n\nYou can still post this with a static image instead.`;

  return wa({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: messageText },
      action: {
        buttons: [
          { type: 'reply', reply: { id: `animate_fallback_static:${postId}`, title: '📸 Post Image' } },
          { type: 'reply', reply: { id: `animate_fallback_retry:${postId}`, title: '🔄 Retry' } },
          { type: 'reply', reply: { id: `discard:${postId}`, title: '🗑️ Discard' } },
        ],
      },
    },
  });
}

// Pre-Flight menu — shown after "Done" or collection close when multiple platforms are connected.
// Sends a composite preview (first asset image + caption) then a 3-button choice:
//   🚀 ALL PLATFORMS — publish everywhere connected
//   ⚙️ CUSTOMIZE     — pick specific platforms
//   ✍️ EDIT CAPTION  — refine caption before posting
export async function sendPreFlightMenu(
  to: string,
  postId: string,
  previewUrl: string,
  caption: string,
  connectedPlatforms: string[],
): Promise<WaResult> {
  // Send preview image so user sees what they're posting
  if (previewUrl) {
    await wa({
      messaging_product: 'whatsapp',
      to,
      type: 'image',
      image: { link: previewUrl },
    });
  }

  const platformList = connectedPlatforms.map(p => {
    if (p === 'instagram') return 'Instagram';
    if (p === 'tiktok') return 'TikTok';
    return p;
  }).join(' + ');

  await wa({
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: `🎙️ *Caption:*\n\n${caption}` },
  });

  return wa({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      header: { type: 'text', text: '🚀 Ready to publish?' },
      body: { text: `Connected: ${platformList}\n\nWhere do you want to post?` },
      action: {
        buttons: [
          { type: 'reply', reply: { id: `preflight_all:${postId}`, title: '🚀 All Platforms' } },
          { type: 'reply', reply: { id: `preflight_customize:${postId}`, title: '⚙️ Customize' } },
          { type: 'reply', reply: { id: `edit:${postId}`, title: '✍️ Edit Caption' } },
        ],
      },
    },
  });
}

// Customize menu — platform toggle list for picking specific destinations.
// Action IDs use flat prefixes (no colons within the prefix) to work with
// the webhook router which splits on the FIRST colon only.
export async function sendPlatformCustomizeMenu(
  to: string,
  postId: string,
  connectedPlatforms: string[],
): Promise<WaResult> {
  const platformActionMap: Record<string, string> = {
    instagram: 'preflight_ig',
    tiktok: 'preflight_tt',
  };

  const rows = connectedPlatforms.map(p => {
    const label = p === 'instagram' ? 'Instagram' : p === 'tiktok' ? 'TikTok' : p;
    const actionPrefix = platformActionMap[p] ?? `preflight_${p}`;
    return { id: `${actionPrefix}:${postId}`, title: `📲 ${label} only`, description: `Post to ${label} only` };
  });

  rows.push({ id: `preflight_all:${postId}`, title: '🚀 All platforms', description: 'Publish everywhere' });

  return wa({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: '⚙️ Choose where to post' },
      body: { text: 'Select a destination for this post.' },
      footer: { text: 'You can also post to individual platforms' },
      action: {
        button: 'Select platform',
        sections: [{ title: 'Platforms', rows }],
      },
    },
  });
}

// Log detailed animation error for admin debugging
export function logAnimationError(
  postId: string,
  phone: string,
  errorType: string,
  errorMessage: string,
  context: Record<string, any> = {},
) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    postId,
    phone,
    errorType,
    errorMessage,
    ...context,
  };

  console.error('[ANIMATION_ERROR]', JSON.stringify(logEntry));
}
