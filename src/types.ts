export type WorkerEnv = {
  NOTION_TOKEN: string;
  NOTION_DATABASE_ID: string;
  MERRIAM_API_KEY?: string;
  GEMINI_API_KEY: string;
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
