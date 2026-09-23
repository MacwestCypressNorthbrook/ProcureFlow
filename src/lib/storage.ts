import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const BUCKET_NAME = process.env.STORAGE_BUCKET_NAME || 'supporting_documents'
const REGION = process.env.AWS_REGION || 'us-east-2'
const ENDPOINT = process.env.AWS_ENDPOINT_URL_S3 || process.env.NEON_STORAGE_ENDPOINT

let s3ClientInstance: S3Client | null = null

export function getS3Client(): S3Client {
  if (!s3ClientInstance) {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

    s3ClientInstance = new S3Client({
      region: REGION,
      endpoint: ENDPOINT || undefined,
      forcePathStyle: true, // Recommended for S3-compatible endpoints
      credentials:
        accessKeyId && secretAccessKey
          ? {
              accessKeyId,
              secretAccessKey,
            }
          : undefined,
    })
  }
  return s3ClientInstance
}

/**
 * Upload a file buffer to Neon Object Storage bucket (supporting_documents).
 */
export async function uploadFile(
  buffer: Buffer | Uint8Array,
  key: string,
  contentType: string = 'application/octet-stream'
): Promise<string> {
  const client = getS3Client()
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  })

  await client.send(command)
  return key
}

/**
 * Generate a pre-signed temporary URL for viewing/downloading a file.
 */
export async function getSignedDownloadUrl(
  key: string,
  expiresInSeconds: number = 3600,
  options: { fileName?: string; download?: boolean } = {}
): Promise<string> {
  if (!key) return ''
  // If it's already a full HTTP(S) URL or data URL, return as-is
  if (
    key.startsWith('http://') ||
    key.startsWith('https://') ||
    key.startsWith('data:') ||
    key.startsWith('blob:')
  ) {
    return key
  }

  try {
    const client = getS3Client()

    // Ask the object store to echo a disposition so the browser either shows
    // the file inline or saves it under its original name.
    const safeName = (options.fileName ?? key.split('/').pop() ?? 'document').replace(/"/g, '')
    const disposition = options.download
      ? `attachment; filename="${safeName}"`
      : `inline; filename="${safeName}"`

    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ResponseContentDisposition: disposition,
    })
    return await getSignedUrl(client, command, { expiresIn: expiresInSeconds })
  } catch (err) {
    console.error(`Failed to generate signed URL for key "${key}":`, err)
    return key
  }
}

/** Is object storage configured at all? Callers fall back when it is not. */
export function storageConfigured(): boolean {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY &&
      (ENDPOINT || process.env.AWS_REGION)
  )
}

/**
 * A short-lived URL the browser can PUT a file to directly.
 *
 * Uploading through the app server means the file crosses the network twice
 * and a dropped connection wastes the whole transfer. Handing the browser a
 * signed URL lets it talk to the bucket itself: one hop, and a retry resends
 * only what failed.
 *
 * The content type is signed in, so a client cannot present one type to the
 * server for validation and then store something else.
 */
export async function getSignedUploadUrl(
  key: string,
  contentType: string,
  expiresInSeconds: number = 900
): Promise<string | null> {
  if (!storageConfigured()) return null
  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    })
    return await getSignedUrl(getS3Client(), command, { expiresIn: expiresInSeconds })
  } catch (err) {
    console.error(`Failed to sign an upload URL for key "${key}":`, err)
    return null
  }
}

/**
 * Delete a file from the bucket.
 */
export async function deleteFile(key: string): Promise<void> {
  const client = getS3Client()
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  })
  await client.send(command)
}
