import { describe, it, expect, afterEach } from 'vitest';
import {
  acquireBodyScrollLock,
  releaseBodyScrollLock,
} from '@/components/common/bodyScrollLock';

describe('bodyScrollLock restore', () => {
  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('leaves no inline overflow so the stylesheet rule applies again', () => {
    document.body.style.overflow = '';
    acquireBodyScrollLock();
    releaseBodyScrollLock();
    expect(document.body.style.overflow).toBe('');
  });

  it('restores a pre-existing inline overflow value', () => {
    document.body.style.overflow = 'auto';
    acquireBodyScrollLock();
    acquireBodyScrollLock();
    releaseBodyScrollLock();
    expect(document.body.style.overflow).toBe('hidden');
    releaseBodyScrollLock();
    expect(document.body.style.overflow).toBe('auto');
  });
});
