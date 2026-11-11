import type { ParsedTranscript } from './types';

const WORD_MARKER = /(?:^|[\s,.])word(?:[\s,.])/i;
const PHRASE_MARKER = /(?:^|[\s,.])phrase(?:[\s,.])/i;
const CONTEXT_MARKER = /(?:^|[\s,.])context(?:[\s,.])/i;

function findFirst(re: RegExp, s: string): { start: number; end: number } | null {
  const m = re.exec(s);
  if (!m) return null;
  return { start: m.index, end: m.index + m[0].length };
}

function stripTermWrapping(s: string): string {
  return s.trim().replace(/^[,.\s]+|[,.\s]+$/g, '').trim();
}

function stripContextWrapping(s: string): string {
  return s.trim().replace(/^[,.\s]+/, '').trim();
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

  // The term ends at the first sentence-boundary punctuation (. or ,).
  // We need to search for the Context marker AFTER the term ends, otherwise
  // a term that happens to equal "context" would self-match.
  const termEndMatch = /[.,]/.exec(afterTerm);
  const searchStart = termEndMatch ? termEndMatch.index : 0;
  const searchRegion = afterTerm.slice(searchStart);
  const contextHitRel = findFirst(CONTEXT_MARKER, searchRegion);
  const contextHit = contextHitRel
    ? { start: contextHitRel.start + searchStart, end: contextHitRel.end + searchStart }
    : null;

  let term: string;
  let context: string;
  if (contextHit) {
    term = stripTermWrapping(afterTerm.slice(0, contextHit.start));
    context = stripContextWrapping(afterTerm.slice(contextHit.end));
  } else {
    term = stripTermWrapping(afterTerm);
    context = '';
  }

  return { term, term_type, context, markers_found: true };
}
