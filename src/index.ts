import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { Command } from 'commander';
import { downloadClip } from './twitch';
import { extractFrames } from './ffmpeg';
import { cropAndStitchFrames } from './stitch';
import { extractScoreboardToCsv } from './ocr';
import { uploadCsvToGoogleSheets } from './sheets';

function getScreenArg(): string {
  for (let i = 0; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--screen' && i + 1 < process.argv.length) {
      return process.argv[i + 1];
    }
    if (arg.startsWith('--screen=')) {
      return arg.substring(9);
    }
  }
  return '1920x1080';
}

const screen = getScreenArg();
dotenv.config({ path: '.env.local' });
dotenv.config({ path: `.env.${screen}` });
dotenv.config({ path: '.env' });

const program = new Command();

program
  .name('nw-scoreboard-reader')
  .description('CLI tool to extract scoreboard data from Twitch clips')
  .version('1.0.0');

// Root command (runs the entire pipeline)
program
  .argument('<clip-url>', 'Twitch clip URL to process in a single piped run')
  .action(async (clipUrl: string) => {
    try {
      console.log("NW Scoreboard Reader CLI - Full Pipeline");
      console.log("---------------------------------------");
      console.log(`Clip URL: ${clipUrl}`);

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

      const frames = await extractFrames(defaultVideoPath, framesDir, parseInt(defaultFps, 10));
      console.log(`Extracted ${frames.length} frames.`);

      console.log(`Stitching frames into ${defaultStitchedPath}...`);
      await cropAndStitchFrames(frames, defaultStitchedPath);

      console.log(`Extracting OCR data to ${defaultCsvPath}...`);
      await extractScoreboardToCsv(defaultStitchedPath, defaultCsvPath);

      console.log(`\n[3/3] Uploading CSV to Google Sheets...`);
      await uploadCsvToGoogleSheets(defaultCsvPath);

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
  .action(async (clipUrl: string, options: { output: string }) => {
    try {
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
  .option('--game-type <type>', 'Game type format: opr or war', process.env.GAME_TYPE || 'opr')
  .option('--screen <name>', 'Screen settings to load from .env.$SCREEN', '1920x1080')
  .action(async (options: { input: string; output: string; csv: string; fps: string; gameType: string; screen: string }) => {
    try {
      process.env.GAME_TYPE = options.gameType;

      console.log("NW Scoreboard Reader CLI - Parse & OCR");
      console.log("--------------------------------------");
      console.log(`Input Video: ${options.input}`);
      console.log(`Output Image: ${options.output}`);
      console.log(`CSV Output:   ${options.csv}`);
      console.log(`FPS:          ${options.fps}`);
      console.log(`Game Type:    ${options.gameType}`);
      console.log(`Screen:       ${options.screen}`);

      if (!fs.existsSync(options.input)) {
        throw new Error(`Input video file not found at: ${options.input}`);
      }

      const tempDir = path.join(process.cwd(), '.tmp');
      const framesDir = path.join(tempDir, 'frames');
      if (fs.existsSync(framesDir)) {
        fs.rmSync(framesDir, { recursive: true, force: true });
      }

      const frames = await extractFrames(options.input, framesDir, parseInt(options.fps, 10));
      console.log(`Extracted ${frames.length} frames.`);

      console.log(`Stitching frames into ${options.output}...`);
      await cropAndStitchFrames(frames, options.output);
      console.log("Stitching completed!");

      console.log(`Extracting OCR data to ${options.csv}...`);
      await extractScoreboardToCsv(options.output, options.csv);
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
  .action(async (options: { csv: string }) => {
    try {
      console.log("NW Scoreboard Reader CLI - Google Sheets Upload");
      console.log("-----------------------------------------------");
      console.log(`CSV Path: ${options.csv}`);
      await uploadCsvToGoogleSheets(options.csv);
    } catch (err) {
      console.error("Upload failed:", err);
      process.exit(1);
    }
  });

program.parse(process.argv);
