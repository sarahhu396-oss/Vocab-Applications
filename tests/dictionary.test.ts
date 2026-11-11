import { describe, it, expect, beforeEach, vi } from 'vitest';
import { lookupDictionary } from '../src/dictionary';

const ENV = { MERRIAM_API_KEY: 'mw-key' };

describe('lookupDictionary', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns parsed senses from Merriam-Webster on hit', async () => {
    const mwResp = [
      {
        meta: { id: 'perspicacious' },
        fl: 'adjective',
        shortdef: ['of acute mental vision or discernment'],
      },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(mwResp), { status: 200 }))
    );

    const result = await lookupDictionary('perspicacious', ENV);
    expect(result.source).toBe('merriam-webster');
    expect(result.word).toBe('perspicacious');
    expect(result.senses).toEqual([
      { part_of_speech: 'adjective', definition: 'of acute mental vision or discernment' },
    ]);
  });

  it('falls back to Free Dictionary API when Merriam returns suggestions array', async () => {
    const mwResp = ['perspicacity']; // MW returns string suggestions when no exact match
    const freeResp = [
      {
        word: 'perspicacious',
        meanings: [
          {
            partOfSpeech: 'adjective',
            definitions: [{ definition: 'having a ready insight' }],
          },
        ],
      },
    ];
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify(mwResp), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify(freeResp), { status: 200 }))
    );

    const result = await lookupDictionary('perspicacious', ENV);
    expect(result.source).toBe('free-dictionary');
    expect(result.senses[0]).toEqual({
      part_of_speech: 'adjective',
      definition: 'having a ready insight',
    });
  });

  it('returns source=none when both APIs miss', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify(['suggestion']), { status: 200 }))
        .mockResolvedValueOnce(new Response('Not found', { status: 404 }))
    );

    const result = await lookupDictionary('zzznotaword', ENV);
    expect(result.source).toBe('none');
    expect(result.senses).toEqual([]);
  });

  it('returns source=none when both APIs throw', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network down'))
    );

    const result = await lookupDictionary('anything', ENV);
    expect(result.source).toBe('none');
    expect(result.senses).toEqual([]);
  });

  it('skips Merriam-Webster entirely when key is empty', async () => {
    const freeResp = [
      {
        word: 'perspicacious',
        meanings: [
          {
            partOfSpeech: 'adjective',
            definitions: [{ definition: 'having a ready insight' }],
          },
        ],
      },
    ];
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(freeResp), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    const result = await lookupDictionary('perspicacious', { MERRIAM_API_KEY: '' });
    expect(result.source).toBe('free-dictionary');
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0][0]).toContain('dictionaryapi.dev');
  });
});
