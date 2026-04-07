import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

// 1. Initialize Supabase with Service Role to access the private schema
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 2. Initialize Claude AI
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, imageUrl, accountName = 'nepostnuto' } = req.body;

  try {
    // 3. Retrieve the SECURE token from your private vault
    const { data: accessToken, error: vaultError } = await supabaseAdmin
      .rpc('get_secret', { secret_name: `ig_token_${accountName}` });

    if (vaultError || !accessToken) throw new Error("Could not retrieve secure token from vault");

    // 4. Generate Caption using Claude Sonnet
    const msg = await anthropic.messages.create({
      model: "claude-3-sonnet-20240229",
      max_tokens: 1000,
      messages: [{ role: "user", content: `Write a short, engaging Instagram caption with 3 hashtags for this post idea: ${prompt}` }],
    });
    const caption = msg.content[0].text;

    // 5. Meta API: Create Media Container
    const containerRes = await fetch(
      `https://graph.facebook.com/v24.0/26314509864842304/media?image_url=${encodeURIComponent(imageUrl)}&caption=${encodeURIComponent(caption)}&access_token=${accessToken}`,
      { method: 'POST' }
    );
    const containerData = await containerRes.json();

    if (!containerData.id) throw new Error(`Meta Container Error: ${JSON.stringify(containerData)}`);

    // 6. Meta API: Publish Media
    const publishRes = await fetch(
      `https://graph.facebook.com/v24.0/26314509864842304/media_publish?creation_id=${containerData.id}&access_token=${accessToken}`,
      { method: 'POST' }
    );
    const publishData = await publishRes.json();

    // 7. Log to Audit Table
    await supabaseAdmin.from('social_audit_log').insert({
      action: 'publish_instagram',
      status: 'success',
      details: { post_id: publishData.id, caption }
    });

    return res.status(200).json({ success: true, postId: publishData.id });

  } catch (error: any) {
    console.error("Publishing Failed:", error.message);
    return res.status(500).json({ error: error.message });
  }
}