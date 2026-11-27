import type { Page } from '@playwright/test';
import { plcContentWriteV1 } from '@/functions/src/plcContentWrites';

// The emulators run no Functions, so each callable the specs reach runs its real handler here against the Firestore emulator.
const CALLABLES = { plcContentWriteV1 } as const;

const ORIGIN = 'https://us-central1-demo-spartboard-e2e.cloudfunctions.net';

interface HttpsWireError {
  httpErrorCode: { status: number };
  toJSON: () => unknown;
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
};

// Auth emulator ID tokens are unsigned JWTs, so the claims are read straight from the payload.
const claimsOf = (header: string | undefined): Record<string, unknown> => {
  const jwt = header?.replace(/^Bearer /, '') ?? '';
  const payload = jwt.split('.')[1] ?? '';
  return JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<
    string,
    unknown
  >;
};

export const serveCallables = async (page: Page): Promise<void> => {
  for (const [name, fn] of Object.entries(CALLABLES)) {
    await page.route(`${ORIGIN}/${name}`, async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: CORS });
        return;
      }
      const token = claimsOf(req.headers()['authorization']);
      const body = req.postDataJSON() as { data: unknown };
      try {
        const result = await fn.run({
          data: body.data as Parameters<typeof fn.run>[0]['data'],
          auth: {
            uid: String(token.sub),
            token: token as never,
            rawToken: '',
          },
          rawRequest: {} as never,
          acceptsStreaming: false,
        });
        await route.fulfill({ headers: CORS, json: { result } });
      } catch (err) {
        // Duck-typed: the handler's HttpsError comes from functions/node_modules, not the root copy.
        const e = err as Partial<HttpsWireError>;
        const wire =
          typeof e.toJSON === 'function' && e.httpErrorCode
            ? { status: e.httpErrorCode.status, error: e.toJSON() }
            : {
                status: 500,
                error: { status: 'INTERNAL', message: String(err) },
              };
        await route.fulfill({
          status: wire.status,
          headers: CORS,
          json: { error: wire.error },
        });
      }
    });
  }
};
