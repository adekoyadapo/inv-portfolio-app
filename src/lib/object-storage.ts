import "server-only";

import {
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException
} from "@aws-sdk/client-s3";

import { env } from "@/lib/env";

let client: S3Client | null = null;
let bucketReady = false;

function s3Client() {
  if (client) return client;
  client = new S3Client({
    endpoint: `${env.S3_USE_SSL ? "https" : "http"}://${env.S3_ENDPOINT}:${env.S3_PORT}`,
    region: env.S3_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY,
      secretAccessKey: env.S3_SECRET_KEY
    }
  });
  return client;
}

async function ensureBucket() {
  if (bucketReady) return;
  const s3 = s3Client();
  try {
    await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
  } catch (error) {
    if (!isMissingBucket(error)) {
      throw error;
    }
    await s3.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }));
  }
  bucketReady = true;
}

export async function uploadLogo(file: File, institutionName: string) {
  await ensureBucket();

  const validated = await validateLogo(file);
  const safeName = institutionName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const objectKey = `institutions/${safeName || "institution"}-${crypto.randomUUID()}.${validated.extension}`;

  await s3Client().send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: objectKey,
      Body: validated.buffer,
      ContentType: validated.contentType
    })
  );

  return {
    objectKey,
    url: `${env.S3_PUBLIC_URL}/${env.S3_BUCKET}/${objectKey}`
  };
}

export async function deleteObject(objectKey?: string) {
  if (!objectKey) return;
  await ensureBucket();
  await s3Client().send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: objectKey }));
}

function isMissingBucket(error: unknown) {
  return (
    error instanceof S3ServiceException &&
    (error.name === "NotFound" || error.name === "NoSuchBucket" || error.$metadata.httpStatusCode === 404)
  );
}

async function validateLogo(file: File) {
  const maxBytes = 2 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error("Logo must be 2MB or smaller.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const detected = detectImage(buffer);
  if (!detected) {
    throw new Error("Logo must be a PNG, JPEG, GIF, or WebP image.");
  }

  return {
    buffer,
    ...detected
  };
}

function detectImage(buffer: Buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extension: "png", contentType: "image/png" };
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: "jpg", contentType: "image/jpeg" };
  }

  if (buffer.length >= 6 && (buffer.subarray(0, 6).toString("ascii") === "GIF87a" || buffer.subarray(0, 6).toString("ascii") === "GIF89a")) {
    return { extension: "gif", contentType: "image/gif" };
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { extension: "webp", contentType: "image/webp" };
  }

  return null;
}
