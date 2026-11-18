// Posts one picture to the connector's upload endpoint (functions/src/mcp/pictureUploads.ts).
export const PICTURE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
];
/** Mirrors MAX_UPLOAD_BYTES on the server. */
export const MAX_PICTURE_BYTES = 8 * 1024 * 1024;
const MAX_EDGE = 3000;

export type UploadResult =
  { ok: true; ref: string } | { ok: false; error: string; expired: boolean };

export async function uploadPicture(
  ticket: string,
  file: Blob & { name?: string }
): Promise<UploadResult> {
  const res = await fetch('/mcp/picture-uploads', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ticket}`,
      'Content-Type': file.type,
      'X-File-Name': encodeURIComponent(file.name ?? 'picture'),
    },
    body: file,
  });
  const body = (await res.json().catch(() => ({}))) as {
    ref?: string;
    error?: string;
  };
  if (res.ok && body.ref) return { ok: true, ref: body.ref };
  return {
    ok: false,
    error: body.error ?? 'It could not be added.',
    expired: res.status === 401 || res.status === 403,
  };
}

/** A smaller JPEG for a picture over the size limit; GIFs and failures come back unchanged. */
export async function shrinkPicture(file: File): Promise<File> {
  if (file.type === 'image/gif') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas
      .getContext('2d')
      ?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.88)
    );
    if (!blob) return file;
    const name = file.name.replace(/\.[^.]+$/, '') || 'picture';
    return new File([blob], `${name}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
