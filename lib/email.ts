import 'server-only';
import { env } from './env';

type Attachment = { filename: string; content: Uint8Array };

export async function sendEmail(opts: { to: string[]; subject: string; html: string; attachments?: Attachment[] }): Promise<boolean> {
  const key = env.resendKey();
  if (!key || !opts.to.length) {
    console.warn('email skipped: RESEND_API_KEY or recipient missing');
    return false;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.fromEmail(),
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      attachments: (opts.attachments || []).map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString('base64') })),
    }),
  });
  if (!res.ok) {
    console.error('email failed', res.status, await res.text());
    return false;
  }
  return true;
}

export async function alertAdmins(subject: string, body: string): Promise<void> {
  const esc = body.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
  await sendEmail({ to: env.alertEmails(), subject: `[Quote funnel] ${subject}`, html: `<pre style="font:14px/1.5 monospace;white-space:pre-wrap">${esc}</pre>` });
}
