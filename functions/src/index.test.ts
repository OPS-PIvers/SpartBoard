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
    onCall: vi.fn().mockImplementation((handler: unknown) => handler),
    HttpsError: class extends Error {
      constructor(code: string, message: string) {
        super(message);
        this.name = code;
      }
    },
  },
}));

// Mock axios
vi.mock('axios');

// Import the function under test
import {
  triggerJulesWidgetGeneration,
  JULES_API_SESSIONS_ENDPOINT,
  fetchWeatherProxy,
  checkUrlCompatibility,
} from './index';

// Mock google-auth-library
vi.mock('google-auth-library', () => {
  return {
    GoogleAuth: class {
      getClient = vi.fn().mockResolvedValue({
        getAccessToken: vi.fn().mockResolvedValue('mock-token'),
      });
      getAccessToken = vi.fn().mockResolvedValue('mock-token');
    },
  };
});

describe('Token Object Type Guard', () => {
  it('should successfully pass when auth.getAccessToken returns an object with a token property', async () => {
    // Override the mock specifically for this test
    const { GoogleAuth } = await import('google-auth-library');

    vi.mocked(GoogleAuth).mockImplementationOnce(() => {
      return {
        getClient: vi.fn(),
        getAccessToken: vi
          .fn()
          .mockResolvedValue({ token: 'mock-object-token' }),
      } as unknown as InstanceType<typeof GoogleAuth>;
    });

    // Mock Admin Check using the granular mock
    getMock.mockResolvedValue({ exists: true });

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

    const handler = triggerJulesWidgetGeneration as unknown as (
      req: typeof request
    ) => Promise<{ success: boolean; message: string; consoleUrl: string }>;
    const result = await handler(request);

    expect(mockPost).toHaveBeenCalledTimes(1);
    const config = mockPost.mock.calls[0][2] as {
      headers: Record<string, string>;
    };
    // Should correctly extract 'mock-object-token' from the { token: 'mock-object-token' } object
    expect(config.headers.Authorization).toBe('Bearer mock-object-token');
    expect(result.success).toBe(true);
  });
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

describe('fetchWeatherProxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw unauthenticated error if no auth context', async () => {
    const handler = fetchWeatherProxy as unknown as (
      req: unknown,
      context: unknown
    ) => Promise<unknown>;
    await expect(
      handler({ url: 'https://api.openweathermap.org/data/2.5/weather' }, {})
    ).rejects.toThrow('The function must be called while authenticated.');
  });

  it('should throw invalid-argument for invalid host', async () => {
    const handler = fetchWeatherProxy as unknown as (
      req: unknown,
      context: unknown
    ) => Promise<unknown>;
    await expect(
      handler({ url: 'https://example.com/weather' }, { auth: { uid: '123' } })
    ).rejects.toThrow(
      'Invalid proxy URL. Only https://api.openweathermap.org and https://owc.enterprise.earthnetworks.com are allowed.'
    );
  });

  it('should throw invalid-argument for invalid protocol', async () => {
    const handler = fetchWeatherProxy as unknown as (
      req: unknown,
      context: unknown
    ) => Promise<unknown>;
    await expect(
      handler(
        { url: 'http://api.openweathermap.org/data' },
        { auth: { uid: '123' } }
      )
    ).rejects.toThrow(
      'Invalid proxy URL. Only https://api.openweathermap.org and https://owc.enterprise.earthnetworks.com are allowed.'
    );
  });

  it('should return data successfully for valid openweathermap url', async () => {
    const mockGet = vi.mocked(axios.get);
    mockGet.mockResolvedValue({ data: { temp: 72 } });

    const handler = fetchWeatherProxy as unknown as (
      req: unknown,
      context: unknown
    ) => Promise<{ temp: number }>;
    const result = await handler(
      { url: 'https://api.openweathermap.org/data/2.5/weather?q=London' },
      { auth: { uid: '123' } }
    );

    expect(mockGet).toHaveBeenCalledWith(
      'https://api.openweathermap.org/data/2.5/weather?q=London'
    );
    expect(result).toEqual({ temp: 72 });
  });

  it('should return data successfully for valid earthnetworks url', async () => {
    const mockGet = vi.mocked(axios.get);
    mockGet.mockResolvedValue({ data: { o: { t: 72, ic: 0 } } });

    const handler = fetchWeatherProxy as unknown as (
      req: unknown,
      context: unknown
    ) => Promise<{ o: { t: number; ic: number } }>;
    const result = await handler(
      {
        url: 'https://owc.enterprise.earthnetworks.com/Data/GetData.ashx?si=BLLST',
      },
      { auth: { uid: '123' } }
    );

    expect(mockGet).toHaveBeenCalledWith(
      'https://owc.enterprise.earthnetworks.com/Data/GetData.ashx?si=BLLST'
    );
    expect(result).toEqual({ o: { t: 72, ic: 0 } });
  });

  it('should throw internal error if axios throws', async () => {
    const mockGet = vi.mocked(axios.get);
    mockGet.mockRejectedValue(new Error('Network error'));

    const handler = fetchWeatherProxy as unknown as (
      req: unknown,
      context: unknown
    ) => Promise<unknown>;
    await expect(
      handler(
        { url: 'https://api.openweathermap.org/data/2.5/weather?q=London' },
        { auth: { uid: '123' } }
      )
    ).rejects.toThrow('Network error');
  });
});

