export { captureSpreadsheetScreenshot, type ScreenshotOptions } from "./screenshot";
export { uploadCsvToGoogleSheets, type UploadOptions } from "./upload";

export interface SheetsOptionBase {
    spreadSheetId: string;
}