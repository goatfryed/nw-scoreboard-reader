# Implementation Plan - Scoreboard Reader

This plan outlines the design and implementation steps for building the remaining phases of the scoreboard reader tool, focusing on the CLI command refactoring.

## Proposed Changes

### CLI Integration

We will reorganize the CLI commands in [src/index.ts](file:///home/goatfryed/com.github/goatfryed/nw-scoreboard-reader/src/index.ts):

1. **Root-Level Default Command**:
   - Usage: `pnpm start <clip-url>` (or `npx ts-node src/index.ts <clip-url>`)
   - If a URL is passed directly without any subcommand, execute the full pipeline:
     - Download the clip to `.tmp/clip.mp4`.
     - Parse the downloaded video to `.tmp/scoreboard.csv` (using default options).
     - Upload the resulting CSV to Google Sheets.

2. **Subcommands**:
   - **`clip <clip-url>`**:
     - Downloads the Twitch clip.
     - Option `-o, --output <path>`: Destination path (default: `.tmp/clip.mp4`).
   - **`parse`**:
     - Extracts frames, stitches them, and performs OCR/CSV extraction.
     - Option `-i, --input <path>`: Path to the downloaded video (default: `.tmp/clip.mp4`).
     - Option `-o, --output <path>`: Path to the stitched image output (default: `.tmp/stitched.png`).
     - Option `--csv <path>`: CSV file path output (default: `.tmp/scoreboard.csv` or `CSV_PATH`).
     - Option `--fps <number>`, `--game-type <type>`, `--screen <name>`.
   - **`upload`**:
     - Uploads CSV data to Google Sheets.
     - Option `--csv <path>`: Path to the CSV file to upload (default: `.tmp/scoreboard.csv` or `CSV_PATH`).

---

### Phase 5: Dashboard Screenshotting
1. Launch Playwright headless browser.
2. Navigate to the dashboard, wait for it to load, and capture a screenshot.
3. Upload the dashboard screenshot and the stitched scoreboard image to Google Drive.

---

## Verification Plan

### Manual Verification
1. Run the full pipeline via root command:
   ```bash
   pnpm start "https://www.twitch.tv/goatfryed/clip/FancyBoxyGorillaCharlieBitMe-_sP2n_BFm8cLvTZ2"
   ```
   Verify that it downloads, parses, and uploads to Google Sheets.
2. Run individual commands:
   ```bash
   pnpm start clip "https://www.twitch.tv/goatfryed/clip/FancyBoxyGorillaCharlieBitMe-_sP2n_BFm8cLvTZ2"
   pnpm start parse
   GOOGLE_APPLICATION_CREDENTIALS=./credentials.json pnpm start upload
   ```
   Verify that each step operates correctly using its default parameters.
