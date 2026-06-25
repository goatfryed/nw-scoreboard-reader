import * as fs from 'fs';
import sharp from 'sharp';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export async function uploadToS3(
  matchId: string,
  scoreboardPngPath: string,
  metaJsonPath: string
): Promise<void> {
  const bucketName = process.env.S3_BUCKET_NAME;
  const endpoint = process.env.AWS_ENDPOINT_URL_S3;

  if (!bucketName || !endpoint) {
    console.warn("\nS3 Upload Warning: Missing S3 environment variables (AWS_ENDPOINT_URL_S3, S3_BUCKET_NAME). Skipping S3 upload.");
    return;
  }

  if (!fs.existsSync(scoreboardPngPath)) {
    throw new Error(`Scoreboard image not found for S3 upload at: ${scoreboardPngPath}`);
  }

  if (!fs.existsSync(metaJsonPath)) {
    throw new Error(`Metadata JSON file not found for S3 upload at: ${metaJsonPath}`);
  }

  console.log(`\nInitializing S3 client...`);
  const s3Client = new S3Client({
    endpoint,
    region: 'auto',
  });

  console.log(`Converting ${scoreboardPngPath} to WebP in-memory...`);
  const webpBuffer = await sharp(scoreboardPngPath).webp().toBuffer();

  console.log(`Uploading scoreboard.webp and meta.json to S3 bucket "${bucketName}" under match/${matchId}/...`);
  const webpKey = `match/${matchId}/scoreboard.webp`;
  const jsonKey = `match/${matchId}/meta.json`;

  // Upload WebP image
  await s3Client.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: webpKey,
    Body: webpBuffer,
    ContentType: 'image/webp',
  }));
  console.log(`  Uploaded: ${webpKey}`);

  // Upload Meta JSON
  const metaContent = fs.readFileSync(metaJsonPath, 'utf-8');
  await s3Client.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: jsonKey,
    Body: metaContent,
    ContentType: 'application/json',
  }));
  console.log(`  Uploaded: ${jsonKey}`);

  console.log(`S3 uploads completed successfully!`);
}
