import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import sharp from 'sharp';
import { exportSheetAsPdf, getSheetGidByName } from './api';
import { SheetsOptionBase } from '.';

export interface ScreenshotOptions extends SheetsOptionBase {
  screenshot: string[];
}

export async function captureSpreadsheetScreenshot(outputPath: string, options: ScreenshotOptions): Promise<void> {
  const spreadsheetId = options.spreadSheetId;

  if (!spreadsheetId) {
    throw new Error('spreadSheetId is not defined in the configuration.');
  }

  // Parse configurations (format: gid:range)
  const configs: { gid: string; range: string }[] = [];
  if (options.screenshot && options.screenshot.length > 0) {
    for (const part of options.screenshot) {
      const colIdx = part.indexOf(':');
      if (colIdx !== -1) {
        configs.push({
          gid: part.substring(0, colIdx).trim(),
          range: part.substring(colIdx + 1).trim()
        });
      }
    }
  }

  if (configs.length === 0) {
    console.log('No screenshots configured. Skipping screenshot capture.');
    return;
  }

  const parsedPath = path.parse(outputPath);
  const tempDir = path.join(process.cwd(), '.tmp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  for (const cfg of configs) {
    const gidParam = cfg.gid;
    const range = cfg.range;

    // Resolve GID if it's set to '0', empty, or a sheet name
    let resolvedGid = gidParam;
    if (!resolvedGid || resolvedGid === '0') {
      const rangeEnv = process.env.GOOGLE_SHEETS_RANGE || '';
      const sheetName = rangeEnv.split('!')[0];
      if (sheetName) {
        resolvedGid = await getSheetGidByName(spreadsheetId, sheetName);
      } else {
        resolvedGid = '0';
      }
    } else if (isNaN(Number(resolvedGid))) {
      resolvedGid = await getSheetGidByName(spreadsheetId, resolvedGid);
    }

    // Determine target output path for this specific screenshot
    let targetOutputPath = outputPath;
    if (configs.length > 1) {
      targetOutputPath = path.join(parsedPath.dir, `${parsedPath.name}_${gidParam}${parsedPath.ext}`);
    }

    console.log(`\nProcessing GID "${gidParam}" (resolved: ${resolvedGid}) for range ${range}...`);
    console.log(`Downloading PDF export...`);
    const pdfBuffer = await exportSheetAsPdf(spreadsheetId, resolvedGid, range);

    const pdfPath = path.join(tempDir, `sheet_${resolvedGid}.pdf`);
    fs.writeFileSync(pdfPath, pdfBuffer);

    const outputPrefix = path.join(tempDir, `spreadsheet_page_${resolvedGid}`);
    console.log('Converting PDF to PNG using native pdftoppm...');
    execSync(`pdftoppm -png -r 150 "${pdfPath}" "${outputPrefix}"`);

    // Find all generated page files for this GID
    const files = fs.readdirSync(tempDir);
    const prefix = `spreadsheet_page_${resolvedGid}`;
    const pageFiles = files
      .filter(f => f.startsWith(prefix) && f.endsWith('.png') && !f.includes('_trimmed'))
      .map(f => {
        const match = f.match(/-(\d+)\.png$/);
        return {
          file: path.join(tempDir, f),
          page: match ? parseInt(match[1], 10) : 1
        };
      })
      .sort((a, b) => a.page - b.page);

    if (pageFiles.length === 0) {
      throw new Error(`No PDF pages were exported for GID ${gidParam}.`);
    }

    console.log(`Found ${pageFiles.length} pages. Trimming margins from each page...`);

    // Read and trim all pages individually first
    const trimmedPages = await Promise.all(
      pageFiles.map(async (p) => {
        const trimmedFile = p.file.replace('.png', '_trimmed.png');
        await sharp(p.file).trim().toFile(trimmedFile);
        const meta = await sharp(trimmedFile).metadata();
        return {
          file: trimmedFile,
          width: meta.width || 0,
          height: meta.height || 0
        };
      })
    );

    const totalHeight = trimmedPages.reduce((sum, p) => sum + p.height, 0);
    const maxWidth = Math.max(...trimmedPages.map(p => p.width));

    console.log(`Stitching ${trimmedPages.length} trimmed pages vertically...`);

    // Compose the trimmed pages vertically
    let currentY = 0;
    const compositeInput = trimmedPages.map((p) => {
      const input = {
        input: p.file,
        top: currentY,
        left: 0
      };
      currentY += p.height;
      return input;
    });

    // Create canvas and merge
    const stitchedBuffer = await sharp({
      create: {
        width: maxWidth,
        height: totalHeight,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    })
      .composite(compositeInput)
      .png()
      .toBuffer();

    // Ensure output directory exists
    const destDir = path.dirname(targetOutputPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    // Save final stitched and trimmed image
    await fs.promises.writeFile(targetOutputPath, stitchedBuffer);

    // Clean up temporary files for this GID
    if (fs.existsSync(pdfPath)) {
      fs.unlinkSync(pdfPath);
    }
    for (const p of pageFiles) {
      if (fs.existsSync(p.file)) {
        fs.unlinkSync(p.file);
      }
    }
    for (const p of trimmedPages) {
      if (fs.existsSync(p.file)) {
        fs.unlinkSync(p.file);
      }
    }

    console.log(`Screenshot saved successfully to ${targetOutputPath}`);
  }
}
