import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sendEmail } from '../src/email';

beforeEach(() => vi.restoreAllMocks());

describe('sendEmail', () => {
  it('POSTs to Resend with correct body and auth', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'sent1' }), { status: 200 })
    );
    vi.stubGlobal('fetch', mockFetch);

    await sendEmail('you@x.com', 'Subject', '<p>hi</p>', { RESEND_API_KEY: 'rk' });

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[0]).toBe('https://api.resend.com/emails');
    expect(callArgs[1].headers.Authorization).toBe('Bearer rk');
    const body = JSON.parse(callArgs[1].body);
    expect(body.to).toEqual(['you@x.com']);
    expect(body.subject).toBe('Subject');
    expect(body.html).toBe('<p>hi</p>');
  });

  it('throws on non-200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 }))
    );

    await expect(
      sendEmail('you@x.com', 's', 'h', { RESEND_API_KEY: 'rk' })
    ).rejects.toThrow();
  });
});
