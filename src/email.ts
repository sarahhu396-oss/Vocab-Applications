const FROM = 'Vocab Digest <vocab@resend.dev>';

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  env: { RESEND_API_KEY: string }
): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) throw new Error(`Resend send failed: ${res.status}`);
}
