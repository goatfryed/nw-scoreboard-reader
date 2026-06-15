import * as path from 'path';
import * as dotenv from 'dotenv';
import { Command } from 'commander';
import { downloadClip } from './twitch';

dotenv.config();

const program = new Command();

program
  .name('nw-scoreboard-reader')
  .description('CLI tool to extract scoreboard data from Twitch clips')
  .version('1.0.0')
  .argument('<clip-url>', 'Twitch clip URL (e.g. https://clips.twitch.tv/...)')
  .option('-o, --output <path>', 'Stitched image output path', 'output/stitched.png')
  .option('--fps <number>', 'Frame extraction rate per second', '2')
  .option('--crop <coords>', 'Scoreboard crop area (top,bottom,left,right)')
  .action(async (clipUrl: string, options: { output: string; fps: string; crop?: string }) => {
    try {
      console.log("NW Scoreboard Reader CLI");
      console.log("------------------------");
      console.log(`Clip URL: ${clipUrl}`);
      console.log(`Output:   ${options.output}`);
      console.log(`FPS:      ${options.fps}`);
      if (options.crop) {
        console.log(`Crop:     ${options.crop}`);
      }

      const tempDir = path.join(process.cwd(), '.tmp');
      console.log(`Starting processing for clip...`);
      
      const downloadedPath = await downloadClip(clipUrl, tempDir);
      console.log(`Video successfully downloaded to: ${downloadedPath}`);
    } catch (err) {
      console.error("Fatal error:", err);
      process.exit(1);
    }
  });

program.parse(process.argv);



