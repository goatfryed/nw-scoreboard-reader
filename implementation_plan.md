# Implementation Plan - Scoreboard Reader

This plan outlines the design and implementation steps for building the CLI tool to download Twitch clips, extract frames, and stitch the scoreboard scroll together into one large image.

## Open Questions

> [!IMPORTANT]
> 1. **Scoreboard Crop Coordinates**: The scoreboard coordinates on screen can vary by video resolution (e.g., 1080p vs. 1440p). Should the CLI use a default crop area (e.g., optimized for 1080p) and allow custom coordinates via CLI options (e.g., `--crop-top`, `--crop-bottom`, `--crop-left`, `--crop-right`)?
> 2. **Scroll Direction & Speed**: We assume a top-to-bottom scroll of the scoreboard. The SAD vertical template matching will find the vertical offset ($dy$) per frame. Is there any horizontal shifting or is it strictly vertical? (We assume strictly vertical).

## Proposed Changes

### CLI Interface (`src/index.ts`)
- Update CLI to accept a Twitch clip URL and output path/options.
- Usage: `npx ts-node src/index.ts <twitch-clip-url> [options]`
- Options:
  - `--output -o <path>`: Stitched image output path (default: `output/stitched.png`).
  - `--fps <number>`: Frame extraction rate (default: 2 fps).
  - `--crop <top,bottom,left,right>`: Crop coordinates (default: 1080p center scoreboard area).

### Twitch Clip Downloader (`src/twitch.ts`) [NEW]
- Fetch direct video source `.mp4` using Twitch's GraphQL API (`https://gql.twitch.tv/gql` with query `Clip` and the static Client-ID: `kimne78kx3ncx6brgo4mv6wki5h1ko`).
- Avoids the overhead of launching a Playwright headless browser instance.
- Download the `.mp4` video directly to a temporary workspace.

### Frame Extractor (`src/ffmpeg.ts`) [NEW]
- Use `fluent-ffmpeg` to extract frames at the specified FPS from the downloaded video into a temp directory.

### Image Stitcher (`src/stitch.ts`) [NEW]
- Read extracted frames using `sharp`.
- Crop each frame to the scrolling scoreboard body area (removing static headers and overlays).
- Stitch the cropped frames:
  - For consecutive frames $F_i$ and $F_{i+1}$, calculate the Sum of Absolute Differences (SAD) for vertical offsets $dy$ in a search range.
  - Find the $dy$ that minimizes SAD (this represents the scroll speed/offset).
  - Stitch the unique bottom portion of $F_{i+1}$ to the running composite image.
- Save the final stitched image to the specified output path.

### Phase 4: Google Sheets Integration
1. Authenticate with the Google Sheets API using a Service Account credential file.
2. Append the structured scoreboard data to the target Google Sheet.

### Phase 5: Dashboard Screenshotting
1. Launch Playwright headless browser.
2. Navigate to the dashboard, wait for it to load, and capture a screenshot.
3. Upload the dashboard screenshot and the stitched scoreboard image to Google Drive.

### Phase 6: Integration & Cleanup
1. Wrap all steps in a single CLI command (`npm start <twitch-clip-url>`).
2. Clean up temporary files (videos and raw frames) post-run.

---

## Verification Plan

### Manual Verification
1. Run CLI with a sample Twitch clip:
   ```bash
   npx ts-node src/index.ts "https://clips.twitch.tv/SampleClipId" -o output/test.png
   ```
2. Verify that the output image is a single, clean, stitched scoreboard.


