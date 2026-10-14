// Browser decoding for figureMatch; kept apart so the comparison stays testable without a canvas.
import type { Pixels } from './figureMatch';

export async function decodeFigurePixels(blob: Blob): Promise<Pixels | null> {
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const { data, width, height } = ctx.getImageData(
      0,
      0,
      canvas.width,
      canvas.height
    );
    canvas.width = 0;
    canvas.height = 0;
    return { data, width, height };
  } catch {
    return null;
  }
}
