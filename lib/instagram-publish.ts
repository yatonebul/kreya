import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Instagram user ID and account name (from test data)
const IG_USER_ID = '26314509864842304';
const IG_USERNAME = 'nepostnuto';

export async function publishToInstagram(
  caption: string,
  imageUrl: string
): Promise<{ postId: string; status: string; postUrl?: string }> {
  try {
    // 1. Get access token from Supabase
    const { data: account, error: dbError } = await getSupabase()
      .from('instagram_accounts')
      .select('access_token, instagram_user_id')
      .eq('account_name', 'nepostnuto')
      .single();

    const accessToken = account?.access_token;
    const igUserId = account?.instagram_user_id;

    if (dbError || !accessToken || !igUserId) {
      throw new Error('Could not retrieve access token from database');
    }

    // 2. Create media container
    console.log('Creating Instagram media container...');
    const containerRes = await fetch(
      `https://graph.instagram.com/v21.0/${igUserId}/media?image_url=${encodeURIComponent(imageUrl)}&caption=${encodeURIComponent(caption)}&access_token=${accessToken}`,
      { method: 'POST' }
    );
    const containerData = await containerRes.json();

    if (!containerData.id) {
      console.error('Container error:', containerData);
      throw new Error(`Meta API container error: ${JSON.stringify(containerData)}`);
    }

    console.log('Container created, waiting for Meta processing...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 3. Publish media
    console.log('Publishing to Instagram...');
    const publishRes = await fetch(
      `https://graph.instagram.com/v21.0/${igUserId}/media_publish?creation_id=${containerData.id}&access_token=${accessToken}`,
      { method: 'POST' }
    );
    const publishData = await publishRes.json();

    if (!publishData.id) {
      console.error('Publish error:', publishData);
      throw new Error(`Meta API publish error: ${JSON.stringify(publishData)}`);
    }

    console.log('Post published successfully:', publishData.id);

    // 4. Fetch permalink
    const permalinkRes = await fetch(
      `https://graph.instagram.com/v21.0/${publishData.id}?fields=permalink&access_token=${accessToken}`
    );
    const permalinkData = await permalinkRes.json();
    const postUrl: string | undefined = permalinkData.permalink;

    // 5. Log to audit table
    await getSupabase().from('social_audit_log').insert({
      action: 'publish_instagram',
      status: 'success',
      details: {
        post_id: publishData.id,
        caption,
        source: 'whatsapp',
      },
    });

    return {
      postId: publishData.id,
      status: 'success',
      postUrl,
    };
  } catch (error: any) {
    console.error('Instagram publishing failed:', error.message);

    // Log failure
    await getSupabase().from('social_audit_log').insert({
      action: 'publish_instagram',
      status: 'failed',
      details: {
        error: error.message,
        source: 'whatsapp',
      },
    });

    throw error;
  }
}
