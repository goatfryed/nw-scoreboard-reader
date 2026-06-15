import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

/**
 * Extracts the clip slug from various Twitch clip URL formats.
 */
export function extractClipSlug(url: string): string {
  try {
    // If it's already just a slug (no URL characters)
    if (!url.includes('.') && !url.includes('/')) {
      return url.trim();
    }

    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    const host = parsed.hostname.toLowerCase();
    
    if (host === 'clips.twitch.tv') {
      const slug = parsed.pathname.replace(/^\//, '');
      if (slug) return slug;
    }
    
    if (host === 'twitch.tv' || host === 'www.twitch.tv') {
      const match = parsed.pathname.match(/^\/[^/]+\/clip\/([^/]+)/);
      if (match && match[1]) {
        return match[1];
      }
    }
  } catch (e) {
    // Fallback if URL parsing throws
  }
  
  throw new Error(`Could not parse Twitch clip slug from URL: ${url}`);
}


interface VideoQuality {
  frameRate: number;
  quality: string;
  sourceURL: string;
}

interface PlaybackAccessToken {
  signature: string;
  value: string;
}

interface GQLClipResponse {
  data?: {
    clip?: {
      videoQualities?: VideoQuality[];
      playbackAccessToken?: PlaybackAccessToken;
    };
  };
}

export async function getClipVideoUrl(slug: string): Promise<string> {
  const query = `
    query($slug: ID!) {
      clip(slug: $slug) {
        videoQualities {
          frameRate
          quality
          sourceURL
        }
        playbackAccessToken(params: {
          platform: "web",
          playerBackend: "mediaplayer",
          playerType: "site"
        }) {
          signature
          value
        }
      }
    }
  `;

  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!clientId) {
    throw new Error('TWITCH_CLIENT_ID is not defined in the environment. Please add it to your .env or .env.local file.');
  }

  const response = await fetch('https://gql.twitch.tv/gql', {
    method: 'POST',
    headers: {
      'Client-ID': clientId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables: { slug },
    }),
  });

  if (!response.ok) {
    throw new Error(`Twitch GQL request failed: ${response.statusText}`);
  }

  const json = (await response.json()) as any;
  const qualities = json.data?.clip?.videoQualities as VideoQuality[] | undefined;

  if (!qualities || qualities.length === 0) {
    throw new Error(`No video qualities found for clip slug: ${slug}`);
  }

  // Sort by quality descending (parse to number, e.g. "1080" -> 1080)
  // Fallback to highest quality
  const sorted = qualities.sort((a, b) => {
    const qA = parseInt(a.quality, 10) || 0;
    const qB = parseInt(b.quality, 10) || 0;
    return qB - qA;
  });

  const token = json.data?.clip?.playbackAccessToken;
  let finalUrl = sorted[0].sourceURL;
  if (token) {
    finalUrl += `?sig=${token.signature}&token=${encodeURIComponent(token.value)}`;
  }
  return finalUrl;
}

export function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, (response) => {
      if (response.statusCode && response.statusCode >= 400) {
        reject(new Error(`Failed to download clip, status code: ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

export async function downloadClip(url: string, destDir: string): Promise<string> {
  const slug = extractClipSlug(url);
  console.log(`Resolved clip slug: ${slug}`);
  
  const videoUrl = await getClipVideoUrl(slug);
  console.log(`Resolved direct MP4 URL: ${videoUrl}`);
  
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  
  const destPath = path.join(destDir, `${slug}.mp4`);
  console.log(`Downloading video to: ${destPath}`);
  await downloadFile(videoUrl, destPath);
  console.log(`Download completed successfully!`);
  
  return destPath;
}
