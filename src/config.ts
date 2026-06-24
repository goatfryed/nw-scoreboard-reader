import * as fs from 'fs';
import * as path from 'path';

export interface SegmentConfig {
  end?: number;
  type: 'number' | 'text' | 'kda' | 'drop';
  name?: string;
  header?: string;
}

export interface ScoreBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
  threshold?: number;
  segments?: SegmentConfig[];
  yTolerance?: number;
}

export interface EraseConfig {
  left: number;
  right: number;
}

export interface GameScoreBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
  threshold?: number;
}

export interface GameScoreBoxesConfig {
  topTeam: GameScoreBox;
  bottomTeam: GameScoreBox;
}

export interface ReaderOptions {
  columnNames: string[];
  scoreBox: ScoreBox;
  victoryBox: ScoreBox;
  headerBox?: ScoreBox;
  erase: EraseConfig;
  threshold?: number;
  gameScoreBoxes?: GameScoreBoxesConfig;
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

    const gameType = (process.env.GAME_TYPE as 'opr' | 'war') || 'opr';
    // Default configuration (built from environment variables fallback)
    const defaults: AppConfig = {
      columnNames: gameType === 'war'
        ? ["Rank", "Name", "Score", "kills", "deaths", "assists", "healing", "damage"]
        : ["Rank", "Name", "Score", "kills", "deaths", "assists", "damage", "healing", "blocked", "resources"],
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
      headerBox: {
        left: parseInt(process.env.HEADER_LEFT || '810', 10),
        top: parseInt(process.env.HEADER_TOP || '165', 10),
        right: parseInt(process.env.HEADER_RIGHT || '1460', 10),
        bottom: parseInt(process.env.HEADER_BOTTOM || '190', 10),
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
          columnNames: jsonConfig.columnNames ?? defaults.columnNames,
          scoreBox: {
            left: jsonConfig.scoreBox?.left ?? defaults.scoreBox.left,
            top: jsonConfig.scoreBox?.top ?? defaults.scoreBox.top,
            right: jsonConfig.scoreBox?.right ?? defaults.scoreBox.right,
            bottom: jsonConfig.scoreBox?.bottom ?? defaults.scoreBox.bottom,
            threshold: jsonConfig.scoreBox?.threshold,
            segments: jsonConfig.scoreBox?.segments,
            yTolerance: jsonConfig.scoreBox?.yTolerance,
          },
          victoryBox: {
            left: jsonConfig.victoryBox?.left ?? defaults.victoryBox.left,
            top: jsonConfig.victoryBox?.top ?? defaults.victoryBox.top,
            right: jsonConfig.victoryBox?.right ?? defaults.victoryBox.right,
            bottom: jsonConfig.victoryBox?.bottom ?? defaults.victoryBox.bottom,
            threshold: jsonConfig.victoryBox?.threshold,
          },
          headerBox: jsonConfig.headerBox ? {
            left: jsonConfig.headerBox.left ?? defaults.headerBox?.left ?? 0,
            top: jsonConfig.headerBox.top ?? defaults.headerBox?.top ?? 0,
            right: jsonConfig.headerBox.right ?? defaults.headerBox?.right ?? 0,
            bottom: jsonConfig.headerBox.bottom ?? defaults.headerBox?.bottom ?? 0,
            threshold: jsonConfig.headerBox.threshold,
          } : defaults.headerBox,
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
          gameScoreBoxes: jsonConfig.gameScoreBoxes ? {
            topTeam: {
              left: jsonConfig.gameScoreBoxes.topTeam.left,
              top: jsonConfig.gameScoreBoxes.topTeam.top,
              right: jsonConfig.gameScoreBoxes.topTeam.right,
              bottom: jsonConfig.gameScoreBoxes.topTeam.bottom,
              threshold: jsonConfig.gameScoreBoxes.topTeam.threshold,
            },
            bottomTeam: {
              left: jsonConfig.gameScoreBoxes.bottomTeam.left,
              top: jsonConfig.gameScoreBoxes.bottomTeam.top,
              right: jsonConfig.gameScoreBoxes.bottomTeam.right,
              bottom: jsonConfig.gameScoreBoxes.bottomTeam.bottom,
              threshold: jsonConfig.gameScoreBoxes.bottomTeam.threshold,
            }
          } : undefined,
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
      headerBox: overrides.headerBox ? { ...config.headerBox, ...overrides.headerBox } : config.headerBox,
      erase: overrides.erase ? { ...config.erase, ...overrides.erase } : config.erase,
      upload: overrides.upload ? { ...config.upload, ...overrides.upload } : config.upload,
      gameScoreBoxes: overrides.gameScoreBoxes !== undefined ? (config.gameScoreBoxes ? { ...config.gameScoreBoxes, ...overrides.gameScoreBoxes } as GameScoreBoxesConfig : overrides.gameScoreBoxes) : config.gameScoreBoxes,
    };
  }
}

export const configManager = new ConfigManager();
