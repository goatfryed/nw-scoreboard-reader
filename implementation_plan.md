# Implementation Plan - Scoreboard Reader

This plan outlines the design and implementation steps for building the new `screenshot` command to capture a specific region of a Google Sheet using your existing Google Service Account.

## Proposed Design (Service Account + Local Render)

To avoid Google Account browser login walls and CAPTCHAs, we will use your service account credentials:
1. **Fetch Access Token**: Use the Google Auth library (reusing `credentials.json`) to obtain an OAuth2 access token.
2. **Export Sheet as HTML**: Fetch the specific sheet region (`A1:Q83`) using Google's export endpoint:
   `https://docs.google.com/spreadsheets/d/<spreadsheet-id>/export?format=html&gid=<gid>&range=A1:Q83`
   passing the access token in the Authorization header.
3. **Local Playwright Render**: Save the HTML to a temporary file, load it in Playwright via `file://` protocol, and capture a full-page screenshot of the grid table.

## Proposed Changes

### CLI & Configuration

#### [MODIFY] [.env](file:///home/goatfryed/com.github/goatfryed/nw-scoreboard-reader/.env)
Add configuration variables for the screenshot command:
```env
GOOGLE_SHEETS_SCREENSHOT_GID=0
GOOGLE_SHEETS_SCREENSHOT_RANGE=A1:Q83
```

#### [MODIFY] [src/index.ts](file:///home/goatfryed/com.github/goatfryed/nw-scoreboard-reader/src/index.ts)
Add the `screenshot` subcommand to commander:
- Usage: `pnpm start screenshot`
- Options:
  - `-o, --output <path>`: Destination path for the screenshot (default: `.tmp/spreadsheet.png`).
  - `--screen <name>`: Screen config.

### Screenshot Logic

#### [NEW] [src/screenshot.ts](file:///home/goatfryed/com.github/goatfryed/nw-scoreboard-reader/src/screenshot.ts)
Implement the fetch and screenshot logic:
- Export function `captureSpreadsheetScreenshot(outputPath: string): Promise<void>`:
  1. Retrieve Google Auth client from `google.auth.GoogleAuth`.
  2. Call `client.getAccessToken()` to get a token.
  3. Fetch the HTML export endpoint using the token.
  4. Write the HTML response to `.tmp/sheet.html`.
  5. Launch Playwright headlessly, navigate to the local file, set viewport size, and capture the screenshot.

---

## Verification Plan

### Manual Verification
1. Run the screenshot command:
   ```bash
   pnpm start screenshot
   ```
2. Verify that:
   - A screenshot is successfully created at `.tmp/spreadsheet.png`.
   - The screenshot shows the range `A1:Q83` rendered beautifully.


