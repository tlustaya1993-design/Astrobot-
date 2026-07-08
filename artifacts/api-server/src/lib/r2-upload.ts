import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { logger } from "./logger.js";

const ACCESS_KEY_ID = process.env.CLOUDFLARE_ACCESS_KEY_ID?.trim();
const SECRET_ACCESS_KEY = process.env.CLOUDFLARE_SECRET_ACCESS_KEY?.trim();
const ENDPOINT = process.env.CLOUDFLARE_ENDPOINT?.trim();
const BUCKET_NAME = process.env.CLOUDFLARE_BUCKET_NAME?.trim();

const PRESIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 дней

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Загрузка в R2 работает только при полном наборе переменных окружения. */
export function isR2Configured(): boolean {
  return Boolean(ACCESS_KEY_ID && SECRET_ACCESS_KEY && ENDPOINT && BUCKET_NAME);
}

/**
 * Безопасная диагностика: по каждой переменной R2 показывает set(<длина>) или
 * MISSING, без раскрытия секретов. Читает process.env напрямую, чтобы отражать
 * реальное окружение процесса. Для логов при старте и отладки на Railway.
 */
export function describeR2Config(): string {
  const vars: Record<string, string | undefined> = {
    CLOUDFLARE_ACCESS_KEY_ID: process.env.CLOUDFLARE_ACCESS_KEY_ID,
    CLOUDFLARE_SECRET_ACCESS_KEY: process.env.CLOUDFLARE_SECRET_ACCESS_KEY,
    CLOUDFLARE_ENDPOINT: process.env.CLOUDFLARE_ENDPOINT,
    CLOUDFLARE_BUCKET_NAME: process.env.CLOUDFLARE_BUCKET_NAME,
  };
  return Object.entries(vars)
    .map(([name, raw]) => {
      const trimmed = raw?.trim() ?? "";
      const short = name.replace("CLOUDFLARE_", "");
      return trimmed ? `${short}=set(${trimmed.length})` : `${short}=MISSING`;
    })
    .join(", ");
}

let cachedClient: S3Client | null = null;

function getClient(): S3Client {
  if (cachedClient) return cachedClient;
  // R2 — S3-совместимое хранилище. Регион "auto" для Cloudflare R2.
  cachedClient = new S3Client({
    region: "auto",
    endpoint: ENDPOINT,
    credentials: {
      accessKeyId: ACCESS_KEY_ID as string,
      secretAccessKey: SECRET_ACCESS_KEY as string,
    },
  });
  return cachedClient;
}

export interface UploadedScreenshot {
  key: string;
  /** Pre-signed URL для просмотра (действителен 7 дней). */
  url: string;
}

/**
 * Загружает буфер изображения в R2 и возвращает pre-signed URL на 7 дней.
 * Бросает ошибку, если R2 не настроен или загрузка не удалась — вызывающий код
 * решает, критично ли это (обычно скриншот опционален).
 */
export async function uploadScreenshotToR2(
  buffer: Buffer,
  mimeType: string,
): Promise<UploadedScreenshot> {
  if (!isR2Configured()) {
    throw new Error("R2 storage is not configured");
  }

  const ext = EXT_BY_MIME[mimeType] ?? "bin";
  const key = `support/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;
  const client = getClient();

  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    }),
  );

  const url = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }),
    { expiresIn: PRESIGNED_URL_TTL_SECONDS },
  );

  logger.info({ key }, "Support screenshot uploaded to R2");
  return { key, url };
}
