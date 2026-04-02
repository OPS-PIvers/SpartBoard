import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityWallStudentApp } from './ActivityWallStudentApp';

const {
  mockSetDoc,
  mockSignInAnonymously,
  mockUploadBytes,
  mockGetDownloadURL,
  mockCollection,
  mockDoc,
  mockStorageRef,
  mockAuth,
  mockDb,
  mockStorage,
} = vi.hoisted(() => ({
  mockSetDoc: vi.fn(),
  mockSignInAnonymously: vi.fn(),
  mockUploadBytes: vi.fn(),
  mockGetDownloadURL: vi.fn(),
  mockCollection: vi.fn(),
  mockDoc: vi.fn(),
  mockStorageRef: vi.fn(),
  mockAuth: { currentUser: null as { uid: string } | null },
  mockDb: {},
  mockStorage: {},
}));

vi.mock('@/config/firebase', () => ({
  auth: mockAuth,
  db: mockDb,
  storage: mockStorage,
}));

vi.mock('firebase/auth', () => ({
  signInAnonymously: mockSignInAnonymously,
}));

vi.mock('firebase/firestore', () => ({
  collection: mockCollection,
  doc: mockDoc,
  setDoc: mockSetDoc,
}));

vi.mock('firebase/storage', () => ({
  ref: mockStorageRef,
  uploadBytes: mockUploadBytes,
  getDownloadURL: mockGetDownloadURL,
}));

describe('ActivityWallStudentApp', () => {
  const originalCreateObjectURL = URL.createObjectURL.bind(URL);
  const originalRevokeObjectURL = URL.revokeObjectURL.bind(URL);

  const buildPayload = (overrides: Record<string, unknown> = {}) => ({
    id: 'activity-1',
    title: 'Warm Up',
    prompt: 'Share one idea',
    mode: 'text',
    moderationEnabled: false,
    identificationMode: 'anonymous',
    teacherUid: 'teacher-1',
    ...overrides,
  });

  const encodePayload = (payload: Record<string, unknown>) => {
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    let binary = '';
    for (let index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index]);
    }
    return encodeURIComponent(btoa(binary));
  };

  const setActivityUrl = (payload: ReturnType<typeof buildPayload>) => {
    const encoded = encodePayload(payload);
    window.history.pushState(
      {},
      '',
      `/activity-wall/${payload.id}?data=${encoded}`
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '11111111-1111-1111-1111-111111111111'
    );
    Object.defineProperty(URL, 'createObjectURL', {
      value: vi.fn(() => 'blob:preview-url'),
      writable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: vi.fn(),
      writable: true,
    });
    mockAuth.currentUser = null;
    mockCollection.mockReturnValue('submissions-collection');
    mockDoc.mockReturnValue('submission-doc');
    mockStorageRef.mockImplementation((_storage, path: string) => ({
      fullPath: path,
    }));
    mockUploadBytes.mockResolvedValue({
      ref: {
        fullPath:
          'activity_wall_photos/teacher-1_activity-1/11111111-1111-1111-1111-111111111111',
      },
    });
    mockGetDownloadURL.mockResolvedValue('https://firebase.example/photo.jpg');
    mockSignInAnonymously.mockResolvedValue({ user: { uid: 'anon-user' } });
    mockSetDoc.mockResolvedValue(undefined);
  });

  afterEach(() => {
    Object.defineProperty(URL, 'createObjectURL', {
      value: originalCreateObjectURL,
      writable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: originalRevokeObjectURL,
      writable: true,
    });
  });

  it('writes approved text submissions when moderation is off', async () => {
    const user = userEvent.setup();
    setActivityUrl(buildPayload());

    render(<ActivityWallStudentApp />);

    await user.type(
      screen.getByPlaceholderText(/type your response/i),
      'Ready to learn'
    );
    fireEvent.submit(
      screen
        .getByRole('button', { name: /submit response/i })
        .closest('form') as HTMLFormElement
    );

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalledWith(
        'submission-doc',
        expect.objectContaining({
          activityId: 'activity-1',
          content: 'Ready to learn',
          status: 'approved',
          participantLabel: 'Anonymous',
        })
      );
    });
  });

  it('writes pending text submissions when moderation is on', async () => {
    const user = userEvent.setup();
    setActivityUrl(buildPayload({ moderationEnabled: true }));

    render(<ActivityWallStudentApp />);

    await user.type(
      screen.getByPlaceholderText(/type your response/i),
      'Needs review'
    );
    fireEvent.submit(
      screen
        .getByRole('button', { name: /submit response/i })
        .closest('form') as HTMLFormElement
    );

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalledWith(
        'submission-doc',
        expect.objectContaining({
          content: 'Needs review',
          status: 'pending',
        })
      );
    });
  });

  it('writes pending photo submissions with archive metadata and exposes an accessible picker label', async () => {
    const user = userEvent.setup();
    setActivityUrl(buildPayload({ mode: 'photo', moderationEnabled: true }));

    render(<ActivityWallStudentApp />);

    const input = screen.getByLabelText(/choose a photo to upload/i);
    const photo = new File(['photo-data'], 'photo.png', { type: 'image/png' });
    await user.upload(input, photo);
    fireEvent.submit(
      screen
        .getByRole('button', { name: /submit response/i })
        .closest('form') as HTMLFormElement
    );

    await waitFor(() => {
      expect(mockUploadBytes).toHaveBeenCalled();
      expect(mockSetDoc).toHaveBeenCalledWith(
        'submission-doc',
        expect.objectContaining({
          content: 'https://firebase.example/photo.jpg',
          status: 'pending',
          storagePath:
            'activity_wall_photos/teacher-1_activity-1/11111111-1111-1111-1111-111111111111',
          archiveStatus: 'firebase',
        })
      );
    });
  });

  it('rejects photos that are exactly 10 MB to match storage rules', async () => {
    const user = userEvent.setup();
    setActivityUrl(buildPayload({ mode: 'photo' }));

    render(<ActivityWallStudentApp />);

    const photo = new File(['x'], 'photo.png', { type: 'image/png' });
    Object.defineProperty(photo, 'size', {
      value: 10 * 1024 * 1024,
    });

    await user.upload(
      screen.getByLabelText(/choose a photo to upload/i),
      photo
    );
    fireEvent.submit(
      screen
        .getByRole('button', { name: /submit response/i })
        .closest('form') as HTMLFormElement
    );

    expect(
      await screen.findByText(/photo must be smaller than 10 mb/i)
    ).toBeInTheDocument();
    expect(mockUploadBytes).not.toHaveBeenCalled();
    expect(mockSetDoc).not.toHaveBeenCalled();
  });
});
