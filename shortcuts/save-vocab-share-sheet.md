# Save Vocab — Share Sheet Shortcut

**Trigger:** appears in iOS share sheet when text is selected in any app.

**Settings (in Shortcut details):**
- Use with Share Sheet: ON
- Share Sheet Types: Text, URL

## Actions (in order)

1. **Receive Text and URL from Share Sheet**
2. **Get Text from Shortcut Input** → stored as `Selection`
3. **Split Text** `Selection` by "Spaces" → stored as `Words`
4. **Choose from List** `Words` → prompt "Which word?" → stored as `Word`
5. **Text** action with your Worker URL → stored as `BaseURL`
6. **Text** action with your bearer token → stored as `Token`
7. **Dictionary** action — build the JSON body:
   ```
   {
     "word": <Word>,
     "context": <Selection>,
     "source": "phone-reading",
     "source_detail": <Shortcut Input URL>
   }
   ```
8. **Get Contents of URL**:
   - URL: `<BaseURL>/capture`
   - Method: POST
   - Headers:
     - `Authorization`: `Bearer <Token>`
     - `Content-Type`: `application/json`
   - Request Body: JSON (from step 7)
9. **Get Dictionary Value** `success` from response
10. **If** `success = true`:
    - **Show Notification** "Saved ✓"
    - Else: **Show Notification** with `error` field, color red
