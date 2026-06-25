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
pnpm cli https://www.twitch.tv/goatfryed/clip/FancyBoxyGorillaCharlieBitMe-_sP2n_BFm8cLvTZ2
```

For more Details and plumbing commands see

```bash
pnpm cli --help
```

## GitHub Actions Dispatch API

This pipeline can be executed asynchronously using GitHub Actions. You can trigger it programmatically using the GitHub REST API or manually via the GitHub repository interface.

### Programmatic API Execution (curl)

To trigger the full pipeline (clip processing + sheet updates + screenshots):

```bash
curl -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $GITHUB_PAT" \
  https://api.github.com/repos/goatfryed/nw-scoreboard-reader/actions/workflows/parse-clip.yml/dispatches \
  -d '{"ref":"main","inputs":{"clip_url":"https://clips.twitch.tv/FancyBoxyGorillaCharlieBitMe-_sP2n_BFm8cLvTZ2","mode":"<mode>"}}'
```

To run only the spreadsheet screenshot pipeline:

```bash
curl -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $GITHUB_PAT" \
  https://api.github.com/repos/goatfryed/nw-scoreboard-reader/actions/workflows/screenshot.yml/dispatches \
  -d '{"ref":"main","inputs":{"mode":"<mode>"}}'
```

Where `<mode>` matches one of the available config file names (e.g. `opr1920`, `zoo1920`).


### Outputs & Artifacts
The workflow uploads two separate artifact bundles:
- `scoreboard-pipeline-results`: Contains the parsed scoreboard data (`scoreboard.csv`) and the vertically-stitched image (`stitched.png`).
- `spreadsheet-screenshots`: Contains the screenshots generated from the Google Spreadsheet (`spreadsheet*.png`).
