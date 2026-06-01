const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/jpg",
  "image/pjpeg",
]);

const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

export const PROFILE_IMAGE_MAX_BYTES = 512 * 1024;
export const PROFILE_IMAGE_MAX_DIMENSION = 256;

export function isAllowedProfileImage(file: File) {
  if (ALLOWED_IMAGE_TYPES.has(file.type)) {
    return true;
  }

  const extension = file.name.split(".").pop()?.toLowerCase();
  return extension ? ALLOWED_EXTENSIONS.has(extension) : false;
}

export async function processProfileImage(file: File): Promise<string> {
  if (!isAllowedProfileImage(file)) {
    throw new Error("Use JPEG, PNG, or WebP.");
  }

  if (file.size > PROFILE_IMAGE_MAX_BYTES) {
    throw new Error("Maximum size is 512 KB.");
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(
    1,
    PROFILE_IMAGE_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height),
  );
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Could not process image.");
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let quality = 0.85;
  let dataUrl = canvas.toDataURL("image/webp", quality);

  while (dataUrl.length > 180_000 && quality > 0.5) {
    quality -= 0.1;
    dataUrl = canvas.toDataURL("image/webp", quality);
  }

  if (!dataUrl.startsWith("data:image/")) {
    throw new Error("Could not process image.");
  }

  return dataUrl;
}
