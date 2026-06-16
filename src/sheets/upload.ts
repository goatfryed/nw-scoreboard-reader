import * as fs from 'fs';
import { uploadRowsToGoogleSheets } from './api';
import { SheetsOptionBase } from '.';

export interface UploadOptions extends SheetsOptionBase {
  upload: {
    range: string;
    append?: boolean;
  }
}

export async function uploadCsvToGoogleSheets(csvPath: string, options: UploadOptions): Promise<void> {
  const spreadsheetId = options.spreadSheetId;
  const range = options.upload.range || 'Sheet1!A2:H';
  const append = options.upload.append ?? false;

  if (!spreadsheetId) {
    throw new Error('spreadSheetId is not defined in the configuration.');
  }

  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found at: ${csvPath}`);
  }

  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length <= 1) {
    console.log('CSV is empty or only contains headers. Skipping upload.');
    return;
  }

  const rows = lines.slice(1).map((line) => {
    const parts: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        parts.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    parts.push(current);
    return parts;
  });

  await uploadRowsToGoogleSheets(spreadsheetId, range, rows, append);
  console.log('Google Sheet updated successfully!');
}
