import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateDefinition } from '../src/definition';
import type { DictionaryEntry } from '../src/types';

const dictHit: DictionaryEntry = {
  word: 'perspicacious',
  source: 'merriam-webster',
  senses: [{ part_of_speech: 'adjective', definition: 'of acute mental vision' }],
};

const dictMiss: DictionaryEntry = { word: 'foobar', source: 'none', senses: [] };

const ENV = { GEMINI_API_KEY: 'g-test' };

function mockGeminiResponse(text: string) {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text }] } }],
    }),
    { status: 200 }
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('generateDefinition', () => {
  it('returns the model text on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockGeminiResponse('(adj.) Sharply perceptive.'))
    );

    const def = await generateDefinition(
      {
        term: 'perspicacious',
        term_type: 'word',
        context: 'Her perspicacious analysis cut through the noise.',
        dictionary: dictHit,
      },
      ENV
    );
    expect(def).toBe('(adj.) Sharply perceptive.');
  });

  it('returns placeholder on non-200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 }))
    );

    const def = await generateDefinition(
      { term: 'foobar', term_type: 'word', context: '', dictionary: dictMiss },
      ENV
    );
    expect(def).toBe('(lookup failed — edit me)');
  });

  it('returns placeholder on network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network down'))
    );

    const def = await generateDefinition(
      { term: 'foobar', term_type: 'word', context: '', dictionary: dictMiss },
      ENV
    );
    expect(def).toBe('(lookup failed — edit me)');
  });

  it('includes "no context provided" hint in prompt when no context', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(mockGeminiResponse('(general) (adj.) Sharply perceptive.'));
    vi.stubGlobal('fetch', mockFetch);

    await generateDefinition(
      { term: 'perspicacious', term_type: 'word', context: '', dictionary: dictHit },
      ENV
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const userMsg: string = body.contents[0].parts[0].text;
    expect(userMsg.toLowerCase()).toContain('no context provided');
  });

  it('passes term, term_type, context, and dictionary into the user message', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(mockGeminiResponse('(phrase) Working late.'));
    vi.stubGlobal('fetch', mockFetch);

    await generateDefinition(
      {
        term: 'burning the midnight oil',
        term_type: 'phrase',
        context: 'He has been burning the midnight oil all week.',
        dictionary: dictMiss,
      },
      ENV
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const userMsg: string = body.contents[0].parts[0].text;
    expect(userMsg).toContain('burning the midnight oil');
    expect(userMsg).toContain('phrase');
    expect(userMsg).toContain('He has been burning the midnight oil all week.');
  });

  it('calls the Gemini API endpoint with the API key in the query string', async () => {
    const mockFetch = vi.fn().mockResolvedValue(mockGeminiResponse('(adj.) x.'));
    vi.stubGlobal('fetch', mockFetch);

    await generateDefinition(
      { term: 'x', term_type: 'word', context: '', dictionary: dictMiss },
      ENV
    );

    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(url).toContain('gemini-2.5-flash');
    expect(url).toContain('key=g-test');
  });
});
