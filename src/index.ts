import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import * as crypto from 'crypto';
import { Command } from 'commander';
import { downloadClip } from './twitch';
import { runScoreboardParsing } from './scoreparser';
import { uploadCsvToGoogleSheets, captureSpreadsheetScreenshot } from './sheets';
import { configManager } from './config';

function getModeArg(): string {
  for (let i = 0; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if ((arg === '--mode' || arg === '-m') && i + 1 < process.argv.length) {
      return process.argv[i + 1];
    }
    if (arg.startsWith('--mode=')) {
      return arg.substring(7);
    }
  }
  return 'opr1920';
}

function extractClipHash(clipUrl: string): string {
  let slug = clipUrl;
  try {
    const urlObj = new URL(clipUrl);
    const pathname = urlObj.pathname;
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length > 0) {
      slug = segments[segments.length - 1];
    }
  } catch (e) {
    // Not a valid URL, treat clipUrl itself as the slug
  }

  const firstHyphenIndex = slug.indexOf('-');
  if (firstHyphenIndex !== -1) {
    return slug.substring(firstHyphenIndex + 1);
  }
  return slug;
}

function generateRandomHash(): string {
  return crypto.randomBytes(4).toString('hex');
}

const mode = getModeArg();
dotenv.config({ path: '.env.local' });
dotenv.config({ path: `.env.${mode}` });
dotenv.config({ path: '.env' });
configManager.loadConfig(mode);

const program = new Command();

program
  .name('nw-scoreboard-reader')
  .description('CLI tool to extract scoreboard data from Twitch clips')
  .version('1.0.0');

