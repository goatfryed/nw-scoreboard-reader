import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import convert from 'color-convert';
import { configManager, ReaderOptions } from './config';

export { ReaderOptions };

const OprRawStats = ["kda", "damage", "healing", "blocked", "resources"];
const OprCsvHeaders = ["kills", "deaths", "assists", "damage", "healing", "blocked", "resources"];
const WarStats = ["kills", "deaths", "assists", "damage", "healing"];


interface ScoreboardRow {
  side: string;
  rank: string;
  name: string;
  score: string;
  stats: string[];
}

interface OcrLine {
  text: string;
  yCenter: number;
}

export async function extractScoreboardToCsv(
  imagePath: string,
  csvOutputPath: string,
  startTime: Date = new Date()
): Promise<void> {
  const preprocessedPath = await preprocessImageForOCR(imagePath);

  console.log(`Running OCR on preprocessed image...`);
  const { text: rawText, lines: ocrLines } = await performOCR(preprocessedPath);

  try {
    fs.copyFileSync(preprocessedPath, path.join(path.dirname(imagePath), 'preprocessed.png'));
  } catch (e) { }

  try {
    fs.unlinkSync(preprocessedPath);
  } catch (e) { }

  const originalMetadata = await sharp(imagePath).metadata();
  const originalHeight = originalMetadata.height || 0;

  const { data: rgbBuffer, info: rgbInfo } = await sharp(imagePath)
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (ocrLines.length === 0 && rawText.trim()) {
    const rawLines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
    const estRowHeight = originalHeight / rawLines.length;
    for (let i = 0; i < rawLines.length; i++) {
      ocrLines.push({
        text: rawLines[i],
        yCenter: (i + 0.5) * estRowHeight * 2,
      });
    }
  }

  console.log('Parsing raw OCR text and detecting row colors...');
  const rows = parseRawOcrLines(
    ocrLines,
    rgbBuffer,
    rgbInfo.width,
    rgbInfo.height,
    rgbInfo.channels
  );

  console.log(`Writing structured data to CSV: ${csvOutputPath}`);
  writeToCsv(rows, csvOutputPath, startTime);
  console.log('CSV export complete!');
}

async function preprocessImageForOCR(imagePath: string): Promise<string> {
  const ocrTempPath = path.join(path.dirname(imagePath), 'ocr_preprocessed.png');
  console.log('Preprocessing image for OCR (scaling, grayscaling, inverting, thresholding)...');

  const metadata = await sharp(imagePath).metadata();
  const width = metadata.width || 0;

  const thresholdVal = configManager.getConfig().threshold ?? 160;
  const { data, info } = await sharp(imagePath)
    .resize({ width: width * 2, kernel: 'cubic' })
    .grayscale()
    .negate({ alpha: false })
    .threshold(thresholdVal)
    .raw()
    .toBuffer({ resolveWithObject: true });

  eraseIconColumn(data, info.width, info.height, width);

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

function eraseIconColumn(
  data: Buffer,
  actualWidth: number,
  actualHeight: number,
  originalWidth: number
): void {
  const config = configManager.getConfig();
  const rawEraseLeft = config.erase.left;
  const rawEraseRight = config.erase.right;
  if (!rawEraseLeft && !rawEraseRight) return;

  if (rawEraseRight <= rawEraseLeft) return;

  const cropLeft = config.scoreBox.left;
  const eraseLeft = Math.max(0, rawEraseLeft - cropLeft);
  const eraseRight = Math.max(0, rawEraseRight - cropLeft);

  if (eraseRight <= eraseLeft) return;

  const scale = actualWidth / originalWidth;
  const scaledLeft = Math.round(eraseLeft * scale);
  const scaledRight = Math.round(eraseRight * scale);

  for (let y = 0; y < actualHeight; y++) {
    const rowOffset = y * actualWidth;
    for (let x = scaledLeft; x < scaledRight && x < actualWidth; x++) {
      data[rowOffset + x] = 255;
    }
  }
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
  const gameType = configManager.getConfig().type || 'opr';
  const statsList = gameType === 'war' ? WarStats : OprRawStats;
  const numStats = statsList.length;
  const expectedMinParts = numStats + 3; // Rank + Name + Score + Stats

  const rows: ScoreboardRow[] = [];

  const cleanDigitsOnly = (str: string) => str.replace(/O|o/g, '0').replace(/[^\d]/g, '');
  const cleanStatsOnly = (str: string) => str.replace(/O|o/g, '0').replace(/[^\d/]/g, '');

  for (const ocrLine of ocrLines) {
    const line = ocrLine.text.trim();
    if (!line) continue;

    const cleaned = line.replace(/^[|:.\s]+|[|:.\s]+$/g, '');
    const parts = cleaned.split(/\s+/);
    if (parts.length < 3) continue;

    let rank = '';
    let name = '';
    let score = '';
    let stats: string[] = [];

    if (parts.length >= expectedMinParts) {
      rank = cleanDigitsOnly(parts[0]);
      stats = parts.slice(-numStats).map(cleanStatsOnly);
      score = cleanDigitsOnly(parts[parts.length - numStats - 1]);
      name = parts.slice(1, parts.length - numStats - 1).join(' ');
    } else {
      rank = cleanDigitsOnly(parts[0]);
      name = parts[1];
      score = parts[2] ? cleanDigitsOnly(parts[2]) : '0';
      stats = parts.slice(3).map(cleanStatsOnly);
    }

    const cleanedName = name.replace(/^[^a-zA-Z]+/, '').replace(/~+$/, '').trim();
    name = cleanedName || name;

    while (stats.length < numStats) {
      stats.push('0');
    }
    if (stats.length > numStats) {
      stats = stats.slice(0, numStats);
    }

    if (gameType === 'opr') {
      const kdaStr = stats[0] || '0/0/0';
      const kdaParts = kdaStr.split('/');
      const kills = kdaParts[0] || '0';
      const deaths = kdaParts[1] || '0';
      const assists = kdaParts[2] || '0';
      stats = [kills, deaths, assists, ...stats.slice(1)];
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

function writeToCsv(rows: ScoreboardRow[], csvOutputPath: string, startTime: Date): void {
  const gameType = configManager.getConfig().type || 'opr';
  const statsList = gameType === 'war' ? WarStats : OprCsvHeaders;

  const outDir = path.dirname(csvOutputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const dateStr = formatDateTime(startTime);
  const statHeaders = statsList.join(',');
  const header = `Date,Side,Rank,Name,Score,${statHeaders}\n`;

  const csvContent = rows
    .map((r) => {
      const statsFields = r.stats.map((s) => `"${s}"`).join(',');
      return `"${dateStr}","${r.side}","${r.rank}","${r.name.replace(/"/g, '""')}","${r.score}",${statsFields}`;
    })
    .join('\n');

  fs.writeFileSync(csvOutputPath, header + csvContent, 'utf-8');
}
