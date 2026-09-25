import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type TriggerHandler = (event: unknown) => Promise<void>;

vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentCreated: (_opts: unknown, handler: TriggerHandler) => handler,
}));
vi.mock('./functionsInit', () => ({}));
const logger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
vi.mock('firebase-functions/logger', () => logger);
vi.mock('./secrets', () => ({
  CLAUDE_TOUR_ROUTINE_TRIGGER_TOKEN: { value: () => 'routine-token' },
}));

import {
  buildRoutineFire,
  tourAnchorBatchTrigger,
  TOUR_ROUTINE_FIRE_URL,
} from './tourAnchorBatchTrigger';

const firePayload = (body: string): unknown =>
  JSON.parse((JSON.parse(body) as { text: string }).text);

const handler = tourAnchorBatchTrigger as unknown as TriggerHandler;
const fetchMock = vi.fn();

const event = (fingerprints: unknown) => ({
  params: { batchId: 'b1' },
  data: { data: () => ({ setId: 's1', fingerprints }) },
});

beforeEach(() => {
  fetchMock.mockReset();
  logger.info.mockReset();
  logger.warn.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  process.env.GCLOUD_PROJECT = 'spartboard-dev';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildRoutineFire', () => {
  it('posts the project and batch to the routine with the routine headers', () => {
    const { url, init } = buildRoutineFire('tok', 'spartboard', 'b9', 3);
    expect(url).toBe(TOUR_ROUTINE_FIRE_URL);
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer tok',
      'anthropic-beta': 'experimental-cc-routine-2026-04-01',
      'anthropic-version': '2023-06-01',
    });
    expect(firePayload(init.body)).toEqual({
      project: 'spartboard',
      batchId: 'b9',
      fingerprintCount: 3,
    });
  });
});

describe('tourAnchorBatchTrigger', () => {
  it('fires the routine once per batch', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    await handler(event(['a', 'b']));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(firePayload(init.body)).toEqual({
      project: 'spartboard-dev',
      batchId: 'b1',
      fingerprintCount: 2,
    });
  });

  it('logs a refused or failed fire without throwing', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429 });
    await expect(handler(event([]))).resolves.toBeUndefined();
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await expect(handler(event(undefined))).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });
});
