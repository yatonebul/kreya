const FROM = process.env.EMAIL_FROM ?? 'Kreya <onboarding@resend.dev>';
const API  = 'https://api.resend.com/emails';

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY not set');
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend error: ${await res.text()}`);
  return res.json();
}

export function otpEmailHtml(code: string) {
  return `
  <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;background:#0B0918;color:#fff;border-radius:16px">
    <p style="font-size:22px;font-weight:700;margin:0 0 8px;color:#FF4F3B">Kreya</p>
    <p style="font-size:15px;color:rgba(255,255,255,.7);margin:0 0 32px">Your verification code</p>
    <div style="background:#171430;border-radius:12px;padding:24px;text-align:center;letter-spacing:0.3em;font-size:36px;font-weight:700;font-family:monospace;color:#fff;margin-bottom:24px">${code}</div>
    <p style="font-size:13px;color:rgba(255,255,255,.4);margin:0">Valid for 10 minutes. Don't share this with anyone.</p>
  </div>`;
}

export function inviteEmailHtml(magicUrl: string) {
  return `
  <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;background:#0B0918;color:#fff;border-radius:16px">
    <p style="font-size:22px;font-weight:700;margin:0 0 8px;color:#FF4F3B">Kreya</p>
    <p style="font-size:15px;color:rgba(255,255,255,.7);margin:0 0 8px">You're in.</p>
    <p style="font-size:14px;color:rgba(255,255,255,.5);margin:0 0 32px">Your Kreya account is approved. Click below to access your dashboard.</p>
    <a href="${magicUrl}" style="display:inline-block;background:#FF4F3B;color:#fff;text-decoration:none;padding:14px 28px;border-radius:100px;font-size:14px;font-weight:600">Open my dashboard →</a>
    <p style="font-size:12px;color:rgba(255,255,255,.3);margin:24px 0 0">Link expires in 48 hours. If you didn't request this, ignore it.</p>
  </div>`;
}
