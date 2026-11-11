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
