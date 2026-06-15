import * as path from 'path';
import * as fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';

export async function extractFrames(
  videoPath: string,
  outputDir: string,
  fps: number = 2
): Promise<string[]> {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    console.log(`Extracting frames from ${videoPath} at ${fps} FPS...`);
    
    ffmpeg(videoPath)
      .outputOptions([
        `-vf fps=${fps}`
      ])
      .output(path.join(outputDir, 'frame-%04d.png'))
      .on('end', () => {
        fs.readdir(outputDir, (err, files) => {
          if (err) {
            return reject(err);
          }
          const frameFiles = files
            .filter((f) => f.startsWith('frame-') && f.endsWith('.png'))
            .sort()
            .map((f) => path.join(outputDir, f));
          
          console.log(`Successfully extracted ${frameFiles.length} frames.`);
          resolve(frameFiles);
        });
      })
      .on('error', (err) => {
        console.error('Error during frame extraction:', err);
        reject(err);
      })
      .run();
  });
}
