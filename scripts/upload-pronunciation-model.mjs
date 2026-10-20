/**
 * Uploads the pinned pronunciation model to a project's default Storage bucket
 * (docs/multilingual-pronunciation-engine.md F27, Paul-only step P2).
 *
 * Downloads `model_q4.onnx` from Hugging Face (or takes --file), checks it
 * against the size and md5 pinned in config/pronunciationModel.ts, and uploads
 * it to `pronunciation-models/<id>/model_q4.onnx` with an immutable year-long
 * Cache-Control. storage.rules lets anyone download that path, and the Firebase
 * download endpoint sends its own CORS headers, so the bucket needs no CORS
 * config. Idempotent: an object that already matches the pin is left alone.
 *
 * Usage:
 *   node scripts/upload-pronunciation-model.mjs --project dev
 *   node scripts/upload-pronunciation-model.mjs --project dev --file ./model_q4.onnx
 *   node scripts/upload-pronunciation-model.mjs --project prod
 *   add --dry-run to check the bucket and the file without uploading.
 *
 * Credentials: dev uses `gcloud auth application-default login`; prod uses
 * FIREBASE_SERVICE_ACCOUNT (JSON) or scripts/service-account-key.json.
 */

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { createHash } from 'node:crypto';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import {
  PRONUNCIATION_MODEL,
  hostedModelUrl,
} from '../config/pronunciationModel.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const argAfter = (flag) =>
  args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
const PROJECTS = { dev: 'spartboard-dev', prod: 'spartboard' };
const projectArg = argAfter('--project');
const projectId = projectArg ? (PROJECTS[projectArg] ?? projectArg) : null;
const localFile = argAfter('--file');
const dryRun = args.includes('--dry-run');
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

if (!projectId) {
  console.error('Pass --project dev|prod (or a project id).');
  process.exit(1);
}

function credential() {
  if (projectId !== PROJECTS.prod) return applicationDefault();
  const fromEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (fromEnv) return cert(JSON.parse(fromEnv));
  const keyPath = join(__dirname, 'service-account-key.json');
  if (existsSync(keyPath)) {
    return cert(JSON.parse(readFileSync(keyPath, 'utf8')));
  }
  console.error(
    'Prod needs FIREBASE_SERVICE_ACCOUNT or scripts/service-account-key.json.'
  );
  process.exit(1);
}

function matchesPin(bytes, md5Hex) {
  return (
    bytes === PRONUNCIATION_MODEL.bytes &&
    md5Hex.startsWith(PRONUNCIATION_MODEL.md5Prefix)
  );
}

async function md5OfFile(path) {
  const hash = createHash('md5');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

async function download(url, dest) {
  console.log(`Downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} from ${url}`);
  let received = 0;
  let lastLog = 0;
  const progress = new Transform({
    transform(chunk, _enc, cb) {
      received += chunk.length;
      if (received - lastLog > 25e6) {
        lastLog = received;
        console.log(`  ${(received / 1e6).toFixed(0)} MB`);
      }
      cb(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(res.body), progress, createWriteStream(dest));
}

const app = initializeApp({ credential: credential(), projectId });
const bucketName = `${projectId}.firebasestorage.app`;
const bucket = getStorage(app).bucket(bucketName);
const object = bucket.file(PRONUNCIATION_MODEL.storagePath);

const [exists] = await object.exists();
if (exists) {
  const [meta] = await object.getMetadata();
  const md5Hex = Buffer.from(meta.md5Hash ?? '', 'base64').toString('hex');
  if (matchesPin(Number(meta.size), md5Hex)) {
    if (meta.cacheControl !== CACHE_CONTROL && !dryRun) {
      await object.setMetadata({ cacheControl: CACHE_CONTROL });
      console.log('Fixed Cache-Control on the existing object.');
    }
    console.log(
      `Already uploaded and matches the pin: gs://${bucketName}/${PRONUNCIATION_MODEL.storagePath}`
    );
    console.log(`Students download it from ${hostedModelUrl(bucketName)}`);
    process.exit(0);
  }
  console.warn('An object exists at the model path but does not match the pin; replacing it.');
}

const tempFile = localFile
  ? null
  : join(tmpdir(), `spartboard-${PRONUNCIATION_MODEL.file}`);
const source = localFile ?? tempFile;
try {
  if (tempFile) await download(PRONUNCIATION_MODEL.huggingFaceUrl, tempFile);
  const size = statSync(source).size;
  const md5Hex = await md5OfFile(source);
  if (!matchesPin(size, md5Hex)) {
    console.error(
      `File does not match the pin: ${size} bytes, md5 ${md5Hex}; expected ${PRONUNCIATION_MODEL.bytes} bytes, md5 ${PRONUNCIATION_MODEL.md5Prefix}…`
    );
    process.exit(1);
  }
  console.log(`File matches the pin (${size} bytes, md5 ${md5Hex}).`);
  if (dryRun) {
    console.log(`Dry run: would upload to gs://${bucketName}/${PRONUNCIATION_MODEL.storagePath}`);
    process.exit(0);
  }
  await bucket.upload(source, {
    destination: PRONUNCIATION_MODEL.storagePath,
    resumable: true,
    validation: 'md5',
    metadata: {
      contentType: 'application/octet-stream',
      cacheControl: CACHE_CONTROL,
    },
  });
  console.log(
    `Uploaded gs://${bucketName}/${PRONUNCIATION_MODEL.storagePath}\nStudents download it from ${hostedModelUrl(bucketName)}`
  );
} finally {
  if (tempFile) rmSync(tempFile, { force: true });
}
