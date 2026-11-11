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
