import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function publishToInstagram(
  whatsappPhone: string,
  caption: string,
  mediaUrl: string,
  isVideo = false
): Promise<{ postId: string; status: string; postUrl?: string }> {
  try {
    const phones = whatsappPhone.startsWith('+')
      ? [whatsappPhone, whatsappPhone.slice(1)]
      : [whatsappPhone, `+${whatsappPhone}`];

    const { data: account, error: dbError } = await getSupabase()
      .from('instagram_accounts')
      .select('access_token, instagram_user_id')
      .in('whatsapp_phone', phones)
      .eq('is_active', true)
      .maybeSingle();

    const accessToken = account?.access_token;
    const igUserId = account?.instagram_user_id;

    if (dbError || !accessToken || !igUserId) {
      throw new Error('No Instagram account connected for this user');
    }

    // 1. Create media container
    console.log(`Creating Instagram ${isVideo ? 'Reel' : 'photo'} container...`);
    const containerParams = new URLSearchParams({ caption, access_token: accessToken });
    if (isVideo) {
      containerParams.set('media_type', 'REELS');
      containerParams.set('video_url', mediaUrl);
    } else {
      containerParams.set('image_url', mediaUrl);
    }

    const containerRes = await fetch(
      `https://graph.instagram.com/v21.0/${igUserId}/media`,
      { method: 'POST', body: containerParams }
    );
    const containerData = await containerRes.json();

    if (!containerData.id) {
      console.error('Container error:', containerData);
      const errCode = containerData?.error?.code;
      if (errCode === 190 || errCode === 102) {
        throw new Error(`INSTAGRAM_TOKEN_EXPIRED: ${JSON.stringify(containerData)}`);
      }
      throw new Error(`Meta API container error: ${JSON.stringify(containerData)}`);
    }

    // 2. For video, poll until processing is complete (up to 2 min)
    if (isVideo) {
      console.log('Waiting for video processing...');
      let attempts = 0;
      while (attempts < 24) {
        await new Promise(r => setTimeout(r, 5000));
        const statusRes = await fetch(
          `https://graph.instagram.com/v21.0/${containerData.id}?fields=status_code&access_token=${accessToken}`
        );
        const { status_code } = await statusRes.json();
        console.log('Video status:', status_code);
        if (status_code === 'FINISHED') break;
        if (status_code === 'ERROR') throw new Error('Video processing failed on Meta side');
        attempts++;
      }
    } else {
      await new Promise(r => setTimeout(r, 5000));
    }

    // 3. Publish
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

    console.log('Published successfully:', publishData.id);

    // 4. Fetch permalink
    const permalinkRes = await fetch(
      `https://graph.instagram.com/v21.0/${publishData.id}?fields=permalink&access_token=${accessToken}`
    );
    const permalinkData = await permalinkRes.json();
    const postUrl: string | undefined = permalinkData.permalink;

    await getSupabase().from('social_audit_log').insert({
      action: 'publish_instagram',
      status: 'success',
      details: { post_id: publishData.id, caption, source: 'whatsapp', is_video: isVideo, whatsapp_phone: whatsappPhone },
    });

    return { postId: publishData.id, status: 'success', postUrl };
  } catch (error: any) {
    console.error('Instagram publishing failed:', error.message);
    await getSupabase().from('social_audit_log').insert({
      action: 'publish_instagram',
      status: 'failed',
      details: { error: error.message, source: 'whatsapp', whatsapp_phone: whatsappPhone },
    });
    throw error;
  }
}
