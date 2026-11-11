# Vocab Capture & Digest System — Design

**Date:** 2026-05-30
**Owner:** sarahhu396@gmail.com
**Status:** Approved design, ready for implementation planning

## Goal

A personal vocab journal that makes it effortless to save new English words, phrases, and jargon as you encounter them — and quietly delivers them back as an email digest so you can passively reread and absorb them. No active testing or flashcards: the value comes from frictionless capture + a clean recap.

Primary device: iPhone. Secondary: Mac (review-only via Notion).

## Capture Modes

Three iOS Shortcuts. All hit the same backend endpoint with shape `{ word | transcript, context?, source, source_detail }`.

### 1. Phone Reading — "Save Vocab" (iOS Share Sheet)

- Trigger: highlight a sentence in any app → Share → "Save Vocab"
- Shortcut splits the highlighted text into tappable words → user taps the target word
- Sends: `{ word, context: <full highlighted sentence>, source: "phone-reading", source_detail: <app/URL from share extension> }`
- Friction: ~3 seconds

### 2. Voice Memo — "Save Vocab Voice" (Home Screen Icon)

- Trigger: tap home-screen icon → dictation starts immediately
- User speaks with explicit markers:
  - `"Word, perspicacious. Context, Her perspicacious analysis cut through the noise."`
  - `"Phrase, burning the midnight oil. Context, He's been burning the midnight oil all week."`
- Transcription engine: Apple's built-in dictation (free). Swap to OpenAI Whisper later if accuracy is insufficient.
- Backend parses markers: first occurrence of `Word`/`Phrase` defines term, first `Context` after that defines context
- Confirmation screen before save lets user fix mistranscriptions
- `term_type` (`word` vs `phrase`) is stored to inform downstream definition lookup (phrases skip basic dictionary, go straight to AI)

### 3. Word Inbox — Widget (Meetings / Anywhere)

- Trigger: tap home-screen or lock-screen widget
- Two prompts: `"Word?"` (required), `"Context? (optional)"` (skippable)
- Sends: `{ word, context: "" or user-typed, source: "word-inbox", source_detail: "meeting" or "" }`
- Friction: ~2 seconds for word-only case
- Rows with empty context are excluded from the email digest until the user fills context in later via Notion

## Data Model

Single Notion database. 6 columns:

| Column | Type | Filled by | Purpose |
|---|---|---|---|
| **Word** | Title | Capture | The word or phrase |
| **Context** | Text | Capture (may be empty) | Sentence you saw/heard it in |
| **Definition** | Text | Backend | Auto-fetched and rewritten by Claude; fully editable |
| **Source** | Text | Capture | Combined: `phone: nytimes.com/headline` / `voice: book` / `inbox: meeting` |
| **Captured** | Date | Capture | Row creation timestamp |
| **Sent** | Checkbox | Worker | True after included in a digest |

Notion's built-in page body acts as a free-form notes area per row — no separate Notes column needed.

### Design rules

- **No deduplication**: same word saved twice → two rows. User can merge in Notion if desired.
- **Edits stick**: the backend only writes on row creation. Subsequent edits to definition / context / source in Notion are never overwritten.
- **Email-eligibility filter**: `Sent = false AND Context != empty AND Definition != empty`

## Backend

### Stack

- **Runtime**: Cloudflare Workers
- **Language**: TypeScript
- **External services**:
  - Merriam-Webster Collegiate API (primary dictionary, free with key)
  - Free Dictionary API (`dictionaryapi.dev`) as fallback
  - Anthropic API (Claude Haiku 4.5) for context-aware definition rewriting
  - Notion API (write rows)
  - Resend (transactional email)

### Endpoint: `POST /capture`

Bearer-token auth (single shared secret stored in each Shortcut, matched against env var on the Worker). Sufficient since only the user's own devices hit it.

### Flow

