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
