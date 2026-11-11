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
