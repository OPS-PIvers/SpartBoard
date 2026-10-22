// Builds both listings (D5) into dist/<listing>/, each a loadable unpacked extension; --zip also packs them.
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build, type InlineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import { LISTINGS, type ListingId } from '../src/listings.ts';
import { manifestFor, type Manifest } from '../src/manifest.ts';
import { remToPx } from './remToPx.ts';

const extDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(extDir);

/** Each entry is one self-contained file: the service worker as an ES module, content scripts as IIFEs. */
const ENTRIES: { entry: string; fileName: string; format: 'es' | 'iife' }[] = [
  {
    entry: 'src/serviceWorker.ts',
    fileName: 'service-worker.js',
    format: 'es',
  },
  { entry: 'src/overlay/index.ts', fileName: 'overlay.js', format: 'iife' },
  {
    entry: 'src/playback/frameEntry.ts',
    fileName: 'locator.js',
    format: 'iife',
  },
];

const configFor = (
  listing: ListingId,
  outDir: string,
  { entry, fileName, format }: (typeof ENTRIES)[number]
): InlineConfig => ({
  configFile: false,
  root: extDir,
  logLevel: 'warn',
  mode: 'production',
  plugins: [react()],
  resolve: { alias: { '@': repoRoot } },
  define: {
    __SPART_ORIGINS__: JSON.stringify(LISTINGS[listing].origins),
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  css: {
    postcss: {
      plugins: [
        tailwindcss(path.join(extDir, 'scripts/tailwind.overlay.config.ts')),
        remToPx(),
      ],
    },
  },
  build: {
    outDir,
    emptyOutDir: false,
    target: 'chrome116',
    minify: true,
    sourcemap: false,
    lib: {
      entry: path.join(extDir, entry),
      formats: [format],
      fileName: () => fileName,
      name: format === 'iife' ? 'spartOverlay' : undefined,
    },
  },
});

async function buildListing(listing: ListingId, zip: boolean) {
  const outDir = path.join(extDir, 'dist', listing);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  for (const entry of ENTRIES) await build(configFor(listing, outDir, entry));
  const base = JSON.parse(
    readFileSync(path.join(extDir, 'manifest.json'), 'utf8')
  ) as Manifest;
  writeFileSync(
    path.join(outDir, 'manifest.json'),
    `${JSON.stringify(manifestFor(base, listing), null, 2)}\n`
  );
  copyFileSync(
    path.join(repoRoot, 'public/icon-128.png'),
    path.join(outDir, 'icon-128.png')
  );
  if (zip) {
    const zipPath = path.join(
      extDir,
      'dist',
      `spartboard-extension-${listing}-${base.version}.zip`
    );
    rmSync(zipPath, { force: true });
    execFileSync('zip', ['-qr', zipPath, '.'], { cwd: outDir });
    console.log(`Packed ${path.relative(repoRoot, zipPath)}`);
  }
  console.log(
    `Built ${LISTINGS[listing].name} into ${path.relative(repoRoot, outDir)}`
  );
}

const zip = process.argv.includes('--zip');
for (const listing of Object.keys(LISTINGS) as ListingId[]) {
  await buildListing(listing, zip);
}
