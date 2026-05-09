import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export default async function MediaPreviewPage({
  params,
}: {
  params: Promise<{ postId: string; idx: string }>;
}) {
  const { postId, idx: idxStr } = await params;
  const idx = parseInt(idxStr, 10);
  if (isNaN(idx) || idx < 0) notFound();

  const { data: post } = await getSupabase()
    .from('pending_posts')
    .select('media_items')
    .eq('id', postId)
    .maybeSingle();

  const items: { url: string; is_video?: boolean }[] =
    Array.isArray(post?.media_items) ? post.media_items : [];
  const item = items[idx];
  if (!item) notFound();

  const isVideo = !!item.is_video;
  const n = idx + 1;
  const total = items.length;

  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`Slide ${n} of ${total}`}</title>
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { background: #07070D; color: #fff; font-family: sans-serif;
                 display: flex; flex-direction: column; align-items: center;
                 justify-content: center; min-height: 100dvh; }
          .label { position: fixed; top: 12px; left: 0; right: 0; text-align: center;
                   font-size: 13px; color: rgba(255,255,255,.6); letter-spacing: .03em; }
          img, video { max-width: 100vw; max-height: 100dvh;
                       object-fit: contain; display: block; }
        `}</style>
      </head>
      <body>
        <p className="label">{`Slide ${n} / ${total} · ${isVideo ? 'Video' : 'Photo'}`}</p>
        {isVideo ? (
          <video src={item.url} controls autoPlay playsInline muted loop />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.url} alt={`Slide ${n}`} />
        )}
      </body>
    </html>
  );
}
