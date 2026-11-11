import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createWord, queryUnsentReady, markSent } from '../src/notion';

const ENV = {
  NOTION_TOKEN: 'secret_xxx',
  NOTION_DATABASE_ID: 'db123',
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('createWord', () => {
  it('POSTs a new page with all 6 properties and returns id+url', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ id: 'page1', url: 'https://notion.so/page1' }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', mockFetch);

    const result = await createWord(
      {
        word: 'perspicacious',
        context: 'Her perspicacious analysis cut through the noise.',
        definition: '(adj.) Sharply perceptive.',
        source: 'phone: nytimes.com',
        captured: new Date('2026-05-30T10:00:00Z'),
      },
      ENV
    );

    expect(result.id).toBe('page1');
    expect(result.url).toBe('https://notion.so/page1');

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[0]).toBe('https://api.notion.com/v1/pages');
    const body = JSON.parse(callArgs[1].body);
    expect(body.parent.database_id).toBe('db123');
    expect(body.properties.Word.title[0].text.content).toBe('perspicacious');
    expect(body.properties.Context.rich_text[0].text.content).toContain('perspicacious');
    expect(body.properties.Definition.rich_text[0].text.content).toBe(
      '(adj.) Sharply perceptive.'
    );
    expect(body.properties.Source.rich_text[0].text.content).toBe('phone: nytimes.com');
    expect(body.properties.Captured.date.start).toContain('2026-05-30');
    expect(body.properties.Sent.checkbox).toBe(false);
  });

  it('throws on non-200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('boom', { status: 500 }))
    );

    await expect(
      createWord(
        {
          word: 'x',
          context: '',
          definition: 'd',
          source: 's',
          captured: new Date(),
        },
        ENV
      )
    ).rejects.toThrow();
  });
});

describe('queryUnsentReady', () => {
  it('queries with the correct filter and returns parsed rows', async () => {
    const notionResp = {
      results: [
        {
          id: 'p1',
          url: 'https://notion.so/p1',
          properties: {
            Word: { title: [{ plain_text: 'perspicacious' }] },
            Context: { rich_text: [{ plain_text: 'sentence' }] },
            Definition: { rich_text: [{ plain_text: '(adj.) sharp.' }] },
            Source: { rich_text: [{ plain_text: 'phone: nytimes' }] },
            Captured: { date: { start: '2026-05-30T10:00:00Z' } },
          },
        },
      ],
    };
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(notionResp), { status: 200 })
    );
    vi.stubGlobal('fetch', mockFetch);

    const rows = await queryUnsentReady(ENV);
    expect(rows).toHaveLength(1);
    expect(rows[0].word).toBe('perspicacious');
    expect(rows[0].context).toBe('sentence');
    expect(rows[0].definition).toBe('(adj.) sharp.');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.filter.and).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'Sent', checkbox: { equals: false } }),
        expect.objectContaining({
          property: 'Context',
          rich_text: { is_not_empty: true },
        }),
        expect.objectContaining({
          property: 'Definition',
          rich_text: { is_not_empty: true },
        }),
      ])
    );
  });
});

describe('markSent', () => {
  it('PATCHes the page with Sent=true', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 })
    );
    vi.stubGlobal('fetch', mockFetch);

    await markSent('page1', ENV);

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[0]).toBe('https://api.notion.com/v1/pages/page1');
    expect(callArgs[1].method).toBe('PATCH');
    const body = JSON.parse(callArgs[1].body);
    expect(body.properties.Sent.checkbox).toBe(true);
  });
});
