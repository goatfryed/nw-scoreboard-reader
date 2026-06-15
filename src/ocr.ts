import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';

const OprStats = ["kda", "damage", "healing", "blocked", "resources"];
const WarStats = ["kda", "damage", "healing"];

interface ScoreboardRow {
  rank: string;
  name: string;
  score: string;
  stats: string[];
}

export async function extractScoreboardToCsv(
  imagePath: string,
  csvOutputPath: string
): Promise<void> {
  const preprocessedPath = await preprocessImageForOCR(imagePath);

  console.log(`Running OCR on preprocessed image...`);
  const rawText = await performOCR(preprocessedPath);

  try {
    fs.copyFileSync(preprocessedPath, path.join(path.dirname(imagePath), 'preprocessed.png'));
  } catch (e) { }

  try {
    fs.unlinkSync(preprocessedPath);
  } catch (e) { }

  console.log('Parsing raw OCR text...');
  const rows = parseRawOcrText(rawText);

  console.log(`Writing structured data to CSV: ${csvOutputPath}`);
  writeToCsv(rows, csvOutputPath);
  console.log('CSV export complete!');
}

async function preprocessImageForOCR(imagePath: string): Promise<string> {
  const ocrTempPath = path.join(path.dirname(imagePath), 'ocr_preprocessed.png');
  console.log('Preprocessing image for OCR (scaling, grayscaling, inverting, thresholding)...');

  const metadata = await sharp(imagePath).metadata();
  const width = metadata.width || 0;

  const thresholdVal = process.env.OCR_THRESHOLD ? parseInt(process.env.OCR_THRESHOLD, 10) : 160;
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
  const eraseLeftStr = process.env.ERASE_LEFT;
  const eraseRightStr = process.env.ERASE_RIGHT;
  if (!eraseLeftStr || !eraseRightStr) return;

  const rawEraseLeft = parseInt(eraseLeftStr, 10);
  const rawEraseRight = parseInt(eraseRightStr, 10);
  if (isNaN(rawEraseLeft) || isNaN(rawEraseRight) || rawEraseRight <= rawEraseLeft) return;

  const cropLeft = process.env.CROP_LEFT ? parseInt(process.env.CROP_LEFT, 10) : 0;
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

async function performOCR(imagePath: string): Promise<string> {
  const worker = await createWorker('eng');
  const { data: { text } } = await worker.recognize(imagePath);
  await worker.terminate();
  return text;
}

function parseRawOcrText(text: string): ScoreboardRow[] {
  const gameType = process.env.GAME_TYPE || 'opr';
  const statsList = gameType === 'war' ? WarStats : OprStats;
  const numStats = statsList.length;
  const expectedMinParts = numStats + 3; // Rank + Name + Score + Stats

  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const rows: ScoreboardRow[] = [];

  for (const line of lines) {
    const cleaned = line.replace(/^[|:.\s]+|[|:.\s]+$/g, '');
    const parts = cleaned.split(/\s+/);
    if (parts.length < 3) continue;

    let rank = '';
    let name = '';
    let score = '';
    let stats: string[] = [];

    if (parts.length >= expectedMinParts) {
      rank = parts[0];
      stats = parts.slice(-numStats).map((s) => s.replace(/O|o/g, '0'));
      score = parts[parts.length - numStats - 1].replace(/O|o/g, '0');
      name = parts.slice(1, parts.length - numStats - 1).join(' ');
    } else {
      rank = parts[0];
      name = parts[1];
      score = parts[2] ? parts[2].replace(/O|o/g, '0') : '0';
      stats = parts.slice(3).map((s) => s.replace(/O|o/g, '0'));
    }

    const cleanedName = name.replace(/^[^a-zA-Z]+/, '').replace(/~+$/, '').trim();
    name = cleanedName || name;

    while (stats.length < numStats) {
      stats.push('0');
    }
    if (stats.length > numStats) {
      stats = stats.slice(0, numStats);
    }

    rows.push({
      rank,
      name,
      score,
      stats,
    });
  }

  return rows;
}

function writeToCsv(rows: ScoreboardRow[], csvOutputPath: string): void {
  const gameType = process.env.GAME_TYPE || 'opr';
  const statsList = gameType === 'war' ? WarStats : OprStats;

  const outDir = path.dirname(csvOutputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const statHeaders = statsList.join(',');
  const header = `Rank,Name,Score,${statHeaders}\n`;

  const csvContent = rows
    .map((r) => {
      const statsFields = r.stats.map((s) => `"${s}"`).join(',');
      return `"${r.rank}","${r.name.replace(/"/g, '""')}","${r.score}",${statsFields}`;
    })
    .join('\n');

  fs.writeFileSync(csvOutputPath, header + csvContent, 'utf-8');
}
