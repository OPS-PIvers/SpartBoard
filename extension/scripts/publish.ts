// `node scripts/publish.ts <dev|prod>`: uploads the built zip to that listing and submits it (extension/README.md, "Publishing").
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { LISTINGS, type ListingId } from '../src/listings.ts';
import { PublishError, readCredentials, uploadAndPublish } from './webStore.ts';

const extDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const listing = process.argv[2];

try {
  if (listing !== 'dev' && listing !== 'prod')
    throw new PublishError('Usage: node scripts/publish.ts <dev|prod>');
  const id: ListingId = listing;
  const creds = readCredentials(
    process.env,
    process.env.CWS_ENVIRONMENT ?? `chrome-web-store-${id}`
  );
  const itemId = process.env.CWS_ITEM_ID?.trim() ?? '';
  if (!itemId)
    throw new PublishError(
      `The ${LISTINGS[id].name} listing's ID is not set: add the repository variable ${id === 'prod' ? 'SPART_EXTENSION_ID' : 'SPART_EXTENSION_ID_DEV'}.`
    );
  const { version } = JSON.parse(
    readFileSync(path.join(extDir, 'manifest.json'), 'utf8')
  ) as { version: string };
  const zipPath = path.join(
    extDir,
    'dist',
    `spartboard-extension-${id}-${version}.zip`
  );
  await uploadAndPublish({
    creds,
    itemId,
    version,
    zip: new Uint8Array(readFileSync(zipPath)),
  });
} catch (err) {
  console.error(
    `::error::${err instanceof PublishError ? err.message : String(err)}`
  );
  process.exitCode = 1;
}
