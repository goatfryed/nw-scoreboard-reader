# Implementation Plan - Scoreboard Reader

This plan outlines the design and implementation steps for building the scoreboard reader tool.

## Completed Functionality

The core pipeline is fully implemented:

- **Twitch Clip Downloader**: Bypasses Twitch CloudFront 401 errors by querying the internal GQL API for a clip playback token and signature, downloading the `.mp4` video directly.
- **Frame Extractor**: Samples video frames sequentially at a configurable FPS rate.
- **Scoreboard Stitcher**: Crops scoreboard areas based on `.env` crop coordinates and stitches frames vertically using a fast grayscale Mean Absolute Difference (MAD) alignment search.
- **OCR Text Extraction**:
  - Enhances text legibility using 2x upscaling, color negation (black text on white), and configurable binarization thresholding.
  - Erases player icons using absolute x-coordinate masking (relative to the original frame) to remove OCR noise.
  - Dynamically parses game-type stats (OPR vs. War columns) where Rank, Name, and Score are always the first three columns.
  - Automatically cleans up player names (e.g., stripping trailing `~` characters).
- **CLI & Cleanup Orchestrator**: Triggers all steps sequentially, handles the cleanup of temporary frames/videos, and manages cascading environment loading.
- **Cascading Configurations**: Automatically loads configurations in order of precedence: `.env.local` (local overrides) -> `.env.$SCREEN` (streamer specific resolution profiles, e.g. `.env.1920x1080` by default via `--screen` option) -> standard `.env`.

---

## Proposed Changes (Remaining Phases)

### Phase 4: Google Sheets Integration
1. Authenticate with the Google Sheets API using a Service Account credential file.
2. Append the structured scoreboard data to the target Google Sheet.

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
