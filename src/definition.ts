import type { DictionaryEntry } from './types';

const MODEL = 'gemini-2.5-flash';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

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
  env: { GEMINI_API_KEY: string }
): Promise<string> {
  try {
    const res = await fetch(
      `${API_BASE}/${MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ parts: [{ text: buildUserMessage(input) }] }],
          generationConfig: { maxOutputTokens: 2000, temperature: 0.3 },
        }),
      }
    );
    if (!res.ok) return '(lookup failed — edit me)';
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? text.trim() : '(lookup failed — edit me)';
  } catch {
    return '(lookup failed — edit me)';
  }
}
