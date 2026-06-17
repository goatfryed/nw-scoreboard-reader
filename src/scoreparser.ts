import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import convert from 'color-convert';
import { configManager, ReaderOptions } from './config';
import { extractFrames } from './ffmpeg';
import { cropAndStitchFrames } from './stitch';

export { ReaderOptions };


export interface ScoreboardRow {
  side: string;
  rank: string;
  name: string;
  score: string;
  stats: string[];
}

export interface DecoratedRow extends ScoreboardRow {
  date: string;
  win: boolean;
  matchId: string;
}

export interface VictoryInfo {
  victoryBoxColor: string;
  isVictory: boolean;
}

export function cleanPlayerName(name: string): string {
  const trimRegex = /^[.:\-`´'©®™@\s~]+|[.:\-`´'©®™@\s~]+$/gi;
  return name.replace(trimRegex, '').trim();
}

interface OcrLine {
  text: string;
  yCenter: number;
}

/**
 * Filters frames to select only those containing "all", "allies", or "enemies" in the header box.
 */
export async function filterScoreboardFrames(frames: string[]): Promise<string[]> {
  const config = configManager.getConfig();
  const headerBox = config.headerBox;
  if (!headerBox || !headerBox.left || !headerBox.right || !headerBox.top || !headerBox.bottom) {
    console.log('No headerBox configured. Skipping frame filtering.');
    return frames;
  }

  console.log('Filtering frames to select scoreboard views...');
  const hbWidth = headerBox.right - headerBox.left;
  const hbHeight = headerBox.bottom - headerBox.top;

  if (hbWidth <= 0 || hbHeight <= 0) {
    return frames;
  }

  const worker = await createWorker('eng');
  const validFrames: string[] = [];

  for (const framePath of frames) {
    try {
      // Save raw crop-headers.png
      try {
        await sharp(framePath)
          .extract({
            left: headerBox.left,
            top: headerBox.top,
            width: hbWidth,
            height: hbHeight
          })
          .png()
          .toFile(path.join(process.cwd(), '.tmp', 'crop-headers.png'));
      } catch (err) {
        console.error('Failed to write crop-headers.png:', err);
      }

      const croppedBuffer = await sharp(framePath)
        .extract({
          left: headerBox.left,
          top: headerBox.top,
          width: hbWidth,
          height: hbHeight
        })
        .resize({ width: hbWidth * 2, kernel: 'cubic' })
        .grayscale()
        .negate({ alpha: false })
        .threshold(headerBox.threshold ?? configManager.getConfig().threshold ?? 160)
        .withMetadata({ density: 300 })
        .png()
        .toBuffer();

      const tempPath = path.join(process.cwd(), '.tmp', 'ocr-headers.png');
      await fs.promises.writeFile(tempPath, croppedBuffer);

      const { data } = await worker.recognize(tempPath);

      const text = data.text.toLowerCase();
      const isMatch = text.includes('all') || text.includes('allies') || text.includes('enemies') ||
                      text.includes('alli') || text.includes('enem');

      if (isMatch) {
        validFrames.push(framePath);
      } else {
        console.log(`  Frame ${path.basename(framePath)} discarded (header OCR: "${text.trim()}")`);
      }
    } catch (err) {
      console.error(`Error filtering frame ${framePath}:`, err);
    }
  }

  await worker.terminate();
  console.log(`Kept ${validFrames.length} of ${frames.length} frames.`);
  return validFrames;
}

/**
 * Reads the victory box from the initial frame and resolves the winning side color.
 */
export async function parseVictoryInfo(firstFramePath: string): Promise<VictoryInfo> {
  if (!fs.existsSync(firstFramePath)) {
    return { victoryBoxColor: 'unknown', isVictory: true };
  }

  try {
    console.log(`Analyzing victory box from first frame: ${firstFramePath}...`);
    const victoryBox = configManager.getConfig().victoryBox;
    const vbWidth = victoryBox.right - victoryBox.left;
    const vbHeight = victoryBox.bottom - victoryBox.top;
    const vbTopHalfHeight = Math.floor(vbHeight / 2);

    const { data: firstFrameRgb, info: firstFrameInfo } = await sharp(firstFramePath)
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Sample team color from top half
    let sumR = 0, sumG = 0, sumB = 0, count = 0;
    for (let y = victoryBox.top; y < victoryBox.top + vbTopHalfHeight; y++) {
      for (let x = victoryBox.left; x < victoryBox.right; x++) {
        if (y >= 0 && y < firstFrameInfo.height && x >= 0 && x < firstFrameInfo.width) {
          const idx = (y * firstFrameInfo.width + x) * firstFrameInfo.channels;
          sumR += firstFrameRgb[idx];
          sumG += firstFrameRgb[idx + 1];
          sumB += firstFrameRgb[idx + 2];
          count++;
        }
      }
    }

    let victoryBoxColor = 'unknown';
    if (count > 0) {
      victoryBoxColor = classifyColor(sumR / count, sumG / count, sumB / count);
    }
    console.log(`Detected Victory Box Team Color: ${victoryBoxColor}`);

    if (victoryBoxColor === 'unknown') {
      return { victoryBoxColor: 'unknown', isVictory: true };
    }

    // Save raw crop-victory-box.png
    try {
      await sharp(firstFramePath)
        .extract({
          left: victoryBox.left,
          top: victoryBox.top,
          width: vbWidth,
          height: vbHeight
        })
        .png()
        .toFile(path.join(process.cwd(), '.tmp', 'crop-victory-box.png'));
    } catch (err) {
      console.error('Failed to write crop-victory-box.png:', err);
    }

    // OCR Victory Box
    const vbCroppedBuffer = await sharp(firstFramePath)
      .extract({
        left: victoryBox.left,
        top: victoryBox.top,
        width: vbWidth,
        height: vbHeight
      })
      .resize({ width: vbWidth * 2, kernel: 'cubic' })
      .grayscale()
      .negate({ alpha: false })
      .threshold(victoryBox.threshold ?? configManager.getConfig().threshold ?? 160)
      .withMetadata({ density: 300 })
      .png()
      .toBuffer();

    const vbTempPath = path.join(process.cwd(), '.tmp', 'ocr-victory-box.png');
    await fs.promises.writeFile(vbTempPath, vbCroppedBuffer);

    const worker = await createWorker('eng');
    const { data: vbData } = await worker.recognize(vbTempPath);
    await worker.terminate();

    const vbText = vbData.text.toLowerCase();
    console.log(`Victory Box OCR text: "${vbText.trim()}"`);

    const isVictory = !vbText.includes('defeat') && !vbText.includes('def') && !vbText.includes('eat');
    console.log(`Victory Box label resolved as: ${isVictory ? 'Victory' : 'Defeat'}`);

    return { victoryBoxColor, isVictory };
  } catch (err) {
    console.error('Error extracting victory side:', err);
    return { victoryBoxColor: 'unknown', isVictory: true };
  }
}

/**
 * Core parsing logic to extract rows from cropped and stitched image without decoration.
 */
async function performSegmentOCR(
  imagePath: string,
  type: string,
  whitelist?: string
): Promise<{ text: string; lines: OcrLine[] }> {
  const worker = await createWorker('eng');
  if (whitelist) {
    await worker.setParameters({
      tessedit_char_whitelist: whitelist,
    });
  }
  const { data } = await worker.recognize(imagePath);
  const lines: OcrLine[] = [];
  if (data.lines) {
    for (const line of data.lines) {
      const bbox = line.bbox;
      if (bbox) {
        const yCenter = (bbox.y0 + bbox.y1) / 2;
        lines.push({
          text: line.text,
          yCenter,
        });
      }
    }
  }
  await worker.terminate();
  return { text: data.text, lines };
}

export async function extractScoreboardRows(imagePath: string): Promise<ScoreboardRow[]> {
  const preprocessedPath = await preprocessImageForOCR(imagePath);
  const config = configManager.getConfig();
  const segments = config.scoreBox.segments || [];

  const { data: rgbBuffer, info: rgbInfo } = await sharp(imagePath)
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (segments.length === 0) {
    console.log(`No segments configured. Running standard full-image OCR...`);
    const { text: rawText, lines: ocrLines } = await performOCR(preprocessedPath);
    const originalMetadata = await sharp(imagePath).metadata();
    const originalHeight = originalMetadata.height || 0;
    const finalOcrLines = [...ocrLines];

    if (finalOcrLines.length === 0 && rawText.trim()) {
      const rawLines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
      const estRowHeight = originalHeight / rawLines.length;
      for (let i = 0; i < rawLines.length; i++) {
        finalOcrLines.push({
          text: rawLines[i],
          yCenter: (i + 0.5) * estRowHeight * 2,
        });
      }
    }

    console.log('Parsing raw OCR text and detecting row colors...');
    return parseRawOcrLines(
      finalOcrLines,
      rgbBuffer,
      rgbInfo.width,
      rgbInfo.height,
      rgbInfo.channels
    );
  }

  console.log(`Starting segmented OCR parser using ${segments.length} segments...`);
  const metadata = await sharp(preprocessedPath).metadata();
  const preprocessedWidth = metadata.width || 0;
  const preprocessedHeight = metadata.height || 0;
  const originalScoreBoxWidth = config.scoreBox.right - config.scoreBox.left;
  const preprocessedScale = preprocessedWidth / originalScoreBoxWidth;

  interface SegmentOcrResult {
    segment: typeof segments[0];
    lines: OcrLine[];
  }

  const segmentResults: SegmentOcrResult[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (segment.type === 'drop') {
      console.log(`Segment ${i + 1} (drop): Skipping.`);
      continue;
    }

    const segLeftOriginal = i === 0 ? config.scoreBox.left : segments[i - 1].end!;
    const segRightOriginal = segment.end ?? config.scoreBox.right;
    const segWidthOriginal = segRightOriginal - segLeftOriginal;

    if (segWidthOriginal <= 0) {
      console.log(`Segment ${i + 1} (${segment.type}): Invalid width (${segWidthOriginal}px). Skipping.`);
      continue;
    }

    const segLeftPreprocessed = Math.round((segLeftOriginal - config.scoreBox.left) * preprocessedScale);
    const segWidthPreprocessed = Math.round(segWidthOriginal * preprocessedScale);

    console.log(`Segment ${i + 1} (${segment.type}): X-range original [${segLeftOriginal} - ${segRightOriginal}], preprocessed [${segLeftPreprocessed} - ${segLeftPreprocessed + segWidthPreprocessed}]`);

    const colPath = path.join(process.cwd(), '.tmp', `ocr-column-${i}.png`);
    await sharp(preprocessedPath)
      .extract({
        left: Math.max(0, Math.min(segLeftPreprocessed, preprocessedWidth - 1)),
        top: 0,
        width: Math.max(1, Math.min(segWidthPreprocessed, preprocessedWidth - segLeftPreprocessed)),
        height: preprocessedHeight
      })
      .png()
      .toFile(colPath);

    let whitelist: string | undefined;
    if (segment.type === 'number') {
      whitelist = '0123456789, ';
    } else if (segment.type === 'kda') {
      whitelist = '0123456789/ ';
    }

    const { lines } = await performSegmentOCR(colPath, segment.type, whitelist);
    segmentResults.push({ segment, lines });
    console.log(`Segment ${i + 1} (${segment.type}): Extracted ${lines.length} lines.`);
  }

  let nameResultIndex = segmentResults.findIndex(r => r.segment.header === 'name');
  if (nameResultIndex === -1) {
    nameResultIndex = segmentResults.findIndex(r => r.segment.type === 'text');
  }
  if (nameResultIndex === -1) {
    nameResultIndex = 0;
  }

  const nameResult = segmentResults[nameResultIndex];
  if (!nameResult) {
    console.warn(`No text or name segment found. Returning empty rows.`);
    return [];
  }

  const rows: ScoreboardRow[] = [];

  console.log(`Aligning columns using segment ${nameResult.segment.header || nameResult.segment.name || nameResultIndex} as name reference...`);

  const columnNames = config.columnNames || [];
  const rankIndex = columnNames.findIndex(c => c.toLowerCase() === 'rank');
  const nameIndex = columnNames.findIndex(c => c.toLowerCase() === 'name');
  const scoreIndex = columnNames.findIndex(c => c.toLowerCase() === 'score');

  for (const nameLine of nameResult.lines) {
    const yCenter = nameLine.yCenter;
    const cleanedName = cleanPlayerName(nameLine.text);
    if (!cleanedName || !/[a-zA-Z0-9]/.test(cleanedName)) continue;

    const rgbY = Math.round(yCenter / preprocessedScale); 
    const side = detectSideColor(rgbY, rgbBuffer, rgbInfo.width, rgbInfo.height, rgbInfo.channels);

    const rowValues = new Array(columnNames.length).fill('');
    const assigned = new Array(columnNames.length).fill(false);

    if (nameIndex !== -1) {
      rowValues[nameIndex] = cleanedName;
      assigned[nameIndex] = true;
    }

    let matchedAnySegment = false;

    for (const res of segmentResults) {
      let bestLine: OcrLine | null = null;
      let minDiff = Infinity;
      const tolerance = config.scoreBox.yTolerance ?? 15;

      for (const line of res.lines) {
        const diff = Math.abs(line.yCenter - yCenter);
        if (diff < tolerance && diff < minDiff) {
          minDiff = diff;
          bestLine = line;
        }
      }

      if (bestLine && res !== nameResult) {
        matchedAnySegment = true;
      }

      const segment = res.segment;
      const segmentLabel = segment.header || segment.name;

      if (segment.type === 'number') {
        const cleanVal = bestLine ? bestLine.text.replace(/,/g, '').trim() : '';
        const parts = cleanVal.split(/\s+/).filter(Boolean);

        if (segmentLabel) {
          const colIdx = columnNames.findIndex(c => c.toLowerCase() === segmentLabel.toLowerCase());
          if (colIdx !== -1) {
            rowValues[colIdx] = (parts[0] || '0').replace(/[^\d]/g, '');
            assigned[colIdx] = true;
          }
        } else {
          let partIndex = 0;
          for (let idx = 0; idx < columnNames.length && partIndex < parts.length; idx++) {
            if (!assigned[idx] && idx !== nameIndex) {
              rowValues[idx] = parts[partIndex].replace(/[^\d]/g, '');
              assigned[idx] = true;
              partIndex++;
            }
          }
        }
      } else if (segment.type === 'kda') {
        const cleanVal = bestLine ? bestLine.text.replace(/[^0-9/]/g, '').trim() : '0/0/0';
        const parts = cleanVal.split('/');
        const kills = parts[0] || '0';
        const deaths = parts[1] || '0';
        const assists = parts[2] || '0';

        if (segmentLabel) {
          const colIdx = columnNames.findIndex(c => c.toLowerCase() === segmentLabel.toLowerCase());
          if (colIdx !== -1) {
            const kdaVals = [kills, deaths, assists];
            for (let k = 0; k < 3 && colIdx + k < columnNames.length; k++) {
              rowValues[colIdx + k] = kdaVals[k];
              assigned[colIdx + k] = true;
            }
          }
        } else {
          const kdaVals = [kills, deaths, assists];
          let kIndex = 0;
          for (let idx = 0; idx < columnNames.length && kIndex < 3; idx++) {
            if (!assigned[idx] && idx !== nameIndex) {
              rowValues[idx] = kdaVals[kIndex];
              assigned[idx] = true;
              kIndex++;
            }
          }
        }
      }
    }

    if (segmentResults.length > 1 && !matchedAnySegment) {
      console.log(`Discarding player name "${cleanedName}" as it could not be matched to any stats columns.`);
      continue;
    }

    for (let idx = 0; idx < columnNames.length; idx++) {
      if (!assigned[idx]) {
        rowValues[idx] = idx === nameIndex ? cleanedName : '0';
      }
    }

    const rankVal = rankIndex !== -1 ? rowValues[rankIndex] : '0';
    const nameVal = nameIndex !== -1 ? rowValues[nameIndex] : cleanedName;
    const scoreVal = scoreIndex !== -1 ? rowValues[scoreIndex] : '0';

    const statsVals: string[] = [];
    for (let idx = 0; idx < columnNames.length; idx++) {
      if (idx !== rankIndex && idx !== nameIndex && idx !== scoreIndex) {
        statsVals.push(rowValues[idx]);
      }
    }

    rows.push({
      side,
      rank: rankVal,
      name: nameVal,
      score: scoreVal,
      stats: statsVals,
    });
  }

  console.log(`Parsed ${rows.length} rows using segmented OCR.`);
  return rows;
}

/**
 * Decorates rows with date and win column.
 */
export function decorateScoreboardRows(
  rows: ScoreboardRow[],
  victoryInfo: VictoryInfo,
  startTime: Date,
  matchId: string
): DecoratedRow[] {
  const dateStr = formatDateTime(startTime);
  const { victoryBoxColor, isVictory } = victoryInfo;

  return rows.map((r) => {
    let win = false;
    if (victoryBoxColor !== 'unknown') {
      if (r.side === victoryBoxColor) {
        win = isVictory;
      } else if (r.side !== 'unknown' && r.side !== 'neutral') {
        win = !isVictory;
      }
    }
    return {
      ...r,
      date: dateStr,
      win,
      matchId,
    };
  });
}

/**
 * Writes decorated rows to CSV.
 */
export function writeToCsv(rows: DecoratedRow[], csvOutputPath: string): void {
  const config = configManager.getConfig();
  const columnNames = config.columnNames || [];

  const outDir = path.dirname(csvOutputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const header = ['Match', 'Date', 'Side', 'Win', ...columnNames].join(',') + '\n';
  const expectedLength = 4 + columnNames.length;

  const rankIndex = columnNames.findIndex(c => c.toLowerCase() === 'rank');
  const nameIndex = columnNames.findIndex(c => c.toLowerCase() === 'name');
  const scoreIndex = columnNames.findIndex(c => c.toLowerCase() === 'score');

  const csvContent = rows
    .map((r) => {
      const values: string[] = [];
      let statsIdx = 0;

      for (let idx = 0; idx < columnNames.length; idx++) {
        if (idx === rankIndex) {
          values.push(r.rank);
        } else if (idx === nameIndex) {
          values.push(r.name);
        } else if (idx === scoreIndex) {
          values.push(r.score);
        } else {
          values.push(r.stats[statsIdx++] || '0');
        }
      }

      const rowData = [
        r.matchId,
        r.date,
        r.side,
        r.win ? 'TRUE' : 'FALSE',
        ...values
      ];

      if (rowData.length !== expectedLength) {
        console.warn(`[CSV Warning] Row column count (${rowData.length}) does not match expected header count (${expectedLength}) for player "${r.name}"`);
      }

      return rowData.map((val) => `"${val.replace(/"/g, '""')}"`).join(',');
    })
    .join('\n');

  fs.writeFileSync(csvOutputPath, header + csvContent, 'utf-8');
}

async function preprocessImageForOCR(imagePath: string): Promise<string> {
  const ocrTempPath = path.join(path.dirname(imagePath), 'ocr-scoreboard.png');
  console.log('Preprocessing image for OCR (scaling, grayscaling, inverting, thresholding)...');

  const metadata = await sharp(imagePath).metadata();
  const width = metadata.width || 0;

  const scoreBox = configManager.getConfig().scoreBox;
  const thresholdVal = scoreBox.threshold ?? configManager.getConfig().threshold ?? 160;
  const { data, info } = await sharp(imagePath)
    .resize({ width: width * 2, kernel: 'cubic' })
    .grayscale()
    .negate({ alpha: false })
    .threshold(thresholdVal)
    .raw()
    .toBuffer({ resolveWithObject: true });

  await sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 1,
    },
  })
    .withMetadata({ density: 300 })
    .toFile(ocrTempPath);

  return ocrTempPath;
}

