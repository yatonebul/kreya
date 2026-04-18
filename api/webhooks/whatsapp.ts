import { createClient } from '@supabase/supabase-js';
import { generateCaption } from '@/lib/caption-generator';
import { publishToInstagram } from '@/lib/instagram-publish';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// WhatsApp webhook verification token (set in .env.local)
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'kreya-verify-token';

// Test image URL (fallback if user doesn't send image)
const DEFAULT_IMAGE_URL = 'https://via.placeholder.com/1080x1350?text=Kreya+Post';

export default async function handler(req: any, res: any) {
  // --- WEBHOOK VERIFICATION (GET) ---
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('Webhook verified');
      return res.status(200).send(challenge);
    }

    return res.status(403).json({ error: 'Invalid verification token' });
  }

  // --- MESSAGE HANDLING (POST) ---
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body;

    // Extract message from WhatsApp webhook payload
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) {
      // Not a message event, return 200 to acknowledge
      return res.status(200).json({ ok: true });
    }

    const messageType = message.type; // 'text', 'image', 'audio', etc.
    const messageData = message[messageType];
    let userPrompt = '';
    let imageUrl = DEFAULT_IMAGE_URL;

    // --- PARSE MESSAGE CONTENT ---
    if (messageType === 'text') {
      userPrompt = messageData.body;
      console.log('Received text:', userPrompt);
    } else if (messageType === 'image') {
      // Image received; use placeholder caption
      userPrompt = 'A beautiful moment captured';
      // TODO: Implement image download via Media ID if needed
      console.log('Received image, media ID:', messageData.id);
    } else if (messageType === 'audio') {
      // Audio/voice note received
      userPrompt = 'Check out this audio message';
      // TODO: Implement speech-to-text transcription
      console.log('Received audio, media ID:', messageData.id);
    } else {
      // Unsupported message type
      console.log('Unsupported message type:', messageType);
      return res.status(200).json({ ok: true });
    }

    // --- GENERATE CAPTION ---
    console.log('Generating caption for:', userPrompt);
    const caption = await generateCaption(userPrompt);

    // --- PUBLISH TO INSTAGRAM ---
    console.log('Publishing to Instagram...');
    const result = await publishToInstagram(caption, imageUrl);

    console.log('Post published:', result.postId);

    // --- SEND WHATSAPP CONFIRMATION ---
    // TODO: Implement WhatsApp message reply
    // For now, just log success
    console.log('WhatsApp confirmation would be sent to user');

    return res.status(200).json({
      ok: true,
      postId: result.postId,
      caption,
    });
  } catch (error: any) {
    console.error('WhatsApp webhook error:', error.message);

    // Still return 200 to acknowledge receipt (prevents Meta from retrying indefinitely)
    return res.status(200).json({
      ok: false,
      error: error.message,
    });
  }
}
