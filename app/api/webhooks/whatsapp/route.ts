import { NextRequest, NextResponse } from 'next/server';
import { generateCaption } from '@/lib/caption-generator';
import { publishToInstagram } from '@/lib/instagram-publish';

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN ?? 'kreya_whatsapp_2026';
const DEFAULT_IMAGE_URL = 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1080&q=80';

// Meta webhook verification handshake
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Invalid verification token', received_token: token, expected: VERIFY_TOKEN, mode }, { status: 403 });
}

// Incoming WhatsApp messages
export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    console.error('WhatsApp webhook: Invalid JSON received');
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  console.log('WhatsApp webhook POST received:', JSON.stringify(body, null, 2));

  const entry = body.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;
  const message = value?.messages?.[0];

  if (!message) {
    console.log('WhatsApp webhook: No message found in payload. Event type:', value?.statuses ? 'status_update' : 'unknown');
    // Not a message event (status update etc.) — acknowledge and exit
    return NextResponse.json({ ok: true });
  }

  const messageType: string = message.type;
  const messageId = message.id;
  const senderId = message.from;

  console.log(`Processing ${messageType} message ${messageId} from ${senderId}`);

  let userPrompt = '';
  let imageUrl = DEFAULT_IMAGE_URL;

  if (messageType === 'text') {
    userPrompt = message.text?.body ?? '';
  } else if (messageType === 'image') {
    userPrompt = message.image?.caption ?? 'A beautiful moment captured';
    // Media download not yet implemented — uses default image
  } else if (messageType === 'audio') {
    // Speech-to-text not yet implemented
    userPrompt = 'Check out this audio message';
  } else {
    console.log(`Skipping unsupported message type: ${messageType}`);
    return NextResponse.json({ ok: true });
  }

  if (!userPrompt) {
    console.warn(`Message ${messageId}: Empty prompt extracted`);
    return NextResponse.json({ ok: true });
  }

  try {
    console.log(`Generating caption for prompt: "${userPrompt.substring(0, 50)}..."`);
    const caption = await generateCaption(userPrompt);

    console.log(`Publishing to Instagram with caption: "${caption.substring(0, 50)}..."`);
    const result = await publishToInstagram(caption, imageUrl);

    console.log(`Successfully published post ${result.postId} from WhatsApp message ${messageId}`);
    return NextResponse.json({ ok: true, postId: result.postId, caption });
  } catch (error: any) {
    console.error(`WhatsApp webhook error processing message ${messageId}:`, error.message);
    // Always 200 — prevent Meta from retrying endlessly
    return NextResponse.json({ ok: false, error: error.message });
  }
}
