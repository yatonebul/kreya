import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

// 1. Initialize Supabase with Service Role
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
    // 3. Retrieve the token from your instagram_accounts table
    const { data: account, error: dbError } = await supabaseAdmin
      .from('instagram_accounts')
      .select('access_token')
      .eq('account_name', accountName)
      .single();

    const accessToken = account?.access_token;

    if (dbError || !accessToken) {
      throw new Error("Could not retrieve secure token from vault");
    }

    // --- DYNAMIC MODEL SELECTION ---
    console.log("Fetching available Claude models...");
    let modelToUse = "claude-sonnet-4-6"; // Default fallback
    
    try {
      const modelsPage = await anthropic.models.list();
      // Find the newest model that contains 'sonnet' and is not a 'legacy' version
      const bestSonnet = modelsPage.data.find(m => 
        m.id.includes('sonnet') && !m.id.includes('legacy')
      );
      
      if (bestSonnet) {
        modelToUse = bestSonnet.id;
      }
    } catch (listError) {
      console.warn("Could not fetch model list, using fallback:", modelToUse);
    }

    // 4. Claude AI: Generate Caption
    console.log(`Generating caption with ${modelToUse}...`);
    const msg = await anthropic.messages.create({
      model: modelToUse,
      max_tokens: 300,
      messages: [{ 
        role: "user", 
        content: `Write a short, engaging Instagram caption for an image based on this prompt: "${prompt}". 
                  Keep it under 2000 characters. Include 3-5 relevant hashtags. 
                  Do not include quotes around the caption.` 
      }],
    });

    // Extract the text from Claude's response
    const caption = msg.content[0].type === 'text' ? msg.content[0].text : "Default caption if AI fails";
    console.log("Generated Caption:", caption);

    // 5. Meta API: Create Media Container
    console.log("Creating container...");
    const containerRes = await fetch(
      `https://graph.facebook.com/v24.0/17841441407068598/media?image_url=${encodeURIComponent(imageUrl)}&caption=${encodeURIComponent(caption)}&access_token=${accessToken}`,
      { method: 'POST' }
    );
    const containerData = await containerRes.json();

    if (!containerData.id) {
      console.error("CONTAINER FAILURE:", containerData);
      throw new Error(`Meta Container Error: ${JSON.stringify(containerData)}`);
    }

    // --- WAIT FOR PROCESSING ---
    console.log("Container created. Waiting 5s for Meta to process media...");
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 6. Meta API: Publish Media
    console.log("Publishing media...");
    const publishRes = await fetch(
      `https://graph.facebook.com/v24.0/17841441407068598/media_publish?creation_id=${containerData.id}&access_token=${accessToken}`,
      { method: 'POST' }
    );
    const publishData = await publishRes.json();

    // FINAL CHECK
    if (!publishData.id) {
      console.error("PUBLISH FAILURE DETAILS:", JSON.stringify(publishData));
      throw new Error(`Meta Publish Error: ${JSON.stringify(publishData)}`);
    }

    console.log("SUCCESSFULLY PUBLISHED ID:", publishData.id);

    // 7. Log to Audit Table (including which model was dynamically chosen)
    await supabaseAdmin.from('social_audit_log').insert({
      action: 'publish_instagram',
      status: 'success',
      details: { 
        post_id: publishData.id, 
        caption, 
        model_used: modelToUse 
      }
    });

    return res.status(200).json({ 
      success: true, 
      postId: publishData.id,
      modelUsed: modelToUse 
    });

  } catch (error: any) {
    console.error("Publishing Failed:", error.message);
    return res.status(500).json({ error: error.message });
  }
}