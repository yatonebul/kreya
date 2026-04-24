import { createClient } from '@supabase/supabase-js';

function getToken() { return process.env.WHATSAPP_ACCESS_TOKEN!; }

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function downloadAndHostMedia(mediaId: string, mimeType: string): Promise<string> {
  // 1. Get the temporary download URL from Meta
  const urlRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  const urlData = await urlRes.json();
  if (!urlData.url) throw new Error(`No download URL for media ${mediaId}: ${JSON.stringify(urlData)}`);

  // 2. Download the file bytes
  const fileRes = await fetch(urlData.url, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!fileRes.ok) throw new Error(`Media download failed: ${fileRes.status}`);

  const MAX_BYTES = 50 * 1024 * 1024;
  const contentLength = Number(fileRes.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BYTES) {
    const mb = Math.round(contentLength / 1024 / 1024);
    throw Object.assign(new Error(`📎 File too large (${mb} MB). Please keep it under 50 MB.`), { userFacing: true });
  }

  const buffer = Buffer.from(await fileRes.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES) {
    const mb = Math.round(buffer.byteLength / 1024 / 1024);
    throw Object.assign(new Error(`📎 File too large (${mb} MB). Please keep it under 50 MB.`), { userFacing: true });
  }

  // 3. Upload to Supabase Storage (public bucket: user-media)
  const ext = mimeType.split('/')[1]?.split(';')[0] ?? 'jpg';
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const supabase = getSupabase();

  const { data, error } = await supabase.storage
    .from('user-media')
    .upload(path, buffer, { contentType: mimeType, upsert: false });

  if (error) throw new Error(`Supabase Storage upload failed: ${error.message}`);

  const publicUrl = supabase.storage.from('user-media').getPublicUrl(data.path).data.publicUrl;
  console.log('[media] hosted at:', publicUrl);
  return publicUrl;
}
