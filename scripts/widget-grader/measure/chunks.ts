// Lazy chunk size per widget from the grader build's Vite manifest (R3).

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

interface ManifestChunk {
  file: string;
  css?: string[];
}

export type Manifest = Record<string, ManifestChunk>;

const GRADER_DIST = 'dist-grader';

export function loadManifest(repoRoot: string): Manifest | null {
  const path = join(repoRoot, GRADER_DIST, '.vite', 'manifest.json');
  return existsSync(path)
    ? (JSON.parse(readFileSync(path, 'utf8')) as Manifest)
    : null;
}

/** Bytes of the entry module's own chunk and CSS; null when the build has no chunk for it. */
export function chunkBytes(
  manifest: Manifest,
  entry: string,
  sizeOf: (file: string) => number
): number | null {
  const chunk = manifest[entry];
  if (!chunk) return null;
  return [chunk.file, ...(chunk.css ?? [])].reduce((n, f) => n + sizeOf(f), 0);
}

export const distSize =
  (repoRoot: string) =>
  (file: string): number => {
    const path = join(repoRoot, GRADER_DIST, file);
    return existsSync(path) ? statSync(path).size : 0;
  };
