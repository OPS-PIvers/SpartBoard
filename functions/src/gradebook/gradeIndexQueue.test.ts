import { describe, it, expect } from 'vitest';
import { GRADEBOOK_SESSION_COLLECTIONS } from '../gradebookCore';
import { SESSION_COLLECTION } from './gradeIndexQueue';

describe('gradeIndexQueue', () => {
  it('names the same session collections as gradebookCore', () => {
    expect(SESSION_COLLECTION).toEqual(GRADEBOOK_SESSION_COLLECTIONS);
  });
});
