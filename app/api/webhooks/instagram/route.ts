import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateCommentReply, classifyComment } from '@/lib/comment-reply';
import { sendCommentApproval, sendDmApproval, sendEngagementOptIn } from '@/lib/whatsapp-send';
import { getActiveBrandProfile } from '@/lib/brand-profile';

const VERIFY_TOKEN = process.env.INSTAGRAM_VERIFY_TOKEN ?? process.env.WHATSAPP_VERIFY_TOKEN ?? 'kreya_whatsapp_2026';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// Meta webhook verification — happens once when you wire up the URL
// in App Dashboard → Webhooks → Instagram → Subscribe to comments.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode      = searchParams.get('hub.mode');
  const token     = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

// Comment events arrive as { object:'instagram', entry:[{ id, time, changes:[{ field:'comments', value:{...} }] }] }
// value contains: id (comment id), text, from {id, username}, media {id, ad_id?}.
//
// MVP flow: store the event for idempotency, classify with Haiku, drop
// spam, otherwise draft a brand-voice reply and send to the owner's WA
// for one-tap approval. Approval handler in the WA webhook posts the
// reply via the IG Graph API.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || body.object !== 'instagram') {
    return NextResponse.json({ ok: true }); // ack so Meta doesn't retry
  }

  const supabase = getSupabase();

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'comments') continue;
      const v = change.value;
      const igCommentId = v?.id as string | undefined;
      const igMediaId   = v?.media?.id as string | undefined;
      const igUserId    = entry.id as string | undefined; // recipient account id
      const text        = v?.text as string | undefined;
      const fromId      = v?.from?.id as string | undefined;
      const handle      = v?.from?.username as string | undefined;

      if (!igCommentId || !igUserId || !text) continue;

      // Skip if commenter IS the account owner (avoid replying to ourselves)
      if (fromId && fromId === igUserId) continue;

      // Idempotency — UNIQUE on ig_comment_id makes a duplicate POST a no-op
      const { data: existing } = await supabase
        .from('ig_comment_events')
        .select('id')
        .eq('ig_comment_id', igCommentId)
        .maybeSingle();
      if (existing) continue;

      // Look up which user owns this IG account so we know whose WA to ping.
      // Also pull engagement flags so we can short-circuit when auto-reply
      // is opt-out for this account (saves Haiku calls + WA noise).
      const { data: account } = await supabase
        .from('instagram_accounts')
        .select('whatsapp_phone, account_name, access_token, brand_name, niche, tone, profile_context, comment_autoreply_enabled, engagement_offered_at')
        .eq('instagram_user_id', igUserId)
        .maybeSingle();
      if (!account?.whatsapp_phone) {
        await supabase.from('ig_comment_events').insert({
          ig_comment_id: igCommentId,
          ig_media_id: igMediaId,
          instagram_user_id: igUserId,
          commenter_handle: handle,
          comment_text: text,
          status: 'skipped',
        });
        continue;
      }

      // Engagement gate — if the user hasn't opted in for comment
      // auto-reply, we audit the event but stop here (no Haiku, no WA
      // approval card). On the very first event we send a one-shot
      // setup prompt so they can opt in if they want.
      if (!account.comment_autoreply_enabled) {
        await supabase.from('ig_comment_events').insert({
          ig_comment_id: igCommentId,
          ig_media_id: igMediaId,
          instagram_user_id: igUserId,
          commenter_handle: handle,
          comment_text: text,
          status: 'skipped',
          resolved_at: new Date().toISOString(),
        });
        if (!account.engagement_offered_at) {
          await sendEngagementOptIn(account.whatsapp_phone, igUserId, account.account_name).catch(() => {});
          await supabase.from('instagram_accounts').update({
            engagement_offered_at: new Date().toISOString(),
          }).eq('instagram_user_id', igUserId);
        }
        continue;
      }

      const classification = await classifyComment(text);
      if (classification === 'spam') {
        await supabase.from('ig_comment_events').insert({
          ig_comment_id: igCommentId,
          ig_media_id: igMediaId,
          instagram_user_id: igUserId,
          commenter_handle: handle,
          comment_text: text,
          classification: 'spam',
          status: 'spam',
          resolved_at: new Date().toISOString(),
        });
        continue;
      }

      // Draft reply using account's per-account brand voice (account
      // columns override phone-level user_profiles).
      const brand = await getActiveBrandProfile(account.whatsapp_phone);
      const reply = await generateCommentReply(text, classification, brand.profile_context ?? undefined, brand.learned_style ?? undefined);

      const { data: row } = await supabase
        .from('ig_comment_events')
        .insert({
          ig_comment_id: igCommentId,
          ig_media_id: igMediaId,
          instagram_user_id: igUserId,
          commenter_handle: handle,
          comment_text: text,
          classification,
          generated_reply: reply,
          status: 'pending',
        })
        .select('id')
        .single();

      if (row) {
        await sendCommentApproval(
          account.whatsapp_phone,
          row.id,
          account.account_name,
          handle ?? 'someone',
          text,
          reply,
        ).catch(() => {});
      }
    }

    // DM auto-reply — Meta delivers messages on the `messaging` field.
    // Same architecture as comments: idempotency on ig_message_id,
    // classify, drop spam, draft, send WA approval card.
    for (const msg of entry.messaging ?? []) {
      const igMessageId = msg?.message?.mid as string | undefined;
      const senderPsid  = msg?.sender?.id as string | undefined;
      const igUserId    = entry.id as string | undefined;
      const text        = msg?.message?.text as string | undefined;

      if (!igMessageId || !senderPsid || !igUserId || !text) continue;
      // Skip echoes of replies we just sent.
      if (msg?.message?.is_echo) continue;
      if (senderPsid === igUserId) continue;

      const { data: existing } = await supabase
        .from('ig_dm_events')
        .select('id')
        .eq('ig_message_id', igMessageId)
        .maybeSingle();
      if (existing) continue;

      const { data: account } = await supabase
        .from('instagram_accounts')
        .select('whatsapp_phone, account_name, access_token, dm_autoreply_enabled, engagement_offered_at')
        .eq('instagram_user_id', igUserId)
        .maybeSingle();
      if (!account?.whatsapp_phone) {
        await supabase.from('ig_dm_events').insert({
          ig_message_id: igMessageId,
          instagram_user_id: igUserId,
          sender_psid: senderPsid,
          message_text: text,
          status: 'skipped',
        });
        continue;
      }

      // Same opt-in gate as comments — DMs default OFF since DM
      // auto-reply is the most personal of the engagement features.
      if (!account.dm_autoreply_enabled) {
        await supabase.from('ig_dm_events').insert({
          ig_message_id: igMessageId,
          instagram_user_id: igUserId,
          sender_psid: senderPsid,
          message_text: text,
          status: 'skipped',
          resolved_at: new Date().toISOString(),
        });
        if (!account.engagement_offered_at) {
          await sendEngagementOptIn(account.whatsapp_phone, igUserId, account.account_name).catch(() => {});
          await supabase.from('instagram_accounts').update({
            engagement_offered_at: new Date().toISOString(),
          }).eq('instagram_user_id', igUserId);
        }
        continue;
      }

      const classification = await classifyComment(text);
      if (classification === 'spam') {
        await supabase.from('ig_dm_events').insert({
          ig_message_id: igMessageId,
          instagram_user_id: igUserId,
          sender_psid: senderPsid,
          message_text: text,
          classification: 'spam',
          status: 'spam',
          resolved_at: new Date().toISOString(),
        });
        continue;
      }

      const brand = await getActiveBrandProfile(account.whatsapp_phone);
      const reply = await generateCommentReply(text, classification, brand.profile_context ?? undefined, brand.learned_style ?? undefined);

      const { data: row } = await supabase
        .from('ig_dm_events')
        .insert({
          ig_message_id: igMessageId,
          instagram_user_id: igUserId,
          sender_psid: senderPsid,
          message_text: text,
          classification,
          generated_reply: reply,
          status: 'pending',
        })
        .select('id')
        .single();

      if (row) {
        await sendDmApproval(
          account.whatsapp_phone,
          row.id,
          account.account_name,
          text,
          reply,
        ).catch(() => {});
      }
    }
  }

  return NextResponse.json({ ok: true });
}
