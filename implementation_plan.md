# Implementation Plan - Scoreboard Reader

This plan outlines the design and implementation steps for building the remaining phases of the scoreboard reader tool.

## Proposed Changes

### Phase 4: Google Sheets Integration

We will implement a Google Sheets integration module in [src/sheets.ts](file:///home/goatfryed/com.github/goatfryed/nw-scoreboard-reader/src/sheets.ts).

#### Configuration (.env / .env.local)
- `GOOGLE_APPLICATION_CREDENTIALS`: Path to the service account JSON key file (e.g., `credentials.json`, which must be added to `.gitignore`).
- `GOOGLE_SHEETS_SPREADSHEET_ID`: The target Google Spreadsheet ID.
- `GOOGLE_SHEETS_RANGE`: The target sheet range to replace (e.g., `Sheet1!A2:H`). This clears all rows below the header (row 1) and writes the new scoreboard data.

#### Logic in `src/sheets.ts`
1. **Authentication**: Authenticate using the `google.auth.GoogleAuth` client with the `https://www.googleapis.com/auth/spreadsheets` scope.
2. **Clear Existing Data**: Call `sheets.spreadsheets.values.clear` on the configured range to wipe out previous scoreboard entries while preserving the headers on row 1.
3. **Write New Data**: Call `sheets.spreadsheets.values.update` with the parsed scoreboard rows using `valueInputOption: 'USER_ENTERED'` to format numbers and text correctly in Google Sheets.

#### CLI Integration
- Add a separate `upload` subcommand to the CLI (e.g., `pnpm start upload`).
- This command will:
  - Take an optional `--csv <path>` argument.
  - Fall back to the `CSV_PATH` environment variable or `.tmp/scoreboard.csv` (matching the default of the main command).
  - Read and parse the CSV file.
  - Authenticate and clear/replace the configured range on the Google Sheet.

### Phase 5: Dashboard Screenshotting
1. Launch Playwright headless browser.
2. Navigate to the dashboard, wait for it to load, and capture a screenshot.
3. Upload the dashboard screenshot and the stitched scoreboard image to Google Drive.

---

## Verification Plan

### Manual Verification
1. Run CLI with a sample Twitch clip:
   ```bash
   pnpm start "https://www.twitch.tv/goatfryed/clip/FancyBoxyGorillaCharlieBitMe-_sP2n_BFm8cLvTZ2"
   ```
2. Verify that:
   - Stitched image matches scrolling scoreboard frames perfectly.
   - CSV output cleanly lists ranks, names (without noise/trailing tildes), scores, and stats.
