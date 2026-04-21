import { describe, it, expect, vi, beforeEach } from 'vitest';

type TriggerHandler = (event: unknown) => Promise<void>;

// `vi.mock` is hoisted above all imports, so the factory cannot close over
// module-scope variables. `vi.hoisted` gives us a shared holder that runs in
// the same pre-import phase and is safe to reference from the mock factory.
const triggerHolder = vi.hoisted(() => ({
  handler: null as TriggerHandler | null,
}));

vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: (_path: string, handler: TriggerHandler) => {
    triggerHolder.handler = handler;
    return handler;
  },
}));

vi.mock('firebase-functions/logger', () => ({
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

// Shared test state for the firebase-admin mock, hoisted so the factory can
// reference it. Each test seeds `buildingsByOrg` with the expected post-event
// count; `shouldFailNext` forces a transient recount failure to exercise the
// retry-on-error path.
const mockState = vi.hoisted(() => ({
  buildingsByOrg: new Map<string, number>(),
  shouldFailNext: false,
  updateSpy: vi.fn(() => Promise.resolve()),
  countGetSpy: vi.fn(),
  countSpy: vi.fn(),
}));

vi.mock('firebase-admin', () => {
  const firestoreFn = vi.fn(() => ({
    collection: vi.fn((path: string) => ({
      count: () => {
        mockState.countSpy(path);
        return {
          get: () => {
            mockState.countGetSpy(path);
            if (mockState.shouldFailNext) {
              mockState.shouldFailNext = false;
              return Promise.reject(new Error('firestore transient failure'));
            }
            // Expected path: organizations/{orgId}/buildings
            const match = /^organizations\/([^/]+)\/buildings$/.exec(path);
            const orgId = match?.[1] ?? '';
            const count = mockState.buildingsByOrg.get(orgId) ?? 0;
            return Promise.resolve({ data: () => ({ count }) });
          },
        };
      },
    })),
    doc: vi.fn((path: string) => ({
      update: (patch: Record<string, unknown>) => {
        void mockState.updateSpy({ path, patch });
        return Promise.resolve();
      },
    })),
  }));

  return {
    apps: [{ name: '[DEFAULT]' }],
    initializeApp: vi.fn(),
    firestore: firestoreFn,
  };
});

// Import after mocks so the module's onDocumentWritten call lands in our stub.
import './organizationBuildingCounters';

const makeEvent = (opts: {
  orgId: string;
  buildingId: string;
  beforeExists: boolean;
  afterExists: boolean;
}) => ({
  params: { orgId: opts.orgId, buildingId: opts.buildingId },
  data: {
    before: { exists: opts.beforeExists },
    after: { exists: opts.afterExists },
  },
});

const invoke = async (event: unknown): Promise<void> => {
  if (!triggerHolder.handler) {
    throw new Error('trigger handler not registered');
  }
  await triggerHolder.handler(event);
};

describe('organizationBuildingCounters trigger', () => {
  beforeEach(() => {
    mockState.updateSpy.mockClear();
    mockState.countGetSpy.mockClear();
    mockState.countSpy.mockClear();
    mockState.buildingsByOrg.clear();
    mockState.shouldFailNext = false;
  });

  it('on create, writes the recounted value to organizations/{orgId}.buildings', async () => {
    mockState.buildingsByOrg.set('orono', 6);

    await invoke(
      makeEvent({
        orgId: 'orono',
        buildingId: 'orono-community-ed',
        beforeExists: false,
        afterExists: true,
      })
    );

    expect(mockState.countSpy).toHaveBeenCalledWith(
      'organizations/orono/buildings'
    );
    expect(mockState.updateSpy).toHaveBeenCalledTimes(1);
    expect(mockState.updateSpy).toHaveBeenCalledWith({
      path: 'organizations/orono',
      patch: { buildings: 6 },
    });
  });

  it('on delete, writes the decremented count', async () => {
    mockState.buildingsByOrg.set('orono', 5);

    await invoke(
      makeEvent({
        orgId: 'orono',
        buildingId: 'orono-community-ed',
        beforeExists: true,
        afterExists: false,
      })
    );

    expect(mockState.updateSpy).toHaveBeenCalledTimes(1);
    expect(mockState.updateSpy).toHaveBeenCalledWith({
      path: 'organizations/orono',
      patch: { buildings: 5 },
    });
  });

  it('on update-only events (both before and after exist), issues no write', async () => {
    mockState.buildingsByOrg.set('orono', 6);

    await invoke(
      makeEvent({
        orgId: 'orono',
        buildingId: 'orono-high',
        beforeExists: true,
        afterExists: true,
      })
    );

    expect(mockState.countSpy).not.toHaveBeenCalled();
    expect(mockState.updateSpy).not.toHaveBeenCalled();
  });

  it('self-heals pre-existing drift: stored value is irrelevant, write uses live count', async () => {
    // Even if the org doc already had `buildings: 99` (wrong), the trigger
    // recounts the subcollection and overwrites with the live value.
    mockState.buildingsByOrg.set('orono', 6);

    await invoke(
      makeEvent({
        orgId: 'orono',
        buildingId: 'orono-new',
        beforeExists: false,
        afterExists: true,
      })
    );

    expect(mockState.updateSpy).toHaveBeenCalledWith({
      path: 'organizations/orono',
      patch: { buildings: 6 },
    });
  });

  it('rethrows recount failures so Cloud Functions retries the invocation', async () => {
    // Force the `.get()` to reject, simulating a transient Firestore failure.
    mockState.shouldFailNext = true;
    mockState.buildingsByOrg.set('orono', 1);

    await expect(
      invoke(
        makeEvent({
          orgId: 'orono',
          buildingId: 'orono-new',
          beforeExists: false,
          afterExists: true,
        })
      )
    ).rejects.toThrow();

    expect(mockState.updateSpy).not.toHaveBeenCalled();
  });
});
