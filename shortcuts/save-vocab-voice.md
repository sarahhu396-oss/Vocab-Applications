# Save Vocab Voice — Home Screen Shortcut

**Trigger:** tap home screen icon.

## Actions (in order)

1. **Dictate Text** — language: English (US), stop when: pause detected
2. **Set Variable** `Transcript` to dictated text
3. **Show "Confirm" alert**:
   - Title: "Heard:"
   - Body: `Transcript`
   - Buttons: "Save" / "Re-record" / "Cancel"
4. **If** "Re-record" tapped → loop back to step 1.
5. **If** "Save" tapped → continue.
6. **Text** action with your Worker URL → `BaseURL`
7. **Text** action with bearer token → `Token`
8. **Dictionary** action — build JSON:
   ```
   {
     "transcript": <Transcript>,
     "source": "voice-memo",
     "source_detail": "book or conversation"
   }
   ```
9. **Get Contents of URL**:
   - URL: `<BaseURL>/capture`
   - POST, headers as above, body as JSON.
10. Same success/error notification as the share-sheet shortcut.

## How to speak

> "Word, [your word]. Context, [your sentence]."

or

> "Phrase, [your phrase]. Context, [your sentence]."
