import { NextRequest, NextResponse } from 'next/server';
import { generateCaption } from '@/lib/caption-generator';
import { publishToInstagram } from '@/lib/instagram-publish';

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN!;
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

  return NextResponse.json({ error: 'Invalid verification token' }, { status: 403 });
}

// Incoming WhatsApp messages
export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) {
    // Not a message event (status update etc.) — acknowledge and exit
    return NextResponse.json({ ok: true });
  }

  const messageType: string = message.type;
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
    return NextResponse.json({ ok: true });
  }

  try {
    const caption = await generateCaption(userPrompt);
    const result = await publishToInstagram(caption, imageUrl);

    return NextResponse.json({ ok: true, postId: result.postId, caption });
  } catch (error: any) {
    console.error('WhatsApp webhook error:', error.message);
    // Always 200 — prevent Meta from retrying endlessly
    return NextResponse.json({ ok: false, error: error.message });
  }
}
