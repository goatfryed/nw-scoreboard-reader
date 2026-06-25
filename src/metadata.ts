import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface Metadata {
  clipUrl?: string;
  clipId?: string;
  matchId?: string;
  gameDate?: string; // ISO format string
}

const DEFAULT_META_PATH = path.join(process.cwd(), '.tmp', 'meta.json');

export function loadMetadata(filePath: string = DEFAULT_META_PATH): Metadata | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as Metadata;
  } catch (err) {
    console.error(`Warning: Failed to parse metadata file at ${filePath}:`, err);
    return null;
  }
}

export function saveMetadata(meta: Metadata, filePath: string = DEFAULT_META_PATH): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(meta, null, 2), 'utf-8');
  console.log(`Metadata successfully saved to ${filePath}`);
}

export function clearMetadata(filePath: string = DEFAULT_META_PATH): void {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

export function generateRandomHash(): string {
  return crypto.randomBytes(4).toString('hex');
}

export function extractClipHash(clipUrl: string): string {
  let slug = clipUrl;
  try {
    const urlObj = new URL(clipUrl);
    const pathname = urlObj.pathname;
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length > 0) {
      slug = segments[segments.length - 1];
    }
  } catch (e) {
    // Not a valid URL, treat clipUrl itself as the slug
  }

  const firstHyphenIndex = slug.indexOf('-');
  if (firstHyphenIndex !== -1) {
    return slug.substring(firstHyphenIndex + 1);
  }
  return slug;
}