describe('checkUrlCompatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw unauthenticated error if no auth context', async () => {
    const handler = checkUrlCompatibility as unknown as (
      req: unknown,
      context: unknown
    ) => Promise<unknown>;
    await expect(handler({ url: 'https://example.com' }, {})).rejects.toThrow(
      'The function must be called while authenticated.'
    );
  });

  it('should return isEmbeddable false for x-frame-options deny', async () => {
    const mockHead = vi.mocked(axios.head);
    mockHead.mockResolvedValue({
      headers: {
        'x-frame-options': 'DENY',
      },
    });

    const handler = checkUrlCompatibility as unknown as (
      req: unknown,
      context: unknown
    ) => Promise<{ isEmbeddable: boolean; reason: string }>;
    const result = await handler(
      { url: 'https://example.com' },
      { auth: { uid: '123' } }
    );

    expect(result.isEmbeddable).toBe(false);
    expect(result.reason).toContain('X-Frame-Options: DENY');
  });

  it('should return isEmbeddable false for x-frame-options sameorigin', async () => {
    const mockHead = vi.mocked(axios.head);
    mockHead.mockResolvedValue({
      headers: {
        'x-frame-options': 'SAMEORIGIN',
      },
    });

    const handler = checkUrlCompatibility as unknown as (
      req: unknown,
      context: unknown
    ) => Promise<{ isEmbeddable: boolean; reason: string }>;
    const result = await handler(
      { url: 'https://example.com' },
      { auth: { uid: '123' } }
    );

    expect(result.isEmbeddable).toBe(false);
    expect(result.reason).toContain('X-Frame-Options: SAMEORIGIN');
  });

  it('should return isEmbeddable false for strict content-security-policy', async () => {
    const mockHead = vi.mocked(axios.head);
    mockHead.mockResolvedValue({
      headers: {
        'content-security-policy':
          "default-src 'self'; frame-ancestors 'none';",
      },
    });

    const handler = checkUrlCompatibility as unknown as (
      req: unknown,
      context: unknown
    ) => Promise<{ isEmbeddable: boolean; reason: string }>;
    const result = await handler(
      { url: 'https://example.com' },
      { auth: { uid: '123' } }
    );

    expect(result.isEmbeddable).toBe(false);
    expect(result.reason).toContain(
      'strict Content Security Policy (frame-ancestors)'
    );
  });

  it('should return isEmbeddable true if no restrictive headers are present', async () => {
    const mockHead = vi.mocked(axios.head);
    mockHead.mockResolvedValue({
      headers: {},
    });

    const handler = checkUrlCompatibility as unknown as (
      req: unknown,
      context: unknown
    ) => Promise<{ isEmbeddable: boolean; reason: string }>;
    const result = await handler(
      { url: 'https://example.com' },
      { auth: { uid: '123' } }
    );

    expect(result.isEmbeddable).toBe(true);
    expect(result.reason).toBe('');
  });

  it('should return isEmbeddable true and uncertain true if axios throws', async () => {
    const mockHead = vi.mocked(axios.head);
    mockHead.mockRejectedValue(new Error('Network error on head request'));

    const handler = checkUrlCompatibility as unknown as (
      req: unknown,
      context: unknown
    ) => Promise<{ isEmbeddable: boolean; uncertain: boolean; error: string }>;
    const result = await handler(
      { url: 'https://example.com' },
      { auth: { uid: '123' } }
    );

    expect(result.isEmbeddable).toBe(true);
    expect(result.uncertain).toBe(true);
    expect(result.error).toContain('Network error on head request');
  });
});
