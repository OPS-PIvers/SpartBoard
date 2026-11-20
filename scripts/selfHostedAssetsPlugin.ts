import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import type { Plugin } from 'vite';

// Serves and builds the tesseract and background-removal runtime files from our own origin, so no third-party code runs in the app.
const ROOT = path.resolve(__dirname, '..');
const nm = (...p: string[]) => path.join(ROOT, 'node_modules', ...p);

const TESSERACT_CORE_DIR = nm('tesseract.js-core');
const TESSERACT_CORE_FILES = [
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js',
];

const TESSERACT_FILES: Record<string, string> = {
  'tesseract/worker.min.js': nm('tesseract.js', 'dist', 'worker.min.js'),
  'tesseract/lang/eng.traineddata.gz': nm(
    '@tesseract.js-data',
    'eng',
    '4.0.0_best_int',
    'eng.traineddata.gz'
  ),
  ...Object.fromEntries(
    TESSERACT_CORE_FILES.map((f) => [
      `tesseract/core/${f}`,
      path.join(TESSERACT_CORE_DIR, f),
    ])
  ),
};

const IMGLY_ORIGIN = 'https://staticimgly.com/@imgly/background-removal-data';
const IMGLY_CACHE_DIR = nm('.cache', 'imgly-bg');
const IMGLY_PREFIX = 'imgly-bg/';

interface ImglyChunk {
  hash: string;
  name: string;
  offsets: [number, number];
}
interface ImglyManifest {
  version: string;
  resources: Record<string, { chunks: ImglyChunk[]; [k: string]: unknown }>;
}

function loadImglyManifest(): ImglyManifest {
  const manifest = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, 'config/imglyBackgroundRemovalResources.json'),
      'utf-8'
    )
  ) as ImglyManifest;
  const installed = (
    JSON.parse(
      fs.readFileSync(
        nm('@imgly', 'background-removal', 'package.json'),
        'utf-8'
      )
    ) as { version: string }
  ).version;
  if (installed !== manifest.version) {
    throw new Error(
      `@imgly/background-removal is ${installed} but config/imglyBackgroundRemovalResources.json lists ${manifest.version} files; update the manifest.`
    );
  }
  return manifest;
}

const sha256 = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');

// Chunks are fetched once, checked against the pinned sha256, and cached on disk.
async function imglyChunk(
  manifest: ImglyManifest,
  chunk: ImglyChunk
): Promise<Buffer> {
  if (!/^[0-9a-f]{64}$/.test(chunk.hash) || chunk.name !== chunk.hash) {
    throw new Error(`Bad background-removal chunk entry ${chunk.name}`);
  }
  const cached = path.join(IMGLY_CACHE_DIR, chunk.hash);
  if (fs.existsSync(cached)) {
    const buf = fs.readFileSync(cached);
    if (sha256(buf) === chunk.hash) return buf;
  }
  const res = await fetch(
    `${IMGLY_ORIGIN}/${manifest.version}/dist/${chunk.name}`
  );
  if (!res.ok) {
    throw new Error(
      `Background-removal chunk ${chunk.name}: HTTP ${res.status}`
    );
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (sha256(buf) !== chunk.hash) {
    throw new Error(
      `Background-removal chunk ${chunk.name} failed its hash check`
    );
  }
  fs.mkdirSync(IMGLY_CACHE_DIR, { recursive: true });
  fs.writeFileSync(cached, buf);
  return buf;
}

export const selfHostedAssetsPlugin = (): Plugin => ({
  name: 'self-hosted-assets',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const url = (req.url ?? '').split('?')[0].replace(/^\/+/, '');
      try {
        const file = TESSERACT_FILES[url];
        if (file) {
          res.setHeader(
            'Content-Type',
            url.endsWith('.js') ? 'text/javascript' : 'application/gzip'
          );
          fs.createReadStream(file).pipe(res);
          return;
        }
        if (!url.startsWith(IMGLY_PREFIX)) return next();
        const manifest = loadImglyManifest();
        const name = url.slice(IMGLY_PREFIX.length);
        if (name === 'resources.json') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(manifest.resources));
          return;
        }
        const chunk = Object.values(manifest.resources)
          .flatMap((r) => r.chunks)
          .find((c) => c.name === name);
        if (!chunk) return next();
        res.setHeader('Content-Type', 'application/octet-stream');
        res.end(await imglyChunk(manifest, chunk));
      } catch (err) {
        next(err);
      }
    });
  },
  async generateBundle() {
    for (const [fileName, file] of Object.entries(TESSERACT_FILES)) {
      this.emitFile({ type: 'asset', fileName, source: fs.readFileSync(file) });
    }
    const manifest = loadImglyManifest();
    this.emitFile({
      type: 'asset',
      fileName: `${IMGLY_PREFIX}resources.json`,
      source: JSON.stringify(manifest.resources),
    });
    const chunks = new Map<string, ImglyChunk>();
    for (const r of Object.values(manifest.resources)) {
      for (const c of r.chunks) chunks.set(c.name, c);
    }
    for (const chunk of chunks.values()) {
      this.emitFile({
        type: 'asset',
        fileName: `${IMGLY_PREFIX}${chunk.name}`,
        source: await imglyChunk(manifest, chunk),
      });
    }
  },
});
