import { describe, it, expect, vi, beforeEach } from 'vitest';

type TriggerHandler = (event: unknown) => Promise<void>;

const triggerHolder = vi.hoisted(() => ({
  handler: null as TriggerHandler | null,
}));

vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentCreated: (_path: string, handler: TriggerHandler) => {
    triggerHolder.handler = handler;
    return handler;
  },
}));

const loggerMock = vi.hoisted(() => ({
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock('firebase-functions/logger', () => loggerMock);

const adminMock = vi.hoisted(() => ({
  mailSets: [] as Array<{ id: string; payload: Record<string, unknown> }>,
}));

vi.mock('firebase-admin', () => {
  const firestoreFn = vi.fn(() => ({
    collection: vi.fn((name: string) => {
      if (name === 'mail') {
        return {
          doc: vi.fn((id: string) => ({
            set: (payload: Record<string, unknown>) => {
              adminMock.mailSets.push({ id, payload });
              return Promise.resolve();
            },
          })),
        };
      }
      throw new Error(`Unexpected collection: ${name}`);
    }),
  }));
  return {
    apps: [{}],
    initializeApp: vi.fn(),
    firestore: firestoreFn,
  };
});

import {
  buildRolloutRequestEmail,
  escapeHtml,
  ROLLOUT_NOTIFY_TO,
  type RolloutRequestDoc,
} from './rolloutRequestEmail';

const sampleDoc: RolloutRequestDoc = {
  kind: 'district',
  name: 'Jane Doe',
  email: 'jane@example.org',
  role: 'Tech Director',
  organization: 'Example Public Schools',
  domain: 'example.org',
  size: '120',
  message: 'We saw SpartBoard at a conference & want it!',
  status: 'new',
  createdAt: 1765000000000,
  submittedByUid: 'uid-123',
};

describe('escapeHtml', () => {
  it('escapes HTML-significant characters', () => {
    expect(escapeHtml(`<b>"a" & 'b'</b>`)).toBe(
      '&lt;b&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/b&gt;'
    );
  });
});

describe('buildRolloutRequestEmail', () => {
  it('includes all submitted fields and the request id', () => {
    const { subject, text, html } = buildRolloutRequestEmail(
      'req-1',
      sampleDoc
    );
    expect(subject).toBe(
      '[SpartBoard] District rollout request from Example Public Schools'
    );
    for (const value of [
      'Jane Doe',
      'jane@example.org',
      'Tech Director',
      'example.org',
      '120',
      'req-1',
    ]) {
      expect(text).toContain(value);
      expect(html).toContain(value);
    }
    // User-controlled content is escaped in the HTML body.
    expect(html).toContain('conference &amp; want it!');
    expect(html).not.toContain('conference & want it!');
  });

  it('labels pilot requests as pilots', () => {
    const { subject } = buildRolloutRequestEmail('req-2', {
      ...sampleDoc,
      kind: 'pilot',
    });
    expect(subject).toContain('Pilot request');
  });
});

describe('rolloutRequestEmail trigger', () => {
  beforeEach(() => {
    adminMock.mailSets = [];
    loggerMock.warn.mockClear();
    loggerMock.info.mockClear();
  });

  it('queues a mail doc addressed to the SpartBoard team', async () => {
    expect(triggerHolder.handler).toBeTruthy();
    await triggerHolder.handler!({
      params: { requestId: 'abc123' },
      data: { data: () => sampleDoc },
    });

    expect(adminMock.mailSets).toHaveLength(1);
    const { id, payload } = adminMock.mailSets[0];
    expect(id).toBe('rollout-abc123');
    expect(payload.to).toEqual([ROLLOUT_NOTIFY_TO]);
    expect(payload.replyTo).toBe('jane@example.org');
    expect((payload.message as { subject: string }).subject).toContain(
      'District rollout'
    );
  });

  it('warns and skips when the event has no data', async () => {
    await triggerHolder.handler!({
      params: { requestId: 'no-data' },
      data: undefined,
    });
    expect(adminMock.mailSets).toHaveLength(0);
    expect(loggerMock.warn).toHaveBeenCalled();
  });
});
