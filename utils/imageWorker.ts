/**
 * Web Worker for heavy image processing tasks to keep the UI responsive.
 */

export interface WorkerMessage {
  type: 'trim' | 'floodFill';
  imageData: Uint8ClampedArray;
  width: number;
  height: number;
  tolerance?: number;
}

export interface TrimResult {
  type: 'trim';
  found: boolean;
  minX?: number;
  minY?: number;
  width?: number;
  height?: number;
}

export interface FloodFillResult {
  type: 'floodFill';
  imageData: Uint8ClampedArray;
}

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const { type, imageData, width, height, tolerance } = e.data;

  if (type === 'trim') {
    const result = trimImageData(imageData, width, height);
    self.postMessage({ type: 'trim', ...result });
  } else if (type === 'floodFill') {
    const result = removeBackgroundFloodFill(
      imageData,
      width,
      height,
      tolerance ?? 20
    );
    self.postMessage({ type: 'floodFill', imageData: result });
  }
};

/**
 * Trims transparent whitespace from image data.
 * Returns the bounds of the non-transparent area.
 */
export function trimImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number
) {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let found = false;

  // Use a 32-bit view for faster scanning of the alpha channel
  const data32 = new Uint32Array(data.buffer);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Check if alpha channel is non-zero. In little-endian, alpha is the
      // most significant byte (0xAA_BB_GG_RR), so isolate it with >>> 24 —
      // checking the whole word (`!== 0`) is wrong whenever a transparent
      // pixel still carries non-zero RGB (e.g. removeBackgroundFloodFill
      // below zeroes only the alpha byte), which would count it as opaque.
      if (data32[y * width + x] >>> 24 !== 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        found = true;
      }
    }
  }

  if (!found) {
    return { found: false };
  }

  // Add a small padding
  const padding = 2;
  const sMinX = Math.max(0, minX - padding);
  const sMinY = Math.max(0, minY - padding);
  const sMaxX = Math.min(width - 1, maxX + padding);
  const sMaxY = Math.min(height - 1, maxY + padding);

  return {
    found: true,
    minX: sMinX,
    minY: sMinY,
    width: sMaxX - sMinX + 1,
    height: sMaxY - sMinY + 1,
  };
}

/**
 * Fallback background removal using flood fill from corners.
 */
export function removeBackgroundFloodFill(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  tolerance = 20
) {
  const visited = new Uint8Array(width * height);
  const queue: [number, number][] = [];

  // Start from all four corners
  const corners = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];

  corners.forEach(([x, y]) => {
    const offset = (y * width + x) * 4;
    const a = data[offset + 3];

    if (a > 0) {
      queue.push([x, y]);
      visited[y * width + x] = 1;
    }
  });

  // Sample color from top-left corner as the reference background color
  const startOffset = 0;
  const bgR = data[startOffset];
  const bgG = data[startOffset + 1];
  const bgB = data[startOffset + 2];

  const matchColor = (offset: number) => {
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const a = data[offset + 3];

    if (a === 0) return true;

    const diff = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
    return diff <= tolerance * 3;
  };

  // Efficient BFS for flood fill
  let head = 0;
  while (head < queue.length) {
    const pos = queue[head++];
    if (!pos) continue;

    const [x, y] = pos;
    const offset = (y * width + x) * 4;

    if (matchColor(offset)) {
      data[offset + 3] = 0; // Set to transparent

      // Check neighbors
      const neighbors = [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ];

      for (const [nx, ny] of neighbors) {
        if (
          nx >= 0 &&
          nx < width &&
          ny >= 0 &&
          ny < height &&
          visited[ny * width + nx] === 0
        ) {
          visited[ny * width + nx] = 1;
          queue.push([nx, ny]);
        }
      }
    }
  }

  return data;
}
