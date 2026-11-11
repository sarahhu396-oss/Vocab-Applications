import { describe, it, expect } from 'vitest';
import { renderDigest } from '../src/digest';
import type { NotionRow } from '../src/types';

const rows: NotionRow[] = [
  {
    id: 'p1',
    url: 'https://notion.so/p1',
    word: 'perspicacious',
    context: 'Her perspicacious analysis cut through the noise.',
    definition: '(adj.) Sharply perceptive.',
    source: 'phone: nytimes.com',
    captured: new Date('2026-05-30T10:00:00Z'),
  },
  {
    id: 'p2',
    url: 'https://notion.so/p2',
    word: 'burning the midnight oil',
    context: 'He has been burning the midnight oil all week.',
    definition: '(phrase) Working late.',
    source: 'voice: book',
    captured: new Date('2026-05-30T11:00:00Z'),
  },
];

describe('renderDigest', () => {
  it('includes every word, definition, and context', () => {
    const html = renderDigest(rows, 'https://notion.so/dbview');
    expect(html).toContain('perspicacious');
    expect(html).toContain('(adj.) Sharply perceptive.');
    expect(html).toContain('Her perspicacious analysis cut through the noise.');
    expect(html).toContain('burning the midnight oil');
    expect(html).toContain('(phrase) Working late.');
  });

  it('includes the source for each row', () => {
    const html = renderDigest(rows, 'https://notion.so/dbview');
    expect(html).toContain('phone: nytimes.com');
    expect(html).toContain('voice: book');
  });

  it('includes the word count and notion view link in the header', () => {
    const html = renderDigest(rows, 'https://notion.so/dbview');
    expect(html).toContain('2 new words');
    expect(html).toContain('https://notion.so/dbview');
  });

  it('escapes HTML special characters in user content', () => {
    const malicious: NotionRow[] = [
      {
        ...rows[0],
        context: '<script>alert("xss")</script>',
      },
    ];
    const html = renderDigest(malicious, 'https://x');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
