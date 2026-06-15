import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { Command } from 'commander';
import { downloadClip } from './twitch';
import { extractFrames } from './ffmpeg';
import { cropAndStitchFrames } from './stitch';

dotenv.config();


const program = new Command();

program
  .name('nw-scoreboard-reader')
  .description('CLI tool to extract scoreboard data from Twitch clips')
  .version('1.0.0')
  .argument('<clip-url>', 'Twitch clip URL (e.g. https://clips.twitch.tv/...)')
  .option('-o, --output <path>', 'Stitched image output path', '.tmp/stitched.png')
  .option('--fps <number>', 'Frame extraction rate per second', process.env.FPS || '2')
  .action(async (clipUrl: string, options: { output: string; fps: string }) => {
    try {
      console.log("NW Scoreboard Reader CLI");
      console.log("------------------------");
      console.log(`Clip URL: ${clipUrl}`);
      console.log(`Output:   ${options.output}`);
      console.log(`FPS:      ${options.fps}`);

      const tempDir = path.join(process.cwd(), '.tmp');
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
    } catch (err) {
      console.error("Fatal error:", err);
      process.exit(1);
    }
  });

program.parse(process.argv);