async function performOCR(imagePath: string): Promise<{ text: string; lines: OcrLine[] }> {
  const worker = await createWorker('eng');
  const { data } = await worker.recognize(imagePath);

  const lines: OcrLine[] = [];
  if (data.lines) {
    for (const line of data.lines) {
      const bbox = line.bbox;
      if (bbox) {
        const yCenter = (bbox.y0 + bbox.y1) / 2;
        lines.push({
          text: line.text,
          yCenter,
        });
      }
    }
  }

  await worker.terminate();
  return { text: data.text, lines };
}

function parseRawOcrLines(
  ocrLines: OcrLine[],
  rgbBuffer: Buffer,
  rgbWidth: number,
  rgbHeight: number,
  rgbChannels: number
): ScoreboardRow[] {
  const config = configManager.getConfig();
  const columnNames = config.columnNames || [];
  const expectedStatsLength = Math.max(0, columnNames.length - 3);

  const rows: ScoreboardRow[] = [];

  const cleanDigitsOnly = (str: string) => str.replace(/O|o/g, '0').replace(/[^\d]/g, '');
  const cleanStatsOnly = (str: string) => str.replace(/O|o/g, '0').replace(/[^\d/]/g, '');

  for (const ocrLine of ocrLines) {
    const line = ocrLine.text.trim();
    if (!line) continue;

    const cleaned = line.replace(/^[|:.\s]+|[|:.\s]+$/g, '');
    const rawParts = cleaned.split(/\s+/);
    if (rawParts.length < 3) continue;

    // Split any part containing a '/' (KDA) into 3 separate parts
    const parts: string[] = [];
    for (const part of rawParts) {
      if (part.includes('/')) {
        const kdaParts = part.split('/');
        parts.push(kdaParts[0] || '0', kdaParts[1] || '0', kdaParts[2] || '0');
      } else {
        parts.push(part);
      }
    }

    let rank = '';
    let name = '';
    let score = '';
    let stats: string[] = [];

    if (parts.length >= expectedStatsLength + 3) {
      rank = cleanDigitsOnly(parts[0]);
      stats = parts.slice(-expectedStatsLength).map(cleanStatsOnly);
      score = cleanDigitsOnly(parts[parts.length - expectedStatsLength - 1]);
      name = parts.slice(1, parts.length - expectedStatsLength - 1).join(' ');
    } else {
      rank = cleanDigitsOnly(parts[0]);
      name = parts[1];
      score = parts[2] ? cleanDigitsOnly(parts[2]) : '0';
      stats = parts.slice(3).map(cleanStatsOnly);
    }

    const cleanedName = cleanPlayerName(name);
    if (!cleanedName || !/[a-zA-Z0-9]/.test(cleanedName)) continue;
    name = cleanedName;

    while (stats.length < expectedStatsLength) {
      stats.push('0');
    }
    if (stats.length > expectedStatsLength) {
      stats = stats.slice(0, expectedStatsLength);
    }

    const originalY = Math.round(ocrLine.yCenter / 2);
    const side = detectSideColor(originalY, rgbBuffer, rgbWidth, rgbHeight, rgbChannels);

    rows.push({
      side,
      rank,
      name,
      score,
      stats,
    });
  }

  return rows;
}

