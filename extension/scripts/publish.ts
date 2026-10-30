// `node scripts/publish.ts <dev|prod> [--check]`: uploads the built zip and submits it, or with --check writes publish=true|false to GITHUB_OUTPUT (extension/README.md, "Publishing").
import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { LISTINGS, type ListingId } from '../src/listings.ts';
import {
  compareVersions,
  PublishError,
  readCredentials,
  storeVersion,
  uploadAndPublish,
} from './webStore.ts';

const extDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const listing = process.argv[2];
const checkOnly = process.argv[3] === '--check';

try {
  if (listing !== 'dev' && listing !== 'prod')
    throw new PublishError(
      'Usage: node scripts/publish.ts <dev|prod> [--check]'
    );
  const id: ListingId = listing;
  const creds = readCredentials(
    process.env,
    process.env.CWS_ENVIRONMENT ?? `chrome-web-store-${id}`
  );
  const idVariable =
    id === 'prod' ? 'SPART_EXTENSION_ID' : 'SPART_EXTENSION_ID_DEV';
  const itemId = process.env[idVariable]?.trim() ?? '';
  if (!itemId)
    throw new PublishError(
      `The ${LISTINGS[id].name} listing's ID is not set: add the repository variable ${idVariable}.`
    );
  const { version } = JSON.parse(
    readFileSync(path.join(extDir, 'manifest.json'), 'utf8')
  ) as { version: string };
  if (checkOnly) {
    const listed = await storeVersion({ creds, itemId });
    const previous = process.env.PREVIOUS_VERSION?.trim();
    let publish: boolean;
    if (listed !== undefined) {
      publish = compareVersions(version, listed) > 0;
      console.log(
        publish
          ? `The Web Store has ${listed}; publishing ${version}.`
          : `The Web Store already has ${listed}; nothing to publish.`
      );
    } else {
      publish = !previous || compareVersions(version, previous) > 0;
      console.log(
        `::notice::The Web Store reported no version, so ${version} ${publish ? 'is published' : 'is not published'} by comparing with the previous commit (${previous || 'none'}).`
      );
    }
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(process.env.GITHUB_OUTPUT, `publish=${publish}\n`);
  } else {
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
  }
} catch (err) {
  console.error(
    `::error::${err instanceof PublishError ? err.message : String(err)}`
  );
  process.exitCode = 1;
}
