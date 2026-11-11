# Word Inbox — Widget Shortcut

**Trigger:** tap home-screen or lock-screen widget.

**Settings:** "Show in Widget" ON.

## Actions (in order)

1. **Ask for Input** — prompt "Word?" — input type: Text → `Word`
2. **Ask for Input** — prompt "Context? (optional)" — input type: Text, allow empty → `Context`
3. **Ask for Input** — prompt "Where?" — input type: Text, default "meeting" → `Detail`
4. **Text** with Worker URL → `BaseURL`
5. **Text** with bearer token → `Token`
6. **Dictionary** action — build JSON:
   ```
   {
     "word": <Word>,
     "context": <Context>,
     "source": "word-inbox",
     "source_detail": <Detail>
   }
   ```
7. **Get Contents of URL** — POST as above.
8. **Show Notification** based on success/error.

## Tip

The fastest path is: tap widget → type word → skip context (press Done with no input) → tap "meeting" default → done. ~2 seconds total.

Fill in context later by opening the row in Notion.