function detectSideColor(
  y: number,
  rgbBuffer: Buffer,
  width: number,
  height: number,
  channels: number
): string {
  if (y < 0 || y >= height) return 'unknown';

  const startX = width - 20;
  const endX = width - 10;
  const startY = Math.max(0, y - 5);
  const endY = Math.min(height - 1, y + 4);

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;

  for (let cy = startY; cy <= endY; cy++) {
    for (let cx = startX; cx <= endX; cx++) {
      if (cx >= 0 && cx < width) {
        const idx = (cy * width + cx) * channels;
        sumR += rgbBuffer[idx];
        sumG += rgbBuffer[idx + 1];
        sumB += rgbBuffer[idx + 2];
        count++;
      }
    }
  }

  if (count === 0) return 'unknown';

  return classifyColor(sumR / count, sumG / count, sumB / count);
}

function classifyColor(r: number, g: number, b: number): string {
  const [h, s] = convert.rgb.hsv([r, g, b]);

  if (s < 10) return 'neutral';

  if (h >= 325 || h < 20) return 'red';
  if (h >= 20 && h < 50) return 'orange';
  if (h >= 75 && h < 160) return 'green';
  if (h >= 170 && h < 255) return 'blue';
  if (h >= 255 && h < 325) return 'purple';

  return 'unknown';
}

