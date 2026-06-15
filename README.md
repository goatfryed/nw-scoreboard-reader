# New World Scoreboard Reader

A CLI tool to download Twitch clips, extract scrolling scoreboard frames, vertically stitch them into a single high-resolution image, and run OCR to export the parsed player statistics to a CSV file.

## Features

- **Twitch Clip Downloader**: Directly queries Twitch's GQL API to obtain authorized playback tokens, downloading the clip `.mp4` without requiring a headless browser.
- **FFmpeg Frame Extractor**: Samples video frames sequentially at a configurable frame rate.
- **Overlap-Erasure Stitcher**: Crops scoreboard boundaries and matches overlapping content using a grayscale Mean Absolute Difference (MAD) algorithm to compose a single unified scrolling screenshot.
- **In-Memory Image Preprocessing & OCR**:
  - Scales and binarizes text using custom threshold settings.
  - Erases player icon columns in-memory to prevent OCR character recognition noise.
  - Cleans up trailing tilde characters (`~`) and common OCR spelling issues automatically.
- **Cascading Configurations**: Dynamically prioritizes `.env.local` -> `.env.$MODE` (streamer-specific resolution profiles) -> global `.env` configuration.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v20+)
- [pnpm](https://pnpm.io/)
- [FFmpeg](https://ffmpeg.org/) (installed and available on your system's PATH)

### Installation

1. Install dependencies:
   ```bash
   pnpm install
   ```

### Configuration

Create a `.env` file (or a resolution-specific config like `.env.opr1920`) specifying crop coordinates, frame rates, and masking parameters:

```env
# Twitch API credentials
TWITCH_CLIENT_ID=your_twitch_client_id_here

# Scoreboard cropping configuration
CROP_TOP=360
CROP_BOTTOM=854
CROP_LEFT=710
CROP_RIGHT=1672

# Frame sample rate
FPS=2

# Match format (opr or war)
GAME_TYPE=opr

# Player icon erasure mask (absolute x coordinates relative to the original frame)
ERASE_LEFT=800
ERASE_RIGHT=845

# Google Sheets Append option
GOOGLE_SHEETS_APPEND=false
```

### Usage

Run the pipeline by passing a Twitch clip URL:

```bash
pnpm start https://www.twitch.tv/goatfryed/clip/FancyBoxyGorillaCharlieBitMe-_sP2n_BFm8cLvTZ2
```

Options:
- `-m, --mode <name>`: Load resolution-specific environment file `.env.<name>` (defaults to `opr1920`).
- `--append`: Append rows to Google Sheet instead of replacing (can also set `GOOGLE_SHEETS_APPEND=true` in environment).
- `--game-type <opr|war>`: Format target columns dynamically.
- `--output <path>`: Custom path to save the stitched image.
- `--csv <path>`: Custom path to save the extracted scoreboard.

