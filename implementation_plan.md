# Implementation Plan - Scoreboard Reader

This plan outlines the design and implementation steps for building the remaining phases of the scoreboard reader tool, including the new "Side" color extraction feature.

## Proposed Changes

### OCR & CSV Extraction (`src/ocr.ts`)

We will add team/side color detection by sampling background pixels at the y-coordinate of each parsed player row.

#### Logic & Helpers
1. **Line Coordinates from OCR**:
   - Update `performOCR` to return both raw text and a list of parsed lines containing their vertical center coordinate (`yCenter`) extracted from Tesseract's bounding boxes (`bbox`).
2. **Dependency**:
   - Install `color-convert` package to handle color space conversion: `pnpm add color-convert`.
3. **Color Detection (`detectSideColor`)**:
   - Read the original color stitched image raw pixel buffer using `sharp`.
   - For each line's `yCenter` (mapped back to the original image scale), sample a 10x10px rectangle at the end of the row:
     - X-range: `[width - 20, width - 10]` (leaving a 10px padding to the right edge).
     - Y-range: `[yCenter - 5, yCenter + 5]` (centered on the line's vertical center).
   - Average the RGB values in this 10x10px block.
   - Match the average Hue to predefined ranges:
     - **Red**: `H >= 325` or `H < 20`
     - **Orange**: `20 <= H < 50`
     - **Green**: `75 <= H < 160`
     - **Blue**: `170 <= H < 255`
     - **Purple**: `255 <= H < 325`
4. **Data Structure & CSV Export**:
   - Add a `side` field to `ScoreboardRow`.
   - Update `writeToCsv` to include the "Side" column as the first column in the CSV.

---

### Phase 4: Google Sheets Integration (Upload Command)
- Already implemented: parses CSV lines dynamically and pushes all columns to the sheet.

### Phase 5: Dashboard Screenshotting
1. Launch Playwright headless browser.
2. Navigate to the dashboard, wait for it to load, and capture a screenshot.
3. Upload the dashboard screenshot and the stitched scoreboard image to Google Drive.

---

## Verification Plan

### Manual Verification
1. Run CLI with the sample clip:
   ```bash
   pnpm start "https://www.twitch.tv/goatfryed/clip/FancyBoxyGorillaCharlieBitMe-_sP2n_BFm8cLvTZ2"
   ```
2. Verify that the output CSV starts with a `Side` column matching the player's team background color (red, blue, etc.) for each row.
3. Run the Sheets upload command:
   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=./credentials.json pnpm start upload
   ```
4. Verify that the data is cleanly updated in Google Sheets including the `Side` column.
