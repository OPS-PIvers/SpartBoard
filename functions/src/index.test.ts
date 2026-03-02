/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

// Granular mocks for better control in tests
const getMock = vi.fn();
const docMock = vi.fn(() => ({ get: getMock }));
const collectionMock = vi.fn(() => ({ doc: docMock }));

// Mock firebase-admin
vi.mock('firebase-admin', () => ({
  initializeApp: vi.fn(),
  firestore: Object.assign(
    vi.fn(() => ({
      collection: collectionMock,
      runTransaction: vi.fn(),
    })),
    {
      FieldValue: {
        serverTimestamp: vi.fn(),
      },
    }
  ),
}));

// Mock firebase-functions/v2
vi.mock('firebase-functions/v2', () => ({
  https: {
    onCall: <T>(
      _options: unknown,
      handler: (request: {
        data: T;
        auth?: { token: { email: string }; uid: string };
      }) => Promise<unknown>
    ) => handler,
    HttpsError: class extends Error {
      constructor(code: string, message: string) {
        super(message);
        this.name = code;
      }
    },
  },
}));

// Mock firebase-functions/v1
vi.mock('firebase-functions/v1', () => ({
  runWith: vi.fn().mockReturnThis(),
  https: {
    onCall: vi.fn(),
    HttpsError: class extends Error {},
  },
}));

// Mock axios
vi.mock('axios');

// Import the function under test
import {
  triggerJulesWidgetGeneration,
  JULES_API_SESSIONS_ENDPOINT,
} from './index';

// Mock google-auth-library
vi.mock('google-auth-library', () => {
  return {
    GoogleAuth: class {
      getAccessToken = vi.fn().mockResolvedValue('mock-token');
    },
  };
});

describe('triggerJulesWidgetGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JULES_API_KEY = 'test-api-key';
  });

  it('should call Jules API with correct endpoint', async () => {
    // Mock Admin Check using the granular mock
    getMock.mockResolvedValue({ exists: true }); // Admin check passes

    // Mock Axios response using vi.mocked for type safety
    // Use proper casting to unknown then to specific type to avoid linter errors
    const mockPost = vi.mocked(axios.post);
    mockPost.mockResolvedValue({
      data: {
        name: 'sessions/12345',
        id: '12345',
      },
    });

    const request = {
      auth: {
        token: { email: 'admin@example.com' },
        uid: 'test-uid',
      },
      data: {
        widgetName: 'Test Widget',
        description: 'Test Description',
      },
    };

    // Ensure the handler is typed correctly to match the return of onCall
    const handler = triggerJulesWidgetGeneration as unknown as (
      req: typeof request
    ) => Promise<{ success: boolean; message: string; consoleUrl: string }>;
    const result = await handler(request);

    // Verify axios call arguments
    // We expect 1 call
    expect(mockPost).toHaveBeenCalledTimes(1);

    // Extract the call arguments to assert against them cleanly without `any` assignments
    const callArgs = mockPost.mock.calls[0];
    expect(callArgs[0]).toBe(JULES_API_SESSIONS_ENDPOINT);

    const payload = callArgs[1] as Record<string, unknown>;
    expect(payload.prompt).toContain('Test Widget');
    expect(payload.sourceContext).toEqual({
      source: 'sources/github.com/OPS-PIvers/SPART_Board',
      githubRepoContext: { startingBranch: 'main' },
    });
    expect(payload.automationMode).toBe('AUTO_CREATE_PR');
    expect(payload.title).toBe('Generate Widget: Test Widget');

    const config = callArgs[2] as { headers: Record<string, string> };
    expect(config.headers).toEqual({
      Authorization: 'Bearer mock-token',
      'Content-Type': 'application/json',
    });

    // Check result
    expect(result.success).toBe(true);
    expect(result.message).toContain('12345');
    expect(result.consoleUrl).toBe('https://jules.google.com/session/12345');
  });
});