function formatDateTime(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * Orchestrates the full scoreboard extraction flow:
 * frame extraction, filtering, victory info parsing, stitching, row parsing, and CSV writing.
 */
export async function runScoreboardParsing(
  videoPath: string,
  stitchedPath: string,
  csvPath: string,
  fps: number,
  startTime?: Date,
  matchId: string = ''
): Promise<void> {
  let matchTime = startTime;
  if (!matchTime) {
    try {
      const stats = fs.statSync(videoPath);
      matchTime = stats.mtime;
    } catch (e) {
      matchTime = new Date();
    }
  }

  const tempDir = path.join(process.cwd(), '.tmp');
  const framesDir = path.join(tempDir, 'frames');
  if (fs.existsSync(framesDir)) {
    fs.rmSync(framesDir, { recursive: true, force: true });
  }

  let frames = await extractFrames(videoPath, framesDir, fps);
  console.log(`Extracted ${frames.length} frames.`);

  if (frames.length === 0) {
    throw new Error("No frames extracted from the video.");
  }

  frames = await filterScoreboardFrames(frames);

  if (frames.length === 0) {
    throw new Error("No scoreboard frames found in the video after filtering.");
  }

  console.log(`Analyzing victory side...`);
  const victoryInfoPromise = parseVictoryInfo(frames[0]);

  console.log(`Stitching frames into ${stitchedPath}...`);
  await cropAndStitchFrames(frames, stitchedPath);

  const victoryInfo = await victoryInfoPromise;
  console.log(`Victory Info resolved - Box Color: ${victoryInfo.victoryBoxColor}, Outcome: ${victoryInfo.isVictory ? 'Victory' : 'Defeat'}`);

  const rows = await extractScoreboardRows(stitchedPath);
  const decorated = decorateScoreboardRows(rows, victoryInfo, matchTime, matchId);

  console.log(`Writing structured data to CSV: ${csvPath}`);
  writeToCsv(decorated, csvPath);
}