program
  .argument('<clip-url>', 'Twitch clip URL to process in a single piped run')
  .option('-m, --mode <name>', 'Mode settings to load from .env.$MODE', 'opr1920')
  .option('--append', 'Append rows to Google Sheet instead of replacing')
  .option('--match-id <id>', 'Specify a custom match ID')
  .action(async (clipUrl: string, options: { mode: string; append: boolean; matchId?: string }) => {
    const startTime = new Date();
    try {
      configManager.loadConfig(options.mode);
      if (options.append !== undefined) {
        configManager.updateConfig({
          upload: {
            ...configManager.getConfig().upload,
            append: options.append,
          }
        });
      }

      const matchId = options.matchId || extractClipHash(clipUrl);

      console.log("NW Scoreboard Reader CLI - Full Pipeline");
      console.log("---------------------------------------");
      console.log(`Clip URL: ${clipUrl}`);
      console.log(`Match ID: ${matchId}`);
      console.log(`Mode:     ${options.mode}`);
      console.log(`Append:   ${configManager.getConfig().upload.append}`);

      const defaultVideoPath = '.tmp/clip.mp4';
      const defaultStitchedPath = '.tmp/stitched.png';
      const defaultCsvPath = process.env.CSV_PATH || '.tmp/scoreboard.csv';
      const defaultFps = process.env.FPS || '2';

      console.log(`\n[1/3] Downloading clip...`);
      const tempDir = path.join(process.cwd(), '.tmp');
      if (fs.existsSync(tempDir)) {
        for (const file of fs.readdirSync(tempDir)) {
          const filePath = path.join(tempDir, file);
          if (file.endsWith('.mp4') || file === 'frames') {
            fs.rmSync(filePath, { recursive: true, force: true });
          }
        }
      } else {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const downloadedPath = await downloadClip(clipUrl, tempDir);
      if (downloadedPath !== defaultVideoPath) {
        if (fs.existsSync(defaultVideoPath)) {
          fs.unlinkSync(defaultVideoPath);
        }
        fs.renameSync(downloadedPath, defaultVideoPath);
      }

      console.log(`\n[2/3] Extracting and stitching frames...`);
      const framesDir = path.join(tempDir, 'frames');
      if (fs.existsSync(framesDir)) {
        fs.rmSync(framesDir, { recursive: true, force: true });
      }

      console.log(`\n[2/3] Extracting, stitching, and parsing scoreboard frames...`);
      await runScoreboardParsing(defaultVideoPath, defaultStitchedPath, defaultCsvPath, parseInt(defaultFps, 10), undefined, matchId);

      console.log(`\n[3/3] Uploading CSV to Google Sheets...`);
      await uploadCsvToGoogleSheets(defaultCsvPath, configManager.getConfig());

      console.log("\nPipeline execution complete!");
    } catch (err) {
      console.error("Pipeline failed:", err);
      process.exit(1);
    }
  });

// Subcommand: clip
program
  .command('clip')
  .description('Download Twitch clip by URL')
  .argument('<clip-url>', 'Twitch clip URL (e.g. https://clips.twitch.tv/...)')
  .option('-o, --output <path>', 'Output video path', '.tmp/clip.mp4')
  .option('-m, --mode <name>', 'Mode settings to load from .env.$MODE', 'opr1920')
  .action(async (clipUrl: string, options: { output: string; mode: string }) => {
    try {
      configManager.loadConfig(options.mode);
      console.log("NW Scoreboard Reader CLI - Clip Download");
      console.log("----------------------------------------");
      console.log(`Clip URL: ${clipUrl}`);
      console.log(`Output:   ${options.output}`);

      const destDir = path.dirname(options.output);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      const tempDir = path.join(process.cwd(), '.tmp');
      const downloadedPath = await downloadClip(clipUrl, tempDir);

      if (downloadedPath !== options.output) {
        if (fs.existsSync(options.output)) {
          fs.unlinkSync(options.output);
        }
        fs.renameSync(downloadedPath, options.output);
      }
      console.log(`Download complete: ${options.output}`);
    } catch (err) {
      console.error("Clip download failed:", err);
      process.exit(1);
    }
  });

// Subcommand: parse
program
  .command('parse')
  .description('Extract frames, stitch scoreboard, and run OCR to CSV')
  .option('-i, --input <path>', 'Input video path', '.tmp/clip.mp4')
  .option('-o, --output <path>', 'Stitched image output path', '.tmp/stitched.png')
  .option('--csv <path>', 'Output CSV file path', process.env.CSV_PATH || '.tmp/scoreboard.csv')
  .option('--fps <number>', 'Frame extraction rate per second', process.env.FPS || '2')
  .option('-m, --mode <name>', 'Mode settings to load from .env.$MODE', 'opr1920')
  .option('--match-id <id>', 'Specify a custom match ID (if omitted, a random 8-character hash will be generated)')
  .action(async (options: { input: string; output: string; csv: string; fps: string; mode: string; matchId?: string }) => {
    const startTime = new Date();
    try {
      configManager.loadConfig(options.mode);

      const matchId = options.matchId || generateRandomHash();

      console.log("NW Scoreboard Reader CLI - Parse & OCR");
      console.log("--------------------------------------");
      console.log(`Input Video: ${options.input}`);
      console.log(`Output Image: ${options.output}`);
      console.log(`CSV Output:   ${options.csv}`);
      console.log(`FPS:          ${options.fps}`);
      console.log(`Column Names: ${configManager.getConfig().columnNames.join(', ')}`);
      console.log(`Mode:         ${options.mode}`);
      console.log(`Match ID:     ${matchId}`);

      if (!fs.existsSync(options.input)) {
        throw new Error(`Input video file not found at: ${options.input}`);
      }

      const tempDir = path.join(process.cwd(), '.tmp');
      const framesDir = path.join(tempDir, 'frames');
      if (fs.existsSync(framesDir)) {
        fs.rmSync(framesDir, { recursive: true, force: true });
      }

      await runScoreboardParsing(options.input, options.output, options.csv, parseInt(options.fps, 10), undefined, matchId);
      console.log("OCR and CSV extraction completed!");
    } catch (err) {
      console.error("Parsing failed:", err);
      process.exit(1);
    }
  });

// Subcommand: upload
program
  .command('upload')
  .description('Upload scoreboard CSV data to Google Sheets')
  .option('--csv <path>', 'CSV file path to upload', process.env.CSV_PATH || '.tmp/scoreboard.csv')
  .option('--append', 'Append rows to Google Sheet instead of replacing')
  .option('-m, --mode <name>', 'Mode settings to load from .env.$MODE', 'opr1920')
  .action(async (options: { csv: string; append: boolean; mode: string }) => {
    try {
      configManager.loadConfig(options.mode);
      if (options.append !== undefined) {
        configManager.updateConfig({
          upload: {
            ...configManager.getConfig().upload,
            append: options.append,
          }
        });
      }

      console.log("NW Scoreboard Reader CLI - Google Sheets Upload");
      console.log("-----------------------------------------------");
      console.log(`CSV Path: ${options.csv}`);
      console.log(`Append:   ${configManager.getConfig().upload.append}`);
      await uploadCsvToGoogleSheets(options.csv, configManager.getConfig());
    } catch (err) {
      console.error("Upload failed:", err);
      process.exit(1);
    }
  });

// Subcommand: screenshot
program
  .command('screenshot')
  .description('Take a screenshot of a specific Google Sheets region')
  .option('-o, --output <path>', 'Output screenshot path', '.tmp/spreadsheet.png')
  .option('-m, --mode <name>', 'Mode settings to load from .env.$MODE', 'opr1920')
  .action(async (options: { output: string; mode: string }) => {
    try {
      configManager.loadConfig(options.mode);

      console.log("NW Scoreboard Reader CLI - Spreadsheet Screenshot");
      console.log("-----------------------------------------------");
      console.log(`Output Path: ${options.output}`);
      await captureSpreadsheetScreenshot(options.output, configManager.getConfig());
    } catch (err) {
      console.error("Screenshot failed:", err);
      process.exit(1);
    }
  });

program.parse(process.argv);

