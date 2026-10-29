// Builds both listings (D5) into dist/<listing>/, each a loadable unpacked extension; --zip also packs them.
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import JSZip from 'jszip';
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
    entry: 'src/recorder/contentRecorder.ts',
    fileName: 'recorder.js',
    format: 'iife',
  },
  {
    entry: 'src/sidepanel/main.tsx',
    fileName: 'sidepanel/sidepanel.js',
    format: 'iife',
  },
  {
    entry: 'src/focus/page/main.tsx',
    fileName: 'focus/focus.js',
    format: 'iife',
  },
  {
    entry: 'src/playback/frameEntry.ts',
    fileName: 'locator.js',
    format: 'iife',
  },
];

// `--bench` builds the dev listing with perf marks on, plus the clue capturer the harness injects.
const BENCH_ENTRY: (typeof ENTRIES)[number] = {
  entry: 'src/benchCapture.ts',
  fileName: 'bench-capture.js',
  format: 'iife',
};

const configFor = (
  listing: ListingId,
  outDir: string,
  { entry, fileName, format }: (typeof ENTRIES)[number],
  bench = false
): InlineConfig => ({
  configFile: false,
  root: extDir,
  logLevel: 'warn',
  mode: 'production',
  plugins: [react()],
  resolve: { alias: { '@': repoRoot } },
  define: {
    __SPART_ORIGINS__: JSON.stringify(LISTINGS[listing].origins),
    __SPART_FUNCTIONS__: JSON.stringify(LISTINGS[listing].functionsBase),
    __SPART_VAPID_KEY__: JSON.stringify(LISTINGS[listing].vapidPublicKey),
    __SPART_BENCH__: JSON.stringify(bench),
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
    minify: !bench,
    sourcemap: false,
    lib: {
      entry: path.join(extDir, entry),
      formats: [format],
      fileName: () => fileName,
      name: format === 'iife' ? 'spartOverlay' : undefined,
    },
  },
});

async function buildListing(listing: ListingId, zip: boolean, bench = false) {
  const outDir = path.join(extDir, 'dist', bench ? 'bench' : listing);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  for (const entry of bench ? [...ENTRIES, BENCH_ENTRY] : ENTRIES)
    await build(configFor(listing, outDir, entry, bench));
  const base = JSON.parse(
    readFileSync(path.join(extDir, 'manifest.json'), 'utf8')
  ) as Manifest;
  writeFileSync(
    path.join(outDir, 'manifest.json'),
    `${JSON.stringify(manifestFor(base, listing), null, 2)}\n`
  );
  copyFileSync(
    path.join(extDir, 'src/sidepanel/index.html'),
    path.join(outDir, 'sidepanel/index.html')
  );
  copyFileSync(
    path.join(extDir, 'src/focus/page/index.html'),
    path.join(outDir, 'focus/index.html')
  );
  copyFileSync(
    path.join(repoRoot, 'public/icon-128.png'),
    path.join(outDir, 'icon-128.png')
  );
  mkdirSync(path.join(outDir, 'fonts'), { recursive: true });
  for (const file of readdirSync(path.join(extDir, 'fonts')))
    copyFileSync(
      path.join(extDir, 'fonts', file),
      path.join(outDir, 'fonts', file)
    );
  if (zip) {
    const zipPath = path.join(
      extDir,
      'dist',
      `spartboard-extension-${listing}-${base.version}.zip`
    );
    // JSZip rather than the `zip` CLI, which Windows lacks; entry names use forward slashes.
    const archive = new JSZip();
    for (const file of readdirSync(outDir, {
      recursive: true,
      withFileTypes: true,
    }))
      if (file.isFile()) {
        const full = path.join(file.parentPath, file.name);
        archive.file(
          path.relative(outDir, full).split(path.sep).join('/'),
          readFileSync(full)
        );
      }
    writeFileSync(
      zipPath,
      await archive.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
      })
    );
    console.log(`Packed ${path.relative(repoRoot, zipPath)}`);
  }
  console.log(
    `Built ${LISTINGS[listing].name} into ${path.relative(repoRoot, outDir)}`
  );
}

const zip = process.argv.includes('--zip');
if (process.argv.includes('--bench')) {
  await buildListing('dev', false, true);
} else {
  for (const listing of Object.keys(LISTINGS) as ListingId[]) {
    await buildListing(listing, zip);
  }
}
