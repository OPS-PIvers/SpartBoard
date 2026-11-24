import { describe, it, expect, vi } from 'vitest';
import { subShareWarner } from '@/utils/subShareDriveGrants';

describe('subShareWarner', () => {
  it('toasts when the caller did not ask for the warnings', () => {
    const toast = vi.fn();
    const warn = subShareWarner(undefined, toast);
    warn('No roster access', 'error');
    warn.flush();
    expect(toast).toHaveBeenCalledWith('No roster access', 'error');
  });

  it('hands every warning to the caller once, without a toast', () => {
    const toast = vi.fn();
    const onWarnings = vi.fn();
    const warn = subShareWarner(onWarnings, toast);
    warn('No roster access', 'error');
    warn('No names', 'warning');
    warn.flush();
    expect(toast).not.toHaveBeenCalled();
    expect(onWarnings).toHaveBeenCalledWith(['No roster access', 'No names']);
  });

  it('stays quiet when nothing went wrong', () => {
    const onWarnings = vi.fn();
    subShareWarner(onWarnings, vi.fn()).flush();
    expect(onWarnings).not.toHaveBeenCalled();
  });
});
