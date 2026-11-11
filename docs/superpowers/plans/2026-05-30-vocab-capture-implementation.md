# Vocab Capture & Digest System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Cloudflare Worker that accepts vocab captures from 3 iOS Shortcuts, looks up context-aware definitions, writes them to a Notion database, and emails a digest every time 5 eligible words accumulate.

**Architecture:** Single TypeScript Cloudflare Worker with two entry points — a `POST /capture` HTTP handler and a `*/30 * * * *` cron handler. The fetch handler orchestrates: parse → normalize → dictionary lookup → Claude definition → Notion write. The cron handler queries Notion for unsent rows and sends an HTML digest via Resend when the count hits the threshold. External services: Merriam-Webster API, Free Dictionary API (`dictionaryapi.dev`), Anthropic (Claude Haiku 4.5), Notion, Resend.

**Tech Stack:** TypeScript, Cloudflare Workers (`wrangler`), Vitest for tests, `@anthropic-ai/sdk` for Claude, plain `fetch` for everything else.

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `wrangler.toml`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `.dev.vars.example`

- [ ] **Step 1: Create package.json**

Create `package.json`:

```json
{
  "name": "vocab-app",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.32.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20240909.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "wrangler": "^3.78.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 3: Create wrangler.toml**

Create `wrangler.toml`:

```toml
name = "vocab-app"
main = "src/index.ts"
compatibility_date = "2026-05-01"
compatibility_flags = ["nodejs_compat"]

[triggers]
crons = ["*/30 * * * *"]

[vars]
DIGEST_THRESHOLD = "5"
```

- [ ] **Step 4: Create vitest.config.ts**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 5: Create .gitignore**

Create `.gitignore`:

```
node_modules/
.dev.vars
.wrangler/
dist/
.DS_Store
*.log
```

- [ ] **Step 6: Create .dev.vars.example**

Create `.dev.vars.example`:

```
NOTION_TOKEN=secret_xxx
NOTION_DATABASE_ID=xxx
MERRIAM_API_KEY=xxx
ANTHROPIC_API_KEY=sk-ant-xxx
RESEND_API_KEY=re_xxx
YOUR_EMAIL=you@example.com
SHORTCUT_BEARER_TOKEN=pick-any-random-string
```

- [ ] **Step 7: Install dependencies**

Run: `npm install`
Expected: `node_modules/` populated, no errors.

- [ ] **Step 8: Verify typecheck passes on empty project**

Run: `npx tsc --noEmit`
Expected: exits 0 (will pass since `src/` is empty — that's fine).

- [ ] **Step 9: Commit**

```bash
git add package.json tsconfig.json wrangler.toml vitest.config.ts .gitignore .dev.vars.example package-lock.json
git commit -m "chore: scaffold Cloudflare Worker project"
```

---

## Task 2: Shared Types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Create the types module**

Create `src/types.ts`:

```ts
export type WorkerEnv = {
  NOTION_TOKEN: string;
  NOTION_DATABASE_ID: string;
  MERRIAM_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  RESEND_API_KEY: string;
  YOUR_EMAIL: string;
  SHORTCUT_BEARER_TOKEN: string;
  DIGEST_THRESHOLD: string;
};

export type CaptureSource = 'phone-reading' | 'voice-memo' | 'word-inbox';

export type CaptureRequest = {
  word?: string;
  transcript?: string;
  context?: string;
  source: CaptureSource;
  source_detail: string;
};

export type CaptureResponse = {
  success: boolean;
  notion_url?: string;
  definition?: string;
  error?: string;
};

export type ParsedTranscript = {
  term: string;
  term_type: 'word' | 'phrase' | null;
  context: string;
  markers_found: boolean;
};

export type DictionarySense = {
  part_of_speech: string;
  definition: string;
};

export type DictionaryEntry = {
  word: string;
  senses: DictionarySense[];
  source: 'merriam-webster' | 'free-dictionary' | 'none';
};

export type CapturedWord = {
  word: string;
  context: string;
  definition: string;
  source: string;
  captured: Date;
};

export type NotionRow = {
  id: string;
  url: string;
  word: string;
  context: string;
  definition: string;
  source: string;
  captured: Date;
};
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: shared types for capture, dictionary, notion"
```

---

## Task 3: Bearer Auth

**Files:**
- Create: `src/auth.ts`
- Create: `tests/auth.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/auth.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { checkBearerToken } from '../src/auth';

