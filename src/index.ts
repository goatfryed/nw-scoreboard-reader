import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { Command } from 'commander';
import { downloadClip } from './twitch';
import { extractFrames } from './ffmpeg';
import { cropAndStitchFrames } from './stitch';
import { extractScoreboardToCsv } from './ocr';

dotenv.config();

const program = new Command();

program
  .name('nw-scoreboard-reader')
  .description('CLI tool to extract scoreboard data from Twitch clips')
  .version('1.0.0')
  .argument('<clip-url>', 'Twitch clip URL (e.g. https://clips.twitch.tv/...)')
  .option('-o, --output <path>', 'Stitched image output path', '.tmp/stitched.png')
  .option('--csv <path>', 'Output CSV file path', '.tmp/scoreboard.csv')
  .option('--fps <number>', 'Frame extraction rate per second', process.env.FPS || '2')
  .option('--game-type <type>', 'Game type format: opr or war', process.env.GAME_TYPE || 'opr')
  .action(async (clipUrl: string, options: { output: string; csv: string; fps: string; gameType: string }) => {
    try {
      process.env.GAME_TYPE = options.gameType;
      
      console.log("NW Scoreboard Reader CLI");
      console.log("------------------------");
      console.log(`Clip URL:  ${clipUrl}`);
      console.log(`Output:    ${options.output}`);
      console.log(`CSV:       ${options.csv}`);
      console.log(`FPS:       ${options.fps}`);
      console.log(`Game Type: ${options.gameType}`);

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

      console.log(`Starting processing for clip...`);
      
      const downloadedPath = await downloadClip(clipUrl, tempDir);
      console.log(`Video successfully downloaded to: ${downloadedPath}`);

      const framesDir = path.join(tempDir, 'frames');
      if (fs.existsSync(framesDir)) {
        fs.rmSync(framesDir, { recursive: true, force: true });
      }

      const frames = await extractFrames(downloadedPath, framesDir, parseInt(options.fps, 10));
      console.log(`Extracted ${frames.length} frames.`);

      console.log(`Stitching frames into ${options.output}...`);
      await cropAndStitchFrames(frames, options.output);
      console.log("Stitching completed!");

      console.log(`Extracting OCR data to ${options.csv}...`);
      await extractScoreboardToCsv(options.output, options.csv);
      console.log("OCR and CSV extraction completed!");
    } catch (err) {
      console.error("Fatal error:", err);
      process.exit(1);
    }
  });

program.parse(process.argv);




