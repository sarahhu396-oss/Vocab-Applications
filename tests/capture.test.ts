import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleCapture } from '../src/capture';
import type { WorkerEnv } from '../src/types';

vi.mock('../src/dictionary', () => ({
  lookupDictionary: vi.fn(),
}));
vi.mock('../src/definition', () => ({
  generateDefinition: vi.fn(),
}));
vi.mock('../src/notion', () => ({
  createWord: vi.fn(),
}));

import { lookupDictionary } from '../src/dictionary';
import { generateDefinition } from '../src/definition';
import { createWord } from '../src/notion';

const ENV: WorkerEnv = {
  NOTION_TOKEN: 'n',
  NOTION_DATABASE_ID: 'd',
  MERRIAM_API_KEY: 'm',
  GEMINI_API_KEY: 'g',
  RESEND_API_KEY: 'r',
  YOUR_EMAIL: 'y@x.com',
  SHORTCUT_BEARER_TOKEN: 't',
  DIGEST_THRESHOLD: '5',
};

beforeEach(() => {
  vi.mocked(lookupDictionary).mockReset();
  vi.mocked(generateDefinition).mockReset();
  vi.mocked(createWord).mockReset();
});

describe('handleCapture — text capture (phone-reading)', () => {
  it('runs lookup, definition, notion write and returns success', async () => {
    vi.mocked(lookupDictionary).mockResolvedValue({
      word: 'perspicacious',
      source: 'merriam-webster',
      senses: [{ part_of_speech: 'adj.', definition: 'sharp.' }],
    });
    vi.mocked(generateDefinition).mockResolvedValue('(adj.) Sharply perceptive.');
    vi.mocked(createWord).mockResolvedValue({
      id: 'p1',
      url: 'https://notion.so/p1',
    });

    const res = await handleCapture(
      {
        word: 'Perspicacious',
        context: 'Her perspicacious analysis cut through the noise.',
        source: 'phone-reading',
        source_detail: 'Safari · nytimes.com',
      },
      ENV
    );

    expect(res.success).toBe(true);
    expect(res.notion_url).toBe('https://notion.so/p1');
    expect(res.definition).toBe('(adj.) Sharply perceptive.');

    expect(vi.mocked(lookupDictionary).mock.calls[0][0]).toBe('perspicacious');
    const notionCall = vi.mocked(createWord).mock.calls[0][0];
    expect(notionCall.word).toBe('perspicacious');
    expect(notionCall.source).toBe('phone: Safari · nytimes.com');
  });
});

describe('handleCapture — voice transcript', () => {
  it('parses markers and extracts term + context', async () => {
    vi.mocked(lookupDictionary).mockResolvedValue({
      word: 'ephemeral',
      source: 'none',
      senses: [],
    });
    vi.mocked(generateDefinition).mockResolvedValue('(adj.) Short-lived.');
    vi.mocked(createWord).mockResolvedValue({ id: 'p2', url: 'https://x' });

    const res = await handleCapture(
      {
        transcript: 'Word, ephemeral. Context, the moment was ephemeral.',
        source: 'voice-memo',
        source_detail: 'book',
      },
      ENV
    );

    expect(res.success).toBe(true);
    expect(vi.mocked(lookupDictionary).mock.calls[0][0]).toBe('ephemeral');
    const notionCall = vi.mocked(createWord).mock.calls[0][0];
    expect(notionCall.context).toBe('the moment was ephemeral.');
    expect(notionCall.source).toBe('voice: book');
  });

  it('saves with empty context when markers are missing', async () => {
    vi.mocked(lookupDictionary).mockResolvedValue({
      word: 'mumble',
      source: 'none',
      senses: [],
    });
    vi.mocked(generateDefinition).mockResolvedValue('(general) (v.) speak unclearly.');
    vi.mocked(createWord).mockResolvedValue({ id: 'p3', url: 'https://y' });

    const res = await handleCapture(
      {
        transcript: 'just some random mumble with no markers',
        source: 'voice-memo',
        source_detail: '',
      },
      ENV
    );

    expect(res.success).toBe(true);
    const notionCall = vi.mocked(createWord).mock.calls[0][0];
    expect(notionCall.context).toBe('');
  });
});

describe('handleCapture — word inbox', () => {
  it('allows empty context, still writes the row', async () => {
    vi.mocked(lookupDictionary).mockResolvedValue({
      word: 'rapacious',
      source: 'merriam-webster',
      senses: [{ part_of_speech: 'adj.', definition: 'greedy.' }],
    });
    vi.mocked(generateDefinition).mockResolvedValue('(general) (adj.) Aggressively greedy.');
    vi.mocked(createWord).mockResolvedValue({ id: 'p4', url: 'https://z' });

    const res = await handleCapture(
      {
        word: 'rapacious',
        context: '',
        source: 'word-inbox',
        source_detail: 'meeting',
      },
      ENV
    );

    expect(res.success).toBe(true);
    const notionCall = vi.mocked(createWord).mock.calls[0][0];
    expect(notionCall.context).toBe('');
    expect(notionCall.source).toBe('inbox: meeting');
  });
});

describe('handleCapture — error paths', () => {
  it('returns failure when no word or transcript provided', async () => {
    const res = await handleCapture(
      { source: 'phone-reading', source_detail: 'x' },
      ENV
    );
    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();
  });

  it('returns failure when normalized term is empty', async () => {
    const res = await handleCapture(
      {
        word: '...',
        context: 'something',
        source: 'phone-reading',
        source_detail: 'x',
      },
      ENV
    );
    expect(res.success).toBe(false);
  });

  it('returns 500-equivalent (success=false) when Notion write throws', async () => {
    vi.mocked(lookupDictionary).mockResolvedValue({
      word: 'x',
      source: 'none',
      senses: [],
    });
    vi.mocked(generateDefinition).mockResolvedValue('(general) something');
    vi.mocked(createWord).mockRejectedValue(new Error('notion down'));

    const res = await handleCapture(
      {
        word: 'foo',
        context: 'something',
        source: 'phone-reading',
        source_detail: 'x',
      },
      ENV
    );

    expect(res.success).toBe(false);
    expect(res.error).toContain('notion');
  });
});