1. Authenticate (bearer token check)
2. If `transcript` provided → parse markers `Word`/`Phrase` and `Context`; extract `{term, term_type, context}`
3. Normalize term: lowercase, trim, strip surrounding punctuation
4. Dictionary lookup: Merriam-Webster → Free Dictionary API fallback → mark "no-dictionary-hit" if both fail
5. **Always** call Claude with `(term, term_type, captured_context, raw_dictionary_response)`:
   - Prompt instructs the model to pick the sense matching the captured sentence, rewrite as one concise definition (≤140 chars), include part of speech
   - If no context: return most common sense, prefix with `(general)`
   - If dictionary missed and no context: write a plain-English definition from model knowledge
6. Write a Notion page in the Vocab DB with `{Word, Context, Definition, Source, Captured, Sent=false}`
7. Return `{ success, notion_url, definition }` to the Shortcut → Shortcut shows banner with definition preview

### Error Handling (boundaries only)

| Failure | Behavior |
|---|---|
| Dictionary down | Skip it; Claude writes definition from scratch |
| Claude API down | Save row with `Definition = "(lookup failed — edit me)"`; return 200 |
| Notion API down | Return 500; Shortcut shows red banner; iOS retries when network returns |
| Voice transcript missing markers | Save row with empty context; Shortcut prompts user to re-record |

## Email Digest Worker

### Trigger

- **Cloudflare Cron Trigger** runs every 30 minutes (cron: `*/30 * * * *`)
- Worst-case delay between hitting threshold and email arrival: ~30 min

### Threshold

- Default: **5 words**, stored as `DIGEST_THRESHOLD` env var

### Logic

```
EVERY 30 MIN:
  rows = Notion.query(
    database_id,
    filter: { Sent=false AND Context!=empty AND Definition!=empty },
    sort:   Captured ASC
  )

  if len(rows) < DIGEST_THRESHOLD:
    return

  digest_html = renderDigest(rows)
  Resend.send(to: YOUR_EMAIL, subject: ..., html: digest_html)

  for row in rows:
    Notion.patch(row.id, { Sent: true })
```

### Email Format

HTML email with one card per word. Each card shows:

- Word (large, bold)
- Definition (with part-of-speech prefix)
- Original captured context (block-quoted)
- Source (small, gray)

Header includes word count, date, and a "View in Notion" link to the full DB.

### Behavioral Notes

- Heavy capture days (e.g., 50 words) produce multiple sequential digests of 5+ each — never one massive email
- A "Send digest now" button in Notion (calling `POST /digest/send`) is deferred to v1.1

## Setup / Install

End-to-end install: one afternoon.

| Step | Action | Time |
|---|---|---|
| 1 | Create Notion DB with 6 columns; create integration; copy token + DB ID | 10 min |
| 2 | Collect API keys: Merriam-Webster, Anthropic, Resend | 15 min |
| 3 | Clone backend repo, set Cloudflare secrets, `wrangler deploy` | 20 min |
| 4 | Install 3 iOS Shortcuts (shared links), configure with worker URL + bearer token | 15 min |
| 5 | Smoke test all 3 capture modes | 5 min |

### Required env vars on the Worker

- `NOTION_TOKEN`
- `NOTION_DATABASE_ID`
- `MERRIAM_API_KEY`
- `ANTHROPIC_API_KEY`
- `RESEND_API_KEY`
- `YOUR_EMAIL`
- `SHORTCUT_BEARER_TOKEN`
- `DIGEST_THRESHOLD` (default `5`)

## Cost Estimate

| Service | Cost per 1,000 words |
|---|---|
| Cloudflare Workers | Free |
| Merriam-Webster API | Free |
| Notion API | Free |
| Claude Haiku (~250 in / 50 out per call) | ~$0.30 |
| Resend (~200 digests) | Free |
| **Total** | **~$0.30 per 1,000 words** |

## Out of Scope (deferred / not building)

- Active testing modes (flashcards, multiple choice, fill-in-blank, writing prompts)
- Spaced repetition scheduling
- Podcast Siri-shortcut capture mode
- Mac browser extension for laptop reading
- iOS native app (using Shortcuts instead)
- Notion → external dashboard (Notion itself is the dashboard)
- Apple Watch capture
- Per-word push notifications
- Duplicate detection / merging
- Tagging / categorization beyond `Source`
- "Send digest now" button (v1.1)
