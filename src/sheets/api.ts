import { google } from 'googleapis';

export function getGoogleAuth(scopes: string[]) {
  return new google.auth.GoogleAuth({
    scopes,
  });
}

/**
 * Clears and uploads raw grid rows to a Google Sheet range.
 */
export async function uploadRowsToGoogleSheets(
  spreadsheetId: string,
  range: string,
  rows: string[][],
  append: boolean = false
): Promise<void> {
  const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
  const sheets = google.sheets({ version: 'v4', auth });

  if (append) {
    console.log(`Appending ${rows.length} rows to Google Sheets...`);
    const targetStartCell = range.split(':')[0];
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: targetStartCell,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: rows,
      },
    });
  } else {
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
  }
}

/**
 * Resolves the GID (sheetId) of a tab by its name.
 */
export async function getSheetGidByName(
  spreadsheetId: string,
  sheetName: string
): Promise<string> {
  const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
  const sheets = google.sheets({ version: 'v4', auth });
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
  });
  const cleanName = sheetName.replace(/['"]/g, '').trim().toLowerCase();
  const sheet = response.data.sheets?.find(
    (s) => s.properties?.title?.trim().toLowerCase() === cleanName
  );
  if (!sheet || sheet.properties?.sheetId === undefined) {
    throw new Error(`Sheet with name "${sheetName}" not found in spreadsheet.`);
  }
  return String(sheet.properties.sheetId);
}

/**
 * Downloads a spreadsheet range as a PDF export using service account credentials.
 */
export async function exportSheetAsPdf(
  spreadsheetId: string,
  gid: string,
  range: string
): Promise<Buffer> {
  const auth = getGoogleAuth([
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/spreadsheets.readonly',
  ]);
  const client = await auth.getClient();

  // Export parameters optimized for clear landscape scoreboard screenshotting
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=pdf&gid=${gid}&range=${range}&size=letter&portrait=false&fitw=true&gridlines=true&printtitle=false&sheetnames=false`;
  console.log(`Requesting PDF export from: ${url}`);
  
  const response = await client.request<ArrayBuffer>({
    url,
    responseType: 'arraybuffer',
  });

  return Buffer.from(response.data);
}
