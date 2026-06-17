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
- **Upload to gooogle sheets**: Push the extracted csv to a google sheet. Requires `service account and credentials.json`

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

Create a `config.{mode}.json` file specifying crop coordinates, frame rates, and other parameters. Compare `config.opr1920.json` and `config.zoo2560.json` to see how to configure for different resolutions.

### Usage

Run the pipeline by passing a Twitch clip URL:

```bash
pnpm start https://www.twitch.tv/goatfryed/clip/FancyBoxyGorillaCharlieBitMe-_sP2n_BFm8cLvTZ2
```

For more Details and plumbing commands see

```bash
pnpm start --help
```


