import { describe, it, expect } from 'vitest';
import {
  joinErrorMessage,
  JOIN_RELOAD_MESSAGE,
} from '@/components/student/joinErrorMessage';

describe('joinErrorMessage', () => {
  it('asks for a reload on a permission-denied Firestore error', () => {
    const err = Object.assign(
      new Error('Missing or insufficient permissions.'),
      { code: 'permission-denied' }
    );
    expect(joinErrorMessage(err)).toBe(JOIN_RELOAD_MESSAGE);
  });

  it('asks for a reload when only the permissions message survives', () => {
    expect(
      joinErrorMessage(new Error('Missing or insufficient permissions.'))
    ).toBe(JOIN_RELOAD_MESSAGE);
  });

  it('keeps the existing session-not-found and network messages', () => {
    expect(joinErrorMessage(new Error('Session not found'))).toBe(
      'Session not found. Please check your join code.'
    );
    expect(joinErrorMessage(new Error('Failed to fetch'))).toBe(
      'Connection error. Please check your internet.'
    );
  });

  it('passes other messages through and handles non-errors', () => {
    expect(joinErrorMessage(new Error('PIN is required'))).toBe(
      'PIN is required'
    );
    expect(joinErrorMessage('Invalid code format')).toBe('Invalid code format');
    expect(joinErrorMessage(42)).toBe(
      'Failed to join session due to an unexpected error.'
    );
  });
});
