import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";

let _configured = false;

export function isCloudinaryConfigured(): boolean {
  return !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

function getCloudinary() {
  if (!_configured) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
    _configured = true;
  }
  return cloudinary;
}

export async function uploadBufferToCloudinary(
  buffer: Buffer,
  folder = "kdf-uploads"
): Promise<string> {
  const cld = getCloudinary();

  return new Promise<string>((resolve, reject) => {
    const stream = cld.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
        format: "webp",
        quality: "auto",
        fetch_format: "auto",
      },
      (error, result: UploadApiResponse | undefined) => {
        if (error) return reject(error);
        if (!result) return reject(new Error("No result from Cloudinary"));
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}
