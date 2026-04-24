const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID ?? '1079839465213735';

function getToken() {
  return process.env.WHATSAPP_ACCESS_TOKEN!;
}

async function wa(body: object) {
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
  if (!res.ok) console.error('[WA send error]', JSON.stringify(data));
  return data;
}

export function sendText(to: string, text: string) {
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
// Returns true if the API accepted the message, false otherwise.
export async function sendInviteTemplate(to: string): Promise<boolean> {
  const templateName = process.env.WHATSAPP_INVITE_TEMPLATE ?? 'kreya_welcome';
  try {
    const data = await wa({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'en_US' },
      },
    });
    return !data.error;
  } catch {
    return false;
  }
}

// postId is encoded in each button ID so replying to any historical preview
// always acts on the correct post, not the latest one.
export async function sendPostPreview(to: string, imageUrl: string, caption: string, postId: string, isVideo = false) {
  await sendText(to, `📝 Caption draft:\n\n${caption}`);

  const header = isVideo
    ? { type: 'text', text: '🎬 Video ready to post' }
    : { type: 'image', image: { link: imageUrl } };

  return wa({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      header,
      body: { text: 'Ready to post this to Instagram?' },
      footer: { text: 'Tip: Edit lets you change caption, style, or image' },
      action: {
        buttons: [
          { type: 'reply', reply: { id: `approve:${postId}`, title: '✅ Approve' } },
          { type: 'reply', reply: { id: `edit:${postId}`,    title: '✏️ Edit' } },
          { type: 'reply', reply: { id: `discard:${postId}`, title: '🗑️ Discard' } },
        ],
      },
    },
  });
}
