import { describe, it, expect, beforeEach, vi } from 'vitest';
import { runDigest } from '../src/digestWorker';
import type { NotionRow, WorkerEnv } from '../src/types';

vi.mock('../src/notion', () => ({
  queryUnsentReady: vi.fn(),
  markSent: vi.fn(),
}));
vi.mock('../src/email', () => ({
  sendEmail: vi.fn(),
}));

import { queryUnsentReady, markSent } from '../src/notion';
import { sendEmail } from '../src/email';

const ENV: WorkerEnv = {
  NOTION_TOKEN: 'n',
  NOTION_DATABASE_ID: 'd',
  MERRIAM_API_KEY: 'm',
  GEMINI_API_KEY: 'g',
  RESEND_API_KEY: 'r',
  YOUR_EMAIL: 'you@x.com',
  SHORTCUT_BEARER_TOKEN: 't',
  DIGEST_THRESHOLD: '5',
};

function row(id: string): NotionRow {
  return {
    id,
    url: `https://notion.so/${id}`,
    word: `w${id}`,
    context: `c${id}`,
    definition: `d${id}`,
    source: `s${id}`,
    captured: new Date(),
  };
}

beforeEach(() => {
  vi.mocked(queryUnsentReady).mockReset();
  vi.mocked(markSent).mockReset();
  vi.mocked(sendEmail).mockReset();
});

describe('runDigest', () => {
  it('does nothing when row count is below threshold', async () => {
    vi.mocked(queryUnsentReady).mockResolvedValue([row('1'), row('2')]);

    const result = await runDigest(ENV);

    expect(result.sent).toBe(false);
    expect(result.word_count).toBe(2);
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
    expect(vi.mocked(markSent)).not.toHaveBeenCalled();
  });

  it('sends email and marks all rows when threshold reached', async () => {
    const rows = [row('1'), row('2'), row('3'), row('4'), row('5')];
    vi.mocked(queryUnsentReady).mockResolvedValue(rows);
    vi.mocked(sendEmail).mockResolvedValue();
    vi.mocked(markSent).mockResolvedValue();

    const result = await runDigest(ENV);

    expect(result.sent).toBe(true);
    expect(result.word_count).toBe(5);
    expect(vi.mocked(sendEmail)).toHaveBeenCalledOnce();

    const emailArgs = vi.mocked(sendEmail).mock.calls[0];
    expect(emailArgs[0]).toBe('you@x.com');
    expect(emailArgs[1]).toContain('5 new words');

    expect(vi.mocked(markSent)).toHaveBeenCalledTimes(5);
  });

  it('does not mark rows as sent if email send fails', async () => {
    const rows = [row('1'), row('2'), row('3'), row('4'), row('5')];
    vi.mocked(queryUnsentReady).mockResolvedValue(rows);
    vi.mocked(sendEmail).mockRejectedValue(new Error('resend down'));

    const result = await runDigest(ENV);

    expect(result.sent).toBe(false);
    expect(vi.mocked(markSent)).not.toHaveBeenCalled();
  });

  it('honors custom DIGEST_THRESHOLD env value', async () => {
    const rows = [row('1'), row('2'), row('3')];
    vi.mocked(queryUnsentReady).mockResolvedValue(rows);
    vi.mocked(sendEmail).mockResolvedValue();
    vi.mocked(markSent).mockResolvedValue();

    const result = await runDigest({ ...ENV, DIGEST_THRESHOLD: '3' });

    expect(result.sent).toBe(true);
    expect(vi.mocked(sendEmail)).toHaveBeenCalledOnce();
  });
});
