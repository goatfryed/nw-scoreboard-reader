import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';

interface CropConfig {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export async function cropAndStitchFrames(
  framePaths: string[],
  outputPath: string
): Promise<string> {
  if (framePaths.length === 0) {
    throw new Error('No frames provided for stitching.');
  }

  const cropConfig = getCropConfig();
  console.log('Stitching with crop config from dotenv:', cropConfig);

  // Read metadata from the first frame to get base dimensions
  const metadata = await sharp(framePaths[0]).metadata();
  const origWidth = metadata.width || 0;
  const origHeight = metadata.height || 0;

  const cropLeft = cropConfig.left;
  const cropTop = cropConfig.top;
  const cropWidth = cropConfig.right - cropConfig.left;
  const cropHeight = cropConfig.bottom - cropConfig.top;

  if (cropWidth <= 0 || cropHeight <= 0) {
    throw new Error(
      `Invalid crop coordinates: Left: ${cropConfig.left}, Right: ${cropConfig.right}, Top: ${cropConfig.top}, Bottom: ${cropConfig.bottom}`
    );
  }

  console.log(`Cropping each frame to: ${cropWidth}x${cropHeight}`);

  // 1. Pre-crop all frames and generate low-res grayscale comparison buffers
  const frames: { originalBuffer: Buffer; searchBuffer: Buffer }[] = [];
  const searchWidth = 64; // Optimize comparison width

  for (let i = 0; i < framePaths.length; i++) {
    const framePath = framePaths[i];
    // Crop frame at original resolution
    const croppedBuffer = await sharp(framePath)
      .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
      .png()
      .toBuffer();

    // Create a small grayscale version for fast SAD alignment search
    const searchBuffer = await sharp(croppedBuffer)
      .resize({ width: searchWidth, height: cropHeight, fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer();

    frames.push({ originalBuffer: croppedBuffer, searchBuffer });
  }

  // 2. Align consecutive frames and build composite instructions
  // Start with the first frame
  let compositeHeight = cropHeight;
  const composites: { input: Buffer; top: number; left: number }[] = [
    { input: frames[0].originalBuffer, top: 0, left: 0 }
  ];

  // We set a MAD threshold of 25.0 to detect if consecutive frames actually match.
  // If they don't, we assume it's a scene change or non-scrolling overlay.
  const MAD_THRESHOLD = 25.0;

  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1];
    const curr = frames[i];

    const { dy, mad } = findBestOffset(
      prev.searchBuffer,
      curr.searchBuffer,
      searchWidth,
      cropHeight
    );

    console.log(`Frame ${i - 1} -> ${i}: Optimal offset dy = ${dy} pixels (MAD = ${mad.toFixed(2)})`);

    if (mad > MAD_THRESHOLD) {
      console.log(`  MAD exceeds threshold (${mad.toFixed(2)} > ${MAD_THRESHOLD}). Skipping or treating as non-overlapping.`);
      continue;
    }

    if (dy === 0) {
      console.log(`  No scroll movement detected (dy = 0). Skipping duplicate frame.`);
      continue;
    }

    // Slice the unique new content at the bottom of the current frame
    // The top part of height (cropHeight - dy) is identical to the bottom of the previous frame.
    // The bottom part of height dy is new.
    const newContentSlice = await sharp(curr.originalBuffer)
      .extract({ left: 0, top: cropHeight - dy, width: cropWidth, height: dy })
      .toBuffer();

    // Add to composites at the bottom
    composites.push({
      input: newContentSlice,
      top: compositeHeight,
      left: 0
    });

    compositeHeight += dy;
  }

  // 3. Render the final stitched image
  console.log(`Rendering final stitched image: ${cropWidth}x${compositeHeight}`);
  
  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  await sharp({
    create: {
      width: cropWidth,
      height: compositeHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 }
    }
  })
    .composite(composites)
    .toFile(outputPath);

  console.log(`Stitched image successfully saved to ${outputPath}`);
  return outputPath;
}

function getCropConfig(): CropConfig {
  return {
    top: parseInt(process.env.CROP_TOP || '0', 10),
    bottom: parseInt(process.env.CROP_BOTTOM || '0', 10),
    left: parseInt(process.env.CROP_LEFT || '0', 10),
    right: parseInt(process.env.CROP_RIGHT || '0', 10),
  };
}

function findBestOffset(
  buf1: Buffer,
  buf2: Buffer,
  width: number,
  height: number
): { dy: number; mad: number } {
  let bestDy = 0;
  let minMad = Infinity;

  // Search dy from 0 up to 90% of the frame height to ensure sufficient overlap
  const maxSearch = Math.floor(height * 0.9);

  for (let dy = 0; dy < maxSearch; dy++) {
    const mad = calculateMAD(buf1, buf2, width, height, dy);
    if (mad < minMad) {
      minMad = mad;
      bestDy = dy;
    }
  }

  return { dy: bestDy, mad: minMad };
}

/**
 * Calculates the Mean Absolute Difference (MAD) between two 1-channel (grayscale) buffers
 * at a given vertical offset (dy).
 * 
 * dy > 0 represents content moving upwards (scroll down).
 * buf1 is the previous frame, buf2 is the current frame.
 * We match buf2[y] with buf1[y + dy].
 */
function calculateMAD(
  buf1: Buffer,
  buf2: Buffer,
  width: number,
  height: number,
  dy: number
): number {
  const overlapHeight = height - dy;
  let diff = 0;
  
  for (let y = 0; y < overlapHeight; y++) {
    const idx1 = (y + dy) * width;
    const idx2 = y * width;
    for (let x = 0; x < width; x++) {
      diff += Math.abs(buf1[idx1 + x] - buf2[idx2 + x]);
    }
  }
  
  return diff / (width * overlapHeight);
}
