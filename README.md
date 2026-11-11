# Vocab App

Personal vocab capture & digest system. iPhone-first.

- **3 capture modes** (iOS Shortcuts): share sheet, voice memo, Word Inbox widget
- **1 backend endpoint** (`POST /capture`) on Cloudflare Workers
- **1 cron job** that emails a digest every time 5 ready words accumulate
- **Storage**: Notion database
- **Cost**: free for typical personal use (Gemini Flash free tier covers thousands of words/day)

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
| Merriam-Webster Collegiate (optional) | https://dictionaryapi.com/register/index | Free |
| Google Gemini API | https://aistudio.google.com/apikey | Free tier (generous) |
| Resend | https://resend.com | Free tier covers you |

If you skip Merriam-Webster, the backend uses the Free Dictionary API (`dictionaryapi.dev`, no key required) as primary, with Gemini as a final fallback for any words/phrases neither dictionary covers.

### 3. Deploy the Worker (20 min)

```bash
npm install
cp .dev.vars.example .dev.vars  # fill in your keys for local dev

# Set production secrets (Cloudflare prompts you for each):
npx wrangler secret put NOTION_TOKEN
npx wrangler secret put NOTION_DATABASE_ID
npx wrangler secret put MERRIAM_API_KEY      # optional: hit Enter at the prompt to skip
npx wrangler secret put GEMINI_API_KEY
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
