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
  env: { MERRIAM_API_KEY?: string }
): Promise<DictionaryEntry> {
  if (env.MERRIAM_API_KEY) {
    const mw = await tryMerriam(term, env.MERRIAM_API_KEY);
    if (mw) return { word: term, senses: mw, source: 'merriam-webster' };
  }

  const free = await tryFreeDictionary(term);
  if (free) return { word: term, senses: free, source: 'free-dictionary' };

  return { word: term, senses: [], source: 'none' };
}
