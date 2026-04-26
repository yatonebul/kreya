import { after, NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendBrandSuggestion, sendText } from '@/lib/whatsapp-send';
import { learnStyleFromInstagram } from '@/lib/style-memory';

const APP_ID = process.env.INSTAGRAM_APP_ID ?? '761297643580425';
const APP_SECRET = process.env.INSTAGRAM_APP_SECRET!;
const REDIRECT_URI = process.env.INSTAGRAM_REDIRECT_URI ?? 'https://kreya-github.vercel.app/api/auth/instagram/callback';
const CONNECT_URL = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL}/connect`
  : 'https://kreya-github.vercel.app/connect';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const state = searchParams.get('state');

  if (error || !code) {
    return NextResponse.redirect(`${CONNECT_URL}?error=${encodeURIComponent(error ?? 'no_code')}`);
  }

  // Resolve state → whatsapp phone
  // State is either "<uuid>|<phone>" (inline fallback) or a plain UUID (DB lookup)
  let whatsappPhone: string | null = null;
  if (state) {
    const decoded = decodeURIComponent(state);
    const pipeIdx = decoded.indexOf('|');
    if (pipeIdx >= 0) {
      // Inline form: "<uuid>|<phone>"
      const uuid = decoded.slice(0, pipeIdx);
      whatsappPhone = decoded.slice(pipeIdx + 1)?.trim() || null;
      await getSupabase().from('oauth_pending_states').delete().eq('state', uuid).then(() => {}, () => {});
    } else {
      // DB lookup form
      const { data: pending } = await getSupabase()
        .from('oauth_pending_states')
        .select('phone')
        .eq('state', decoded)
        .maybeSingle();
      if (pending?.phone) {
        whatsappPhone = pending.phone?.trim() || null;
        await getSupabase().from('oauth_pending_states').delete().eq('state', decoded);
      }
    }
  }

  if (!whatsappPhone) {
    console.warn('[IG callback] No whatsappPhone in state; will insert account without phone association');
  }

  try {
    // 1. Exchange code for short-lived token
    const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: APP_ID,
        client_secret: APP_SECRET,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI,
        code,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error('Token exchange failed');

    // 2. Exchange for long-lived token (~60 days)
    const longRes = await fetch(
      `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${APP_SECRET}&access_token=${tokenData.access_token}`
    );
    const longData = await longRes.json();
    if (longData.error) throw new Error('Long-lived token exchange failed');

    const accessToken = longData.access_token ?? tokenData.access_token;

    // 3. Get Instagram user info
    const meRes = await fetch(`https://graph.instagram.com/me?fields=id,username&access_token=${accessToken}`);
    const meData = await meRes.json();
    if (!meData.id) throw new Error('Could not fetch user info');

    // 4. Upsert token + phone in Supabase (manual check avoids missing unique constraint).
    //    Whoever just completed OAuth becomes the active account for that phone — any
    //    sibling rows (other IGs already linked to the same phone) are demoted to
    //    is_active=false. The user can flip the active one back on /connect.
    const expiresAt = new Date(Date.now() + (longData.expires_in ?? 5184000) * 1000).toISOString();

    const { data: existing } = await getSupabase()
      .from('instagram_accounts').select('id').eq('instagram_user_id', meData.id).maybeSingle();

    if (existing) {
      // Existing account: update token, name, timestamp, and optionally phone
      const { error: demoteErr } = whatsappPhone
        ? (await getSupabase()
            .from('instagram_accounts')
            .update({ is_active: false })
            .in('whatsapp_phone', whatsappPhone.startsWith('+') ? [whatsappPhone, whatsappPhone.slice(1)] : [whatsappPhone, `+${whatsappPhone}`])
            .neq('instagram_user_id', meData.id))
        : { error: null };
      if (demoteErr) throw new Error(`Failed to demote siblings: ${demoteErr.message}`);

      const { error: updateErr } = await getSupabase().from('instagram_accounts').update({
        account_name: meData.username,
        access_token: accessToken,
        token_expires_at: expiresAt,
        is_active: true,
        ...(whatsappPhone ? { whatsapp_phone: whatsappPhone } : {}),
      }).eq('id', existing.id);
      if (updateErr) throw new Error(`Failed to update account: ${updateErr.message}`);
    } else {
      // New account: demote siblings first, then insert.
      // Backfill brand fields from user_profiles so the new IG inherits the
      // user's onboarding brand setup as a starting point — they can refine
      // per-account later via /account or 'set niche=...' commands.
      let backfill: {
        brand_name?: string | null;
        niche?: string | null;
        tone?: string | null;
        profile_context?: string | null;
      } = {};
      if (whatsappPhone) {
        const phoneSearch = whatsappPhone.startsWith('+')
          ? [whatsappPhone, whatsappPhone.slice(1)]
          : [whatsappPhone, `+${whatsappPhone}`];
        const { error: demoteErr } = await getSupabase()
          .from('instagram_accounts')
          .update({ is_active: false })
          .in('whatsapp_phone', phoneSearch)
          .neq('instagram_user_id', meData.id);
        if (demoteErr) {
          console.error('[IG callback demote error]', {
            code: demoteErr.code,
            message: demoteErr.message,
          });
          throw new Error(`Failed to demote siblings: ${demoteErr.message}`);
        }

        const { data: phoneProfile } = await getSupabase()
          .from('user_profiles')
          .select('brand_name, niche, tone, profile_context')
          .eq('whatsapp_phone', whatsappPhone)
          .maybeSingle();
        if (phoneProfile) backfill = phoneProfile;
      }

      const insertData: any = {
        account_name: meData.username,
        instagram_user_id: meData.id,
        access_token: accessToken,
        token_expires_at: expiresAt,
        is_active: true,
        ...backfill,
      };
      if (whatsappPhone) {
        insertData.whatsapp_phone = whatsappPhone;
      }
      const { error: insertErr } = await getSupabase().from('instagram_accounts').insert(insertData);
      if (insertErr) {
        console.error('[IG callback insert error]', {
          code: insertErr.code,
          message: insertErr.message,
          details: insertErr.details,
          hint: insertErr.hint,
          data: insertData,
        });
        throw new Error(`Failed to save account: ${insertErr.message}`);
      }
    }

    // 5. Only notify on new account (not reconnect). Learn style in background
    //    and follow up with a one-tap brand suggestion if the AI inferred a niche/tone.
    if (whatsappPhone && !existing) {
      const phone = whatsappPhone;
      const igUserId = meData.id as string;
      const token = accessToken as string;
      const username = meData.username as string;

      after(async () => {
        await sendText(
          phone,
          `✅ *@${username}* connected!\n\nYou're all set — send me a message, photo, video, or voice note and I'll create your next Instagram post. 🚀`,
        ).catch(() => {});

        try {
          const result = await learnStyleFromInstagram(phone, igUserId, token);
          if (!result.ok || result.captionsFound === 0) return;

          await sendText(
            phone,
            `🧠 I read your last ${result.captionsFound} captions to learn @${username}'s voice. Future posts will sound like you.`,
          ).catch(() => {});

          if (result.suggestedNiche || result.suggestedTone) {
            await sendBrandSuggestion(
              phone,
              result.account ?? username,
              result.suggestedNiche,
              result.suggestedTone,
            ).catch(() => {});
          }
        } catch (err) {
          console.error('[IG callback style learn error]', err);
        }
      });
    }

    const phoneParam = whatsappPhone ? `&phone=${encodeURIComponent(whatsappPhone)}` : '';
    return NextResponse.redirect(`${CONNECT_URL}?connected=${encodeURIComponent(meData.username)}${phoneParam}`);
  } catch (err: any) {
    console.error('[IG callback error]', err.message);
    const phoneParam = whatsappPhone ? `&phone=${encodeURIComponent(whatsappPhone)}` : '';
    return NextResponse.redirect(`${CONNECT_URL}?error=${encodeURIComponent(err.message)}${phoneParam}`);
  }
}
