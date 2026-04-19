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

export function sendPostPreview(to: string, imageUrl: string, caption: string) {
  const bodyText = caption.length > 900 ? caption.slice(0, 897) + '...' : caption;
  const footer = caption.length > 900 ? 'Truncated — choose Edit to refine' : 'Ready to post?';

  return wa({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      header: { type: 'image', image: { link: imageUrl } },
      body: { text: bodyText },
      footer: { text: footer },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'approve', title: '✅ Approve' } },
          { type: 'reply', reply: { id: 'edit', title: '✏️ Edit' } },
          { type: 'reply', reply: { id: 'discard', title: '🗑️ Discard' } },
        ],
      },
    },
  });
}
