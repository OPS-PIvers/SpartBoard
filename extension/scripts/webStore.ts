// Chrome Web Store API v2 upload and publish for one listing (docs/plans/CHROME_EXTENSION.md D7).

export const CREDENTIAL_NAMES = [
  'CWS_CLIENT_ID',
  'CWS_CLIENT_SECRET',
  'CWS_REFRESH_TOKEN',
  'CWS_PUBLISHER_ID',
] as const;

export type Credentials = Record<(typeof CREDENTIAL_NAMES)[number], string>;

type Fetch = typeof fetch;

const API = 'https://chromewebstore.googleapis.com';

export class PublishError extends Error {}

/** The credentials from the environment, or a plain message naming each missing one. */
export function readCredentials(
  env: Record<string, string | undefined>,
  environmentName: string
): Credentials {
  const missing = CREDENTIAL_NAMES.filter((n) => !env[n]?.trim());
  if (missing.length > 0)
    throw new PublishError(
      `Web Store credentials are not set up yet: add ${missing.join(', ')} as secrets of the "${environmentName}" GitHub environment (extension/README.md, "Publishing").`
    );
  return Object.fromEntries(
    CREDENTIAL_NAMES.map((n) => [n, (env[n] ?? '').trim()])
  ) as Credentials;
}

async function json(res: Response, what: string): Promise<unknown> {
  const text = await res.text();
  if (!res.ok)
    throw new PublishError(`${what} failed (HTTP ${res.status}): ${text}`);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new PublishError(`${what} returned something other than JSON.`);
  }
}

/** A top-level string field of a JSON reply, if it is one. */
const field = (body: unknown, key: string): string | undefined => {
  const value =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)[key]
      : undefined;
  return typeof value === 'string' ? value : undefined;
};

export async function accessToken(
  creds: Credentials,
  fetchImpl: Fetch = fetch
): Promise<string> {
  const res = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.CWS_CLIENT_ID,
      client_secret: creds.CWS_CLIENT_SECRET,
      refresh_token: creds.CWS_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const token = field(
    await json(res, 'Getting a Web Store token'),
    'access_token'
  );
  if (!token)
    throw new PublishError('Getting a Web Store token returned no token.');
  return token;
}

export interface PublishOptions {
  creds: Credentials;
  itemId: string;
  zip: Uint8Array<ArrayBuffer>;
  /** The version in the zip's manifest; the upload must report the same one. */
  version: string;
  fetchImpl?: Fetch;
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
}

/** Uploads the zip to the item, waits for processing, then submits it for review and publishing. */
export async function uploadAndPublish({
  creds,
  itemId,
  zip,
  version,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  log = console.log,
}: PublishOptions): Promise<string> {
  if (!/^[a-p]{32}$/.test(itemId))
    throw new PublishError(
      `"${itemId}" is not a Chrome extension ID (32 letters a to p).`
    );
  const token = await accessToken(creds, fetchImpl);
  const auth = { Authorization: `Bearer ${token}` };
  const item = `publishers/${encodeURIComponent(creds.CWS_PUBLISHER_ID)}/items/${itemId}`;

  const uploaded = await json(
    await fetchImpl(`${API}/upload/v2/${item}:upload`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/zip' },
      body: zip,
    }),
    'Uploading the package'
  );
  let state = field(uploaded, 'uploadState');
  const crxVersion = field(uploaded, 'crxVersion');
  for (
    let i = 0;
    (state === 'IN_PROGRESS' || state === 'UPLOAD_IN_PROGRESS') && i < 30;
    i++
  ) {
    await sleep(10_000);
    const status = await json(
      await fetchImpl(`${API}/v2/${item}:fetchStatus`, { headers: auth }),
      'Checking the upload'
    );
    state = field(status, 'lastAsyncUploadState');
  }
  if (state === 'IN_PROGRESS' || state === 'UPLOAD_IN_PROGRESS')
    throw new PublishError(
      'The Web Store was still processing the package after 5 minutes. Finish submitting it from the Developer Dashboard.'
    );
  if (state !== 'SUCCEEDED')
    throw new PublishError(
      `The Web Store did not accept the package (upload state ${state ?? 'missing'}). Its version must be higher than the one already uploaded.`
    );
  if (crxVersion !== undefined && crxVersion !== version)
    throw new PublishError(
      `The Web Store read version ${crxVersion} from the package, expected ${version}.`
    );
  log(`Uploaded ${version} to ${itemId}.`);

  const published = await json(
    await fetchImpl(`${API}/v2/${item}:publish`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ publishType: 'DEFAULT_PUBLISH' }),
    }),
    'Submitting for review'
  );
  const itemState = field(published, 'state') ?? 'unknown';
  log(
    `Submitted ${version} for review (state ${itemState}); it goes live when the Web Store approves it.`
  );
  return itemState;
}
