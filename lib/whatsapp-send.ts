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

// postId is encoded in each button ID so replying to any historical preview
// always acts on the correct post, not the latest one.
export async function sendPostPreview(to: string, imageUrl: string, caption: string, postId: string) {
  await sendText(to, `📝 Caption draft:\n\n${caption}`);

  return wa({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      header: { type: 'image', image: { link: imageUrl } },
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
