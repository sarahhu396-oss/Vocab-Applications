import type { WorkerEnv } from './types';
import { queryUnsentReady, markSent } from './notion';
import { sendEmail } from './email';
import { renderDigest } from './digest';

export async function runDigest(
  env: WorkerEnv
): Promise<{ sent: boolean; word_count: number }> {
  const threshold = parseInt(env.DIGEST_THRESHOLD ?? '5', 10);
  const rows = await queryUnsentReady(env);

  if (rows.length < threshold) {
    return { sent: false, word_count: rows.length };
  }

  const dbUrl = `https://www.notion.so/${env.NOTION_DATABASE_ID.replace(/-/g, '')}`;
  const html = renderDigest(rows, dbUrl);
  const subject = `📚 Vocab digest — ${rows.length} new words`;

  try {
    await sendEmail(env.YOUR_EMAIL, subject, html, env);
  } catch {
    return { sent: false, word_count: rows.length };
  }

  for (const r of rows) {
    await markSent(r.id, env);
  }

  return { sent: true, word_count: rows.length };
}
