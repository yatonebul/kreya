const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID ?? '1079839465213735';

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
export async function sendPostPublishedActions(to: string, postUrl: string | undefined, postLabel: string) {
  const linkLine = postUrl ? `\n\n🔗 ${postUrl}` : '';
  const body = `🎉 Your ${postLabel} is live!${linkLine}\n\nKeep the streak going — what's next?`;
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
export async function sendScheduledActions(to: string, scheduledForLabel: string) {
  return wa({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: `📅 Scheduled for *${scheduledForLabel}*. I'll post it automatically — no need to do anything else.\n\nWhile you're here:`,
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
  surface: 'feed' | 'reels' = isVideo ? 'reels' : 'feed',
) {
  const isReel = surface === 'reels';

  // Send the photo as its own message first so the user can see it
  // alongside the action list.
  if (!isVideo && imageUrl) {
    await wa({
      messaging_product: 'whatsapp',
      to,
      type: 'image',
      image: { link: imageUrl },
    });
  }

  await sendText(to, `🎙️ *Caption:*\n\n${caption}`);

  const headerText = isReel
    ? '🎬 Reel preview — ready'
    : isVideo
      ? '🎬 Video ready'
      : '📷 Photo ready';

  const bodyText = isReel
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