describe('checkBearerToken', () => {
  it('returns true when Authorization header matches expected token', () => {
    const req = new Request('https://x', {
      headers: { Authorization: 'Bearer abc123' },
    });
    expect(checkBearerToken(req, 'abc123')).toBe(true);
  });

  it('returns false when token does not match', () => {
    const req = new Request('https://x', {
      headers: { Authorization: 'Bearer wrong' },
    });
    expect(checkBearerToken(req, 'abc123')).toBe(false);
  });

  it('returns false when Authorization header is missing', () => {
    const req = new Request('https://x');
    expect(checkBearerToken(req, 'abc123')).toBe(false);
  });

  it('returns false when scheme is not Bearer', () => {
    const req = new Request('https://x', {
      headers: { Authorization: 'Basic abc123' },
    });
    expect(checkBearerToken(req, 'abc123')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/auth.test.ts`
Expected: FAIL — "Cannot find module '../src/auth'".

- [ ] **Step 3: Write minimal implementation**

Create `src/auth.ts`:

```ts
export function checkBearerToken(req: Request, expected: string): boolean {
  const header = req.headers.get('Authorization');
  if (!header) return false;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer') return false;
  return token === expected;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/auth.test.ts`
Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/auth.ts tests/auth.test.ts
git commit -m "feat: bearer token auth check"
```

---

## Task 4: Term Normalization

**Files:**
- Create: `src/normalize.ts`
- Create: `tests/normalize.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/normalize.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { normalizeTerm } from '../src/normalize';

describe('normalizeTerm', () => {
  it('lowercases the input', () => {
    expect(normalizeTerm('Perspicacious')).toBe('perspicacious');
  });

  it('trims whitespace', () => {
    expect(normalizeTerm('  perspicacious  ')).toBe('perspicacious');
  });

  it('strips leading and trailing punctuation', () => {
    expect(normalizeTerm('"perspicacious."')).toBe('perspicacious');
    expect(normalizeTerm('(rapacious),')).toBe('rapacious');
  });

  it('preserves internal punctuation in phrases', () => {
    expect(normalizeTerm('burning the midnight oil')).toBe('burning the midnight oil');
    expect(normalizeTerm("can't")).toBe("can't");
  });

  it('returns empty string for input that is only punctuation', () => {
    expect(normalizeTerm('...')).toBe('');
  });

  it('handles unicode characters', () => {
    expect(normalizeTerm('Naïve')).toBe('naïve');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/normalize.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/normalize.ts`:

```ts
export function normalizeTerm(raw: string): string {
  const lowered = raw.toLowerCase().trim();
  return lowered.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}']+$/gu, '');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/normalize.test.ts`
Expected: 6 passing.

- [ ] **Step 5: Commit**

```bash
git add src/normalize.ts tests/normalize.test.ts
git commit -m "feat: term normalization (lowercase, trim, strip outer punctuation)"
```

---

## Task 5: Transcript Marker Parser

**Files:**
- Create: `src/parseTranscript.ts`
- Create: `tests/parseTranscript.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/parseTranscript.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseTranscript } from '../src/parseTranscript';

describe('parseTranscript', () => {
  it('parses a Word + Context transcript', () => {
    const result = parseTranscript(
      'Word, perspicacious. Context, Her perspicacious analysis cut through the noise.'
    );
    expect(result.term).toBe('perspicacious');
    expect(result.term_type).toBe('word');
    expect(result.context).toBe('Her perspicacious analysis cut through the noise.');
    expect(result.markers_found).toBe(true);
  });

  it('parses a Phrase + Context transcript', () => {
    const result = parseTranscript(
      'Phrase, burning the midnight oil. Context, He has been burning the midnight oil all week.'
    );
    expect(result.term).toBe('burning the midnight oil');
    expect(result.term_type).toBe('phrase');
    expect(result.context).toBe('He has been burning the midnight oil all week.');
    expect(result.markers_found).toBe(true);
  });

  it('is case-insensitive for markers', () => {
    const result = parseTranscript('word, ephemeral. context, the moment was ephemeral.');
    expect(result.term).toBe('ephemeral');
    expect(result.context).toBe('the moment was ephemeral.');
    expect(result.markers_found).toBe(true);
  });

  it('ignores later occurrences of marker tokens inside the context', () => {
    const result = parseTranscript(
      'Word, context. Context, You need to read it in context to understand the word.'
    );
    expect(result.term).toBe('context');
    expect(result.term_type).toBe('word');
    expect(result.context).toBe(
      'You need to read it in context to understand the word.'
    );
  });

  it('returns markers_found false when no markers present', () => {
    const result = parseTranscript('just a free-form sentence with no markers');
    expect(result.markers_found).toBe(false);
    expect(result.term).toBe('');
    expect(result.context).toBe('');
    expect(result.term_type).toBe(null);
  });

  it('handles Word marker without Context marker (empty context)', () => {
    const result = parseTranscript('Word, perspicacious.');
    expect(result.term).toBe('perspicacious');
    expect(result.term_type).toBe('word');
    expect(result.context).toBe('');
    expect(result.markers_found).toBe(true);
  });

  it('tolerates pauses transcribed as periods between markers', () => {
    const result = parseTranscript(
      'Word. perspicacious. Context. Her analysis was perspicacious.'
    );
    expect(result.term).toBe('perspicacious');
    expect(result.context).toBe('Her analysis was perspicacious.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/parseTranscript.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/parseTranscript.ts`:

```ts
import type { ParsedTranscript } from './types';

const WORD_MARKER = /(?:^|[\s,.])word(?:[\s,.])/i;
const PHRASE_MARKER = /(?:^|[\s,.])phrase(?:[\s,.])/i;
const CONTEXT_MARKER = /(?:^|[\s,.])context(?:[\s,.])/i;

function findFirst(re: RegExp, s: string): { start: number; end: number } | null {
  const m = re.exec(s);
  if (!m) return null;
  return { start: m.index, end: m.index + m[0].length };
}

function stripWrapping(s: string): string {
  return s.trim().replace(/^[,.\s]+|[,.\s]+$/g, '').trim();
}

export function parseTranscript(transcript: string): ParsedTranscript {
  const wordHit = findFirst(WORD_MARKER, transcript);
  const phraseHit = findFirst(PHRASE_MARKER, transcript);

  let termStart: number;
  let term_type: 'word' | 'phrase' | null;

  if (wordHit && (!phraseHit || wordHit.start < phraseHit.start)) {
    termStart = wordHit.end;
    term_type = 'word';
  } else if (phraseHit) {
    termStart = phraseHit.end;
    term_type = 'phrase';
  } else {
    return { term: '', term_type: null, context: '', markers_found: false };
  }

  const afterTerm = transcript.slice(termStart);
  const contextHit = findFirst(CONTEXT_MARKER, afterTerm);

  let term: string;
  let context: string;
  if (contextHit) {
    term = stripWrapping(afterTerm.slice(0, contextHit.start));
    context = stripWrapping(afterTerm.slice(contextHit.end));
  } else {
    term = stripWrapping(afterTerm);
    context = '';
  }

  return { term, term_type, context, markers_found: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/parseTranscript.test.ts`
Expected: 7 passing.

- [ ] **Step 5: Commit**

```bash
git add src/parseTranscript.ts tests/parseTranscript.test.ts
git commit -m "feat: voice transcript marker parser (Word/Phrase/Context)"
```

---

## Task 6: Dictionary Client (Merriam-Webster + Free Fallback)

**Files:**
- Create: `src/dictionary.ts`
- Create: `tests/dictionary.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/dictionary.test.ts`:

```ts
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/dictionary.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/dictionary.ts`:

```ts
import type { DictionaryEntry, DictionarySense } from './types';

async function tryMerriam(
  term: string,
  apiKey: string
): Promise<DictionarySense[] | null> {
  try {
    const url = `https://www.dictionaryapi.com/api/v3/references/collegiate/json/${encodeURIComponent(
      term
    )}?key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as unknown[];
    if (!Array.isArray(data) || data.length === 0) return null;
    if (typeof data[0] === 'string') return null; // suggestions, not entries
    const senses: DictionarySense[] = [];
    for (const entry of data as Array<Record<string, unknown>>) {
      const fl = typeof entry.fl === 'string' ? entry.fl : 'unknown';
      const shortdef = Array.isArray(entry.shortdef) ? entry.shortdef : [];
      for (const d of shortdef) {
        if (typeof d === 'string') senses.push({ part_of_speech: fl, definition: d });
      }
    }
    return senses.length > 0 ? senses : null;
  } catch {
    return null;
  }
}

async function tryFreeDictionary(term: string): Promise<DictionarySense[] | null> {
  try {
    const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{
      meanings?: Array<{
        partOfSpeech?: string;
        definitions?: Array<{ definition?: string }>;
      }>;
    }>;
    const senses: DictionarySense[] = [];
    for (const entry of data) {
      for (const m of entry.meanings ?? []) {
        const pos = m.partOfSpeech ?? 'unknown';
        for (const d of m.definitions ?? []) {
          if (d.definition) senses.push({ part_of_speech: pos, definition: d.definition });
        }
      }
    }
    return senses.length > 0 ? senses : null;
  } catch {
    return null;
  }
}

export async function lookupDictionary(
  term: string,
  env: { MERRIAM_API_KEY: string }
): Promise<DictionaryEntry> {
  const mw = await tryMerriam(term, env.MERRIAM_API_KEY);
  if (mw) return { word: term, senses: mw, source: 'merriam-webster' };

  const free = await tryFreeDictionary(term);
  if (free) return { word: term, senses: free, source: 'free-dictionary' };

  return { word: term, senses: [], source: 'none' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/dictionary.test.ts`
Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/dictionary.ts tests/dictionary.test.ts
git commit -m "feat: dictionary client (Merriam-Webster primary, Free Dictionary fallback)"
```

---

## Task 7: Claude Definition Client

**Files:**
- Create: `src/definition.ts`
- Create: `tests/definition.test.ts`

The Claude call uses a static system prompt (good candidate for prompt caching when call volume is high). Use Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) for cost efficiency.

- [ ] **Step 1: Write the failing tests**

Create `tests/definition.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateDefinition } from '../src/definition';
import type { DictionaryEntry } from '../src/types';

const dictHit: DictionaryEntry = {
  word: 'perspicacious',
  source: 'merriam-webster',
  senses: [{ part_of_speech: 'adjective', definition: 'of acute mental vision' }],
};

const dictMiss: DictionaryEntry = { word: 'foobar', source: 'none', senses: [] };

const ENV = { ANTHROPIC_API_KEY: 'sk-test' };

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    })),
  };
});

beforeEach(() => {
  mockCreate.mockReset();
});

describe('generateDefinition', () => {
  it('returns the model text on success', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '(adj.) Sharply perceptive.' }],
    });

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

  it('returns placeholder on API error', async () => {
    mockCreate.mockRejectedValue(new Error('rate limited'));

    const def = await generateDefinition(
      { term: 'foobar', term_type: 'word', context: '', dictionary: dictMiss },
      ENV
    );
    expect(def).toBe('(lookup failed — edit me)');
  });

  it('includes "(general)" hint in prompt when no context provided', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '(general) (adj.) Sharply perceptive.' }],
    });

    await generateDefinition(
      { term: 'perspicacious', term_type: 'word', context: '', dictionary: dictHit },
      ENV
    );

    const callArgs = mockCreate.mock.calls[0][0];
    const userMsg: string = callArgs.messages[0].content;
    expect(userMsg.toLowerCase()).toContain('no context provided');
  });

  it('passes term, term_type, context, and dictionary into the user message', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '(phrase) Working late.' }],
    });

    await generateDefinition(
      {
        term: 'burning the midnight oil',
        term_type: 'phrase',
        context: 'He has been burning the midnight oil all week.',
        dictionary: dictMiss,
      },
      ENV
    );

    const callArgs = mockCreate.mock.calls[0][0];
    const userMsg: string = callArgs.messages[0].content;
    expect(userMsg).toContain('burning the midnight oil');
    expect(userMsg).toContain('phrase');
    expect(userMsg).toContain('He has been burning the midnight oil all week.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/definition.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/definition.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk';
import type { DictionaryEntry } from './types';

const MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `You write concise vocabulary card definitions.

Rules:
- Output ONE definition, max 140 characters.
- Start with part of speech in parentheses: (n.) (v.) (adj.) (adv.) (phrase) etc.
- Pick the sense that matches the captured sentence, if one is provided.
- If no context is given, return the most common sense and prefix the WHOLE output with "(general) ".
- Plain English. No quotes, no examples, no synonyms, no etymology.
- Do not include the term being defined in the definition itself.`;

export type DefinitionInput = {
  term: string;
  term_type: 'word' | 'phrase' | null;
  context: string;
  dictionary: DictionaryEntry;
};

function buildUserMessage(input: DefinitionInput): string {
  const dictText =
    input.dictionary.senses.length === 0
      ? 'No dictionary entry found.'
      : input.dictionary.senses
          .map((s, i) => `${i + 1}. (${s.part_of_speech}) ${s.definition}`)
          .join('\n');

  const contextText =
    input.context.length === 0 ? 'No context provided.' : input.context;

  return `Term: ${input.term}
Type: ${input.term_type ?? 'unknown'}
Captured sentence: ${contextText}
Dictionary entries:
${dictText}`;
}

export async function generateDefinition(
  input: DefinitionInput,
  env: { ANTHROPIC_API_KEY: string }
): Promise<string> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  try {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 200,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: buildUserMessage(input) }],
    });

    for (const block of resp.content) {
      if (block.type === 'text') return block.text.trim();
    }
    return '(lookup failed — edit me)';
  } catch {
    return '(lookup failed — edit me)';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/definition.test.ts`
Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/definition.ts tests/definition.test.ts
git commit -m "feat: Claude Haiku definition generator with prompt caching"
```

---

## Task 8: Notion Client

**Files:**
- Create: `src/notion.ts`
- Create: `tests/notion.test.ts`

The Notion API: `POST /v1/pages` to create, `POST /v1/databases/{id}/query` to query, `PATCH /v1/pages/{id}` to update.

- [ ] **Step 1: Write the failing tests**

Create `tests/notion.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/notion.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/notion.ts`:

```ts
import type { CapturedWord, NotionRow } from './types';

const NOTION_VERSION = '2022-06-28';
const BASE = 'https://api.notion.com/v1';

type NotionEnv = { NOTION_TOKEN: string; NOTION_DATABASE_ID: string };

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

function richText(s: string) {
  return s.length === 0 ? [] : [{ text: { content: s } }];
}

export async function createWord(
  word: CapturedWord,
  env: NotionEnv
): Promise<{ id: string; url: string }> {
  const body = {
    parent: { database_id: env.NOTION_DATABASE_ID },
    properties: {
      Word: { title: [{ text: { content: word.word } }] },
      Context: { rich_text: richText(word.context) },
      Definition: { rich_text: richText(word.definition) },
      Source: { rich_text: richText(word.source) },
      Captured: { date: { start: word.captured.toISOString() } },
      Sent: { checkbox: false },
    },
  };

  const res = await fetch(`${BASE}/pages`, {
    method: 'POST',
    headers: authHeaders(env.NOTION_TOKEN),
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Notion createPage failed: ${res.status}`);
  const data = (await res.json()) as { id: string; url: string };
  return { id: data.id, url: data.url };
}

export async function queryUnsentReady(env: NotionEnv): Promise<NotionRow[]> {
  const body = {
    filter: {
      and: [
        { property: 'Sent', checkbox: { equals: false } },
        { property: 'Context', rich_text: { is_not_empty: true } },
        { property: 'Definition', rich_text: { is_not_empty: true } },
      ],
    },
    sorts: [{ property: 'Captured', direction: 'ascending' }],
    page_size: 100,
  };

  const res = await fetch(`${BASE}/databases/${env.NOTION_DATABASE_ID}/query`, {
    method: 'POST',
    headers: authHeaders(env.NOTION_TOKEN),
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Notion query failed: ${res.status}`);
  const data = (await res.json()) as {
    results: Array<{
      id: string;
      url: string;
      properties: Record<string, unknown>;
    }>;
  };

  const plain = (rt: unknown): string => {
    if (!Array.isArray(rt)) return '';
    return (rt as Array<{ plain_text?: string }>)
      .map((b) => b.plain_text ?? '')
      .join('');
  };

  return data.results.map((p) => {
    const props = p.properties as Record<string, Record<string, unknown>>;
    const wordTitle = (props.Word?.title as unknown) ?? [];
    const captured = (props.Captured?.date as { start?: string } | undefined)?.start;
    return {
      id: p.id,
      url: p.url,
      word: plain(wordTitle),
      context: plain(props.Context?.rich_text),
      definition: plain(props.Definition?.rich_text),
      source: plain(props.Source?.rich_text),
      captured: captured ? new Date(captured) : new Date(0),
    };
  });
}

export async function markSent(
  rowId: string,
  env: { NOTION_TOKEN: string }
): Promise<void> {
  const res = await fetch(`${BASE}/pages/${rowId}`, {
    method: 'PATCH',
    headers: authHeaders(env.NOTION_TOKEN),
    body: JSON.stringify({ properties: { Sent: { checkbox: true } } }),
  });
  if (!res.ok) throw new Error(`Notion patch failed: ${res.status}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/notion.test.ts`
Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/notion.ts tests/notion.test.ts
git commit -m "feat: Notion API client (createWord, queryUnsentReady, markSent)"
```

---

## Task 9: HTML Digest Renderer

**Files:**
- Create: `src/digest.ts`
- Create: `tests/digest.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/digest.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/digest.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/digest.ts`:

```ts
import type { NotionRow } from './types';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderCard(row: NotionRow): string {
  return `
    <div style="padding:16px 0;border-bottom:1px solid #eee;">
      <div style="font-size:20px;font-weight:700;color:#111;">${escapeHtml(row.word)}</div>
      <div style="margin-top:4px;font-size:15px;color:#444;">${escapeHtml(row.definition)}</div>
      <blockquote style="margin:12px 0 4px 0;padding-left:12px;border-left:3px solid #ddd;font-style:italic;color:#555;">
        ${escapeHtml(row.context)}
      </blockquote>
      <div style="font-size:12px;color:#999;">${escapeHtml(row.source)}</div>
    </div>
  `;
}

export function renderDigest(rows: NotionRow[], notionDbUrl: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const cards = rows.map(renderCard).join('\n');

  return `<!doctype html>
<html><body style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
  <header style="border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:16px;">
    <div style="font-size:22px;font-weight:700;">📚 Your vocab digest</div>
    <div style="font-size:13px;color:#666;">${rows.length} new words · ${today}</div>
    <div style="margin-top:8px;"><a href="${escapeHtml(notionDbUrl)}" style="color:#0a66c2;font-size:13px;">View all in Notion →</a></div>
  </header>
  ${cards}
</body></html>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/digest.test.ts`
Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/digest.ts tests/digest.test.ts
git commit -m "feat: HTML digest email renderer with XSS escaping"
```

---

## Task 10: Resend Email Client

**Files:**
- Create: `src/email.ts`
- Create: `tests/email.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/email.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/email.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/email.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/email.test.ts`
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add src/email.ts tests/email.test.ts
git commit -m "feat: Resend email client"
```

---

## Task 11: Capture Orchestrator

**Files:**
- Create: `src/capture.ts`
- Create: `tests/capture.test.ts`

Orchestrates: parse transcript (if voice) → normalize term → dictionary → Claude → Notion. Mocks all four downstream modules so the test is fast and deterministic.

- [ ] **Step 1: Write the failing tests**

Create `tests/capture.test.ts`:

```ts
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
  ANTHROPIC_API_KEY: 'a',
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/capture.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/capture.ts`:

```ts
import type {
  CaptureRequest,
  CaptureResponse,
  CaptureSource,
  WorkerEnv,
} from './types';
import { parseTranscript } from './parseTranscript';
import { normalizeTerm } from './normalize';
import { lookupDictionary } from './dictionary';
import { generateDefinition } from './definition';
import { createWord } from './notion';

const SOURCE_PREFIX: Record<CaptureSource, string> = {
  'phone-reading': 'phone',
  'voice-memo': 'voice',
  'word-inbox': 'inbox',
};

function buildSource(source: CaptureSource, detail: string): string {
  const prefix = SOURCE_PREFIX[source];
  return detail.length === 0 ? prefix : `${prefix}: ${detail}`;
}

export async function handleCapture(
  req: CaptureRequest,
  env: WorkerEnv
): Promise<CaptureResponse> {
  let rawTerm = '';
  let context = req.context ?? '';
  let term_type: 'word' | 'phrase' | null = null;

  if (req.transcript) {
    const parsed = parseTranscript(req.transcript);

    if (!parsed.markers_found) {
      // Markers missing — save a placeholder row so the user can fix it in
      // Notion. Skip dictionary + Claude (term is meaningless).
      try {
        const { url } = await createWord(
          {
            word: '(missing markers — edit)',
            context: '',
            definition: req.transcript.slice(0, 500),
            source: buildSource(req.source, req.source_detail),
            captured: new Date(),
          },
          env
        );
        return {
          success: true,
          notion_url: url,
          definition: '(missing markers — edit this entry)',
        };
      } catch (e) {
        return { success: false, error: `notion: ${(e as Error).message}` };
      }
    }

    rawTerm = parsed.term;
    context = parsed.context;
    term_type = parsed.term_type;
  } else if (req.word) {
    rawTerm = req.word;
  } else {
    return { success: false, error: 'missing word or transcript' };
  }

  const term = normalizeTerm(rawTerm);
  if (term.length === 0) {
    return { success: false, error: 'normalized term is empty' };
  }

  const dictionary = await lookupDictionary(term, env);
  const definition = await generateDefinition(
    { term, term_type, context, dictionary },
    env
  );

  try {
    const { url } = await createWord(
      {
        word: term,
        context,
        definition,
        source: buildSource(req.source, req.source_detail),
        captured: new Date(),
      },
      env
    );
    return { success: true, notion_url: url, definition };
  } catch (e) {
    return { success: false, error: `notion: ${(e as Error).message}` };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/capture.test.ts`
Expected: 7 passing.

- [ ] **Step 5: Commit**

```bash
git add src/capture.ts tests/capture.test.ts
git commit -m "feat: capture orchestrator (parse, dictionary, definition, notion)"
```

---

## Task 12: Digest Worker Orchestrator

**Files:**
- Create: `src/digestWorker.ts`
- Create: `tests/digestWorker.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/digestWorker.test.ts`:

```ts
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
  ANTHROPIC_API_KEY: 'a',
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/digestWorker.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/digestWorker.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/digestWorker.test.ts`
Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/digestWorker.ts tests/digestWorker.test.ts
git commit -m "feat: digest worker (threshold check, email, mark sent)"
```

---

## Task 13: Worker Entry Point

**Files:**
- Create: `src/index.ts`

This wires the HTTP `fetch` handler (routes `POST /capture`) and the `scheduled` cron handler (calls `runDigest`).

- [ ] **Step 1: Write the entry point**

Create `src/index.ts`:

```ts
import type { WorkerEnv, CaptureRequest } from './types';
import { checkBearerToken } from './auth';
import { handleCapture } from './capture';
import { runDigest } from './digestWorker';

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(req: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === 'POST' && url.pathname === '/capture') {
      if (!checkBearerToken(req, env.SHORTCUT_BEARER_TOKEN)) {
        return json({ success: false, error: 'unauthorized' }, 401);
      }
      let body: CaptureRequest;
      try {
        body = (await req.json()) as CaptureRequest;
      } catch {
        return json({ success: false, error: 'invalid JSON' }, 400);
      }
      const result = await handleCapture(body, env);
      return json(result, result.success ? 200 : 500);
    }

    return new Response('Not found', { status: 404 });
  },

  async scheduled(_event: ScheduledEvent, env: WorkerEnv): Promise<void> {
    await runDigest(env);
  },
};
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Run all tests**

Run: `npm test`
Expected: all tests pass (auth, normalize, parseTranscript, dictionary, definition, notion, digest, email, capture, digestWorker).

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: Worker entry (POST /capture, scheduled digest)"
```

---

## Task 14: iOS Shortcut Documentation

**Files:**
- Create: `shortcuts/README.md`
- Create: `shortcuts/save-vocab-share-sheet.md`
- Create: `shortcuts/save-vocab-voice.md`
- Create: `shortcuts/word-inbox-widget.md`

These are step-by-step build instructions because Shortcuts cannot be committed as code — they're built in the iOS Shortcuts app and shared as links.

- [ ] **Step 1: Create shortcuts/README.md**

Create `shortcuts/README.md`:

```markdown
# iOS Shortcuts

All three shortcuts POST to `https://<your-worker>.workers.dev/capture` with:

- Header: `Authorization: Bearer <SHORTCUT_BEARER_TOKEN>`
- Header: `Content-Type: application/json`
- Body: JSON matching the `CaptureRequest` shape in `src/types.ts`

**One-time setup inside each Shortcut:**

1. Add a "Text" action at the top with your Worker base URL.
2. Add a "Text" action with your bearer token.
3. Reference both in the "Get Contents of URL" action that does the POST.

You can also create them as **Saved Variables** in the Shortcuts app so all three shortcuts share one source of truth.

**Response handling:** all three shortcuts read the JSON response and show a "Saved ✓" notification on `success=true`, or a red error notification with the `error` field on `success=false`.
```

- [ ] **Step 2: Create shortcuts/save-vocab-share-sheet.md**

Create `shortcuts/save-vocab-share-sheet.md`:

```markdown
# Save Vocab — Share Sheet Shortcut

**Trigger:** appears in iOS share sheet when text is selected in any app.

**Settings (in Shortcut details):**
- Use with Share Sheet: ON
- Share Sheet Types: Text, URL

## Actions (in order)

1. **Receive Text and URL from Share Sheet**
2. **Get Text from Shortcut Input** → stored as `Selection`
3. **Split Text** `Selection` by "Spaces" → stored as `Words`
4. **Choose from List** `Words` → prompt "Which word?" → stored as `Word`
5. **Text** action with your Worker URL → stored as `BaseURL`
6. **Text** action with your bearer token → stored as `Token`
7. **Dictionary** action — build the JSON body:
   ```
   {
     "word": <Word>,
     "context": <Selection>,
     "source": "phone-reading",
     "source_detail": <Shortcut Input URL>
   }
   ```
8. **Get Contents of URL**:
   - URL: `<BaseURL>/capture`
   - Method: POST
   - Headers:
     - `Authorization`: `Bearer <Token>`
     - `Content-Type`: `application/json`
   - Request Body: JSON (from step 7)
9. **Get Dictionary Value** `success` from response
10. **If** `success = true`:
    - **Show Notification** "Saved ✓"
    - Else: **Show Notification** with `error` field, color red
```

- [ ] **Step 3: Create shortcuts/save-vocab-voice.md**

Create `shortcuts/save-vocab-voice.md`:

```markdown
# Save Vocab Voice — Home Screen Shortcut

**Trigger:** tap home screen icon.

## Actions (in order)

1. **Dictate Text** — language: English (US), stop when: pause detected
2. **Set Variable** `Transcript` to dictated text
3. **Show "Confirm" alert**:
   - Title: "Heard:"
   - Body: `Transcript`
   - Buttons: "Save" / "Re-record" / "Cancel"
4. **If** "Re-record" tapped → loop back to step 1.
5. **If** "Save" tapped → continue.
6. **Text** action with your Worker URL → `BaseURL`
7. **Text** action with bearer token → `Token`
8. **Dictionary** action — build JSON:
   ```
   {
     "transcript": <Transcript>,
     "source": "voice-memo",
     "source_detail": "book or conversation"
   }
   ```
9. **Get Contents of URL**:
   - URL: `<BaseURL>/capture`
   - POST, headers as above, body as JSON.
10. Same success/error notification as the share-sheet shortcut.

## How to speak

> "Word, [your word]. Context, [your sentence]."

or

> "Phrase, [your phrase]. Context, [your sentence]."
```

- [ ] **Step 4: Create shortcuts/word-inbox-widget.md**

Create `shortcuts/word-inbox-widget.md`:

```markdown
# Word Inbox — Widget Shortcut

**Trigger:** tap home-screen or lock-screen widget.

**Settings:** "Show in Widget" ON.

## Actions (in order)

1. **Ask for Input** — prompt "Word?" — input type: Text → `Word`
2. **Ask for Input** — prompt "Context? (optional)" — input type: Text, allow empty → `Context`
3. **Ask for Input** — prompt "Where?" — input type: Text, default "meeting" → `Detail`
4. **Text** with Worker URL → `BaseURL`
5. **Text** with bearer token → `Token`
6. **Dictionary** action — build JSON:
   ```
   {
     "word": <Word>,
     "context": <Context>,
     "source": "word-inbox",
     "source_detail": <Detail>
   }
   ```
7. **Get Contents of URL** — POST as above.
8. **Show Notification** based on success/error.

## Tip

The fastest path is: tap widget → type word → skip context (press Done with no input) → tap "meeting" default → done. ~2 seconds total.

Fill in context later by opening the row in Notion.
```

- [ ] **Step 5: Commit**

```bash
git add shortcuts/
git commit -m "docs: iOS Shortcut build instructions for 3 capture flows"
```

---

## Task 15: README + Deployment Guide

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README.md**

Create `README.md`:

````markdown
# Vocab App

Personal vocab capture & digest system. iPhone-first.

- **3 capture modes** (iOS Shortcuts): share sheet, voice memo, Word Inbox widget
- **1 backend endpoint** (`POST /capture`) on Cloudflare Workers
- **1 cron job** that emails a digest every time 5 ready words accumulate
- **Storage**: Notion database
- **Cost**: ~$0.30 per 1,000 words (Claude Haiku is the only paid service)

See [design spec](docs/superpowers/specs/2026-05-30-vocab-capture-design.md) for the full design.

## Setup

### 1. Notion (10 min)

1. Create a Notion database called **Vocab** with these properties:
   - **Word** (Title)
   - **Context** (Text)
   - **Definition** (Text)
   - **Source** (Text)
   - **Captured** (Date)
   - **Sent** (Checkbox)
2. Create an integration at https://notion.so/my-integrations → copy the **Internal Integration Token**.
3. Open the Vocab DB → ⋯ → Connections → add the integration.
4. Copy the database ID from the page URL.

### 2. API keys (15 min)

| Service | Where | Cost |
|---|---|---|
| Merriam-Webster Collegiate | https://dictionaryapi.com/register/index | Free |
| Anthropic API | https://console.anthropic.com | Pay-as-you-go |
| Resend | https://resend.com | Free tier covers you |

### 3. Deploy the Worker (20 min)

```bash
npm install
cp .dev.vars.example .dev.vars  # fill in your keys for local dev

# Set production secrets (Cloudflare prompts you for each):
npx wrangler secret put NOTION_TOKEN
npx wrangler secret put NOTION_DATABASE_ID
npx wrangler secret put MERRIAM_API_KEY
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put YOUR_EMAIL
npx wrangler secret put SHORTCUT_BEARER_TOKEN

# Deploy:
npx wrangler deploy
```

Wrangler prints your Worker URL on success (e.g., `https://vocab-app.<your-handle>.workers.dev`).

### 4. Install iOS Shortcuts (15 min)

Build the three shortcuts using the instructions in [`shortcuts/`](shortcuts/):

- [`save-vocab-share-sheet.md`](shortcuts/save-vocab-share-sheet.md)
- [`save-vocab-voice.md`](shortcuts/save-vocab-voice.md)
- [`word-inbox-widget.md`](shortcuts/word-inbox-widget.md)

In each shortcut, replace `<BaseURL>` with your Worker URL and `<Token>` with the bearer token you set in step 3.

### 5. Smoke test (5 min)

1. Open Safari, highlight a sentence, Share → "Save Vocab" → tap word.
2. Check Notion — new row should appear with definition filled in.
3. Voice memo: tap home-screen icon, say `"Word, ephemeral. Context, the moment was ephemeral."`.
4. Widget: tap, type word, skip context.

When you have 5 ready rows (with context + definition), wait up to 30 min for the first digest email.

## Development

```bash
npm test                # run all tests
npm run test:watch      # watch mode
npm run typecheck       # tsc --noEmit
npm run dev             # local Worker on :8787
```

## Tuning

- **Digest threshold:** edit `DIGEST_THRESHOLD` in `wrangler.toml` (default `"5"`), then `npx wrangler deploy`.
- **Cron schedule:** edit `[triggers].crons` in `wrangler.toml` (default `*/30 * * * *`).
- **Email "from" address:** edit `FROM` in `src/email.ts`.
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README with setup, deploy, and tuning instructions"
```

---

## Final verification

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all 10 suites pass (~46 tests total).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Confirm the project is ready for deploy**

Verify:
- All env vars listed in `.dev.vars.example` match what's referenced in `src/types.ts` as `WorkerEnv`.
- `wrangler.toml` has the correct cron schedule and `DIGEST_THRESHOLD`.
- README's setup steps match the actual env var names.

- [ ] **Step 4: Final commit if anything was tweaked**

```bash
git status
# If clean, you're done. If not, commit with a descriptive message.
```
