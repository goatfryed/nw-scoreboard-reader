import * as fs from 'fs';
import * as path from 'path';

export interface ScoreBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface EraseConfig {
  left: number;
  right: number;
}

export interface ReaderOptions {
  type: 'opr' | 'war';
  scoreBox: ScoreBox;
  victoryBox: ScoreBox;
  erase: EraseConfig;
  threshold?: number;
}

export interface UploadOptions {
  spreadSheetId: string;
  upload: {
    range: string;
    append?: boolean;
  };
}

export interface ScreenshotOptions {
  spreadSheetId: string;
  screenshot: string[];
}

export interface AppConfig extends ReaderOptions, UploadOptions, ScreenshotOptions {}

class ConfigManager {
  private currentConfig: AppConfig | null = null;
  private mode: string = 'opr1920';

  public loadConfig(mode: string): AppConfig {
    this.mode = mode;
    const configPath = path.join(process.cwd(), `config.${mode}.json`);

    // Default configuration (built from environment variables fallback)
    const defaults: AppConfig = {
      type: (process.env.GAME_TYPE as 'opr' | 'war') || 'opr',
      scoreBox: {
        left: parseInt(process.env.CROP_LEFT || '0', 10),
        top: parseInt(process.env.CROP_TOP || '0', 10),
        right: parseInt(process.env.CROP_RIGHT || '0', 10),
        bottom: parseInt(process.env.CROP_BOTTOM || '0', 10),
      },
      victoryBox: {
        left: parseInt(process.env.VICTORY_LEFT || '270', 10),
        top: parseInt(process.env.VICTORY_TOP || '360', 10),
        right: parseInt(process.env.VICTORY_RIGHT || '445', 10),
        bottom: parseInt(process.env.VICTORY_BOTTOM || '425', 10),
      },
      erase: {
        left: parseInt(process.env.ERASE_LEFT || '0', 10),
        right: parseInt(process.env.ERASE_RIGHT || '0', 10),
      },
      threshold: process.env.OCR_THRESHOLD ? parseInt(process.env.OCR_THRESHOLD, 10) : 160,
      spreadSheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '',
      upload: {
        range: process.env.GOOGLE_SHEETS_RANGE || 'Sheet1!A2:H',
        append: process.env.GOOGLE_SHEETS_APPEND === 'true',
      },
      screenshot: process.env.GOOGLE_SHEETS_SCREENSHOTS
        ? process.env.GOOGLE_SHEETS_SCREENSHOTS.split(',')
        : [],
    };

    if (fs.existsSync(configPath)) {
      try {
        console.log(`Loading configuration from config.${mode}.json...`);
        const fileContent = fs.readFileSync(configPath, 'utf-8');
        const jsonConfig = JSON.parse(fileContent);

        // Merge JSON config over defaults
        this.currentConfig = {
          type: jsonConfig.type ?? defaults.type,
          scoreBox: {
            left: jsonConfig.scoreBox?.left ?? defaults.scoreBox.left,
            top: jsonConfig.scoreBox?.top ?? defaults.scoreBox.top,
            right: jsonConfig.scoreBox?.right ?? defaults.scoreBox.right,
            bottom: jsonConfig.scoreBox?.bottom ?? defaults.scoreBox.bottom,
          },
          victoryBox: {
            left: jsonConfig.victoryBox?.left ?? defaults.victoryBox.left,
            top: jsonConfig.victoryBox?.top ?? defaults.victoryBox.top,
            right: jsonConfig.victoryBox?.right ?? defaults.victoryBox.right,
            bottom: jsonConfig.victoryBox?.bottom ?? defaults.victoryBox.bottom,
          },
          erase: {
            left: jsonConfig.erase?.left ?? defaults.erase.left,
            right: jsonConfig.erase?.right ?? defaults.erase.right,
          },
          threshold: jsonConfig.threshold ?? defaults.threshold,
          spreadSheetId: jsonConfig.spreadSheetId ?? defaults.spreadSheetId,
          upload: {
            range: jsonConfig.upload?.range ?? defaults.upload.range,
            append: jsonConfig.upload?.append ?? defaults.upload.append,
          },
          screenshot: jsonConfig.screenshot ?? defaults.screenshot,
        };
      } catch (err) {
        console.error(`Failed to parse config file: ${configPath}. Using fallbacks.`, err);
        this.currentConfig = defaults;
      }
    } else {
      console.log(`Config file config.${mode}.json not found. Using environment variables fallback.`);
      this.currentConfig = defaults;
    }

    return this.currentConfig;
  }

  public getConfig(): AppConfig {
    if (!this.currentConfig) {
      return this.loadConfig(this.mode);
    }
    return this.currentConfig;
  }

  // Helper to overwrite values with CLI options dynamically
  public updateConfig(overrides: Partial<AppConfig>) {
    const config = this.getConfig();
    this.currentConfig = {
      ...config,
      ...overrides,
      scoreBox: overrides.scoreBox ? { ...config.scoreBox, ...overrides.scoreBox } : config.scoreBox,
      victoryBox: overrides.victoryBox ? { ...config.victoryBox, ...overrides.victoryBox } : config.victoryBox,
      erase: overrides.erase ? { ...config.erase, ...overrides.erase } : config.erase,
      upload: overrides.upload ? { ...config.upload, ...overrides.upload } : config.upload,
    };
  }
}

export const configManager = new ConfigManager();
