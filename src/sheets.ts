import * as fs from 'fs';
import { google } from 'googleapis';

export async function uploadCsvToGoogleSheets(csvPath: string): Promise<void> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const range = process.env.GOOGLE_SHEETS_RANGE || 'Sheet1!A2:H';

  if (!spreadsheetId) {
    throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID is not defined in the environment.');
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

  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  console.log(`Clearing existing data in range: ${range}...`);
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range,
  });

  console.log(`Uploading ${rows.length} rows to Google Sheets...`);
  const targetStartCell = range.split(':')[0];
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: targetStartCell,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: rows,
    },
  });

  console.log('Google Sheet updated successfully!');
}
