import nodemailer from 'nodemailer';

async function sendViaGmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER!,
      pass: process.env.GMAIL_APP_PASSWORD!,
    },
  });
  await transporter.sendMail({
    from: `Kreya <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
  });
}

async function sendViaResend({ to, subject, html }: { to: string; subject: string; html: string }) {
  const key  = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? 'Kreya <onboarding@resend.dev>';
  if (!key) throw new Error('RESEND_API_KEY not set');
  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend error: ${await res.text()}`);
  return res.json();
}

export async function sendEmail(opts: { to: string; subject: string; html: string }) {
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    return sendViaGmail(opts);
  }
  return sendViaResend(opts);
}

function base(content: string) {
  return `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;background:#0B0918;color:#fff;border-radius:16px">
    <p style="font-size:22px;font-weight:700;margin:0 0 32px;color:#FF4F3B">Kreya</p>
    ${content}
  </div>`;
}

export function waitlistEmailHtml(email: string) {
  return base(`
    <p style="font-size:20px;font-weight:700;margin:0 0 12px">You're on the list 🎉</p>
    <p style="font-size:14px;color:rgba(255,255,255,.6);margin:0 0 24px;line-height:1.6">
      Thanks for signing up! We've added <strong style="color:#fff">${email}</strong> to our early access waitlist.<br><br>
      We review every request personally. You'll get an invite email as soon as your account is approved — usually within a few days.
    </p>
    <p style="font-size:13px;color:rgba(255,255,255,.35);margin:0">While you wait, feel free to reply to this email with any questions.</p>
  `);
}

export function otpEmailHtml(code: string) {
  return base(`
    <p style="font-size:15px;color:rgba(255,255,255,.7);margin:0 0 32px">Your verification code</p>
    <div style="background:#171430;border-radius:12px;padding:24px;text-align:center;letter-spacing:0.3em;font-size:36px;font-weight:700;font-family:monospace;color:#fff;margin-bottom:24px">${code}</div>
    <p style="font-size:13px;color:rgba(255,255,255,.4);margin:0">Valid for 10 minutes. Don't share this with anyone.</p>
  `);
}

export function inviteEmailHtml(magicUrl: string, loginUrl: string, waNumber?: string) {
  const waLine = waNumber
    ? `<p style="font-size:14px;color:rgba(255,255,255,.5);margin:16px 0 0;line-height:1.6">📱 Send posts to Instagram via WhatsApp — message us at <strong style="color:#fff">${waNumber}</strong></p>`
    : '';
  return base(`
    <p style="font-size:20px;font-weight:700;margin:0 0 8px">You're in ✅</p>
    <p style="font-size:14px;color:rgba(255,255,255,.6);margin:0 0 28px;line-height:1.6">
      Your Kreya account has been approved. Click below to open your dashboard — the link is valid for 48 hours.
    </p>
    <a href="${magicUrl}" style="display:inline-block;background:#FF4F3B;color:#fff;text-decoration:none;padding:14px 28px;border-radius:100px;font-size:14px;font-weight:600;margin-bottom:20px">Open my dashboard →</a>
    <p style="font-size:13px;color:rgba(255,255,255,.4);margin:0 0 4px">After the link expires, sign in at:</p>
    <a href="${loginUrl}" style="font-size:13px;color:#FF4F3B;word-break:break-all">${loginUrl}</a>
    ${waLine}
    <p style="font-size:12px;color:rgba(255,255,255,.25);margin:28px 0 0">If you didn't request this, you can safely ignore it.</p>
  `);
}
