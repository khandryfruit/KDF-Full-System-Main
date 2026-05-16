import { randomUUID } from "crypto";
import { objectStorageClient, ObjectStorageService } from "./objectStorage";
import { isCloudinaryConfigured, uploadBufferToCloudinary } from "./cloudinaryStorage";

const ACL_POLICY_METADATA_KEY = "custom:aclPolicy";

function isRunningOnReplit(): boolean {
  return !!process.env.REPL_ID;
}

function parseGcsPath(fullPath: string): { bucketName: string; objectName: string } {
  const normalized = fullPath.startsWith("/") ? fullPath : `/${fullPath}`;
  const parts = normalized.split("/");
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

const objectStorageService = new ObjectStorageService();

/** Upload image buffer to Cloudinary (Railway) or Replit object storage. */
export async function uploadBufferToStorage(
  buffer: Buffer,
  contentType: string,
  extension: string,
  visibility: "public" | "private" = "public",
  cloudinaryFolder = "kdf-uploads"
): Promise<string> {
  if (!isRunningOnReplit()) {
    if (!isCloudinaryConfigured()) {
      throw new Error(
        "Image uploads on Railway require Cloudinary. Set CLOUDINARY_URL in environment variables."
      );
    }
    return uploadBufferToCloudinary(buffer, cloudinaryFolder);
  }

  const privateDir = objectStorageService.getPrivateObjectDir();
  const objectId = randomUUID();
  const fullPath = `${privateDir}/uploads/${objectId}.${extension}`;
  const { bucketName, objectName } = parseGcsPath(fullPath);

  const bucket = objectStorageClient.bucket(bucketName);
  const gcsFile = bucket.file(objectName);
  await gcsFile.save(buffer, {
    contentType,
    metadata: { cacheControl: "public, max-age=31536000" },
  });

  await gcsFile.setMetadata({
    metadata: {
      [ACL_POLICY_METADATA_KEY]: JSON.stringify({ owner: "system", visibility }),
    },
  });

  return `/objects/uploads/${objectId}.${extension}`;
}
