import { describe, expect, it } from 'vitest';
import {
  effectivePageProtections,
  isFocusLevel,
  pageProtectionSessionFields,
  sessionRequiresFullscreen,
  withPageProtectionGate,
} from '@/utils/pageProtections';

describe('pageProtectionSessionFields', () => {
  it('stamps nothing without the flag', () => {
    expect(
      pageProtectionSessionFields(false, {
        blockPrint: true,
        focusLevel: 'lock',
      })
    ).toEqual({});
  });

  it('stamps print blocking and a valid focus level with the flag', () => {
    expect(
      pageProtectionSessionFields(true, {
        blockPrint: true,
        focusLevel: 'lock',
      })
    ).toEqual({ blockPrint: true, focusLevel: 'lock' });
    expect(pageProtectionSessionFields(true, {})).toEqual({
      blockPrint: false,
    });
  });
});

describe('withPageProtectionGate', () => {
  it('strips the protection keys without the flag and keeps the rest', () => {
    expect(
      withPageProtectionGate(false, {
        blockCopyPaste: true,
        blockPrint: true,
        focusLevel: 'lock' as const,
        tabWarningsEnabled: true,
      })
    ).toEqual({ tabWarningsEnabled: true });
  });

  it('passes everything through with the flag', () => {
    const options = { blockCopyPaste: true, focusLevel: 'lock' as const };
    expect(withPageProtectionGate(true, options)).toBe(options);
  });
});

describe('sessionRequiresFullscreen', () => {
  it('needs Lock and Focus mode', () => {
    expect(sessionRequiresFullscreen({ focusLevel: 'lock' })).toBe(true);
    expect(
      sessionRequiresFullscreen({
        focusLevel: 'lock',
        tabWarningsEnabled: false,
      })
    ).toBe(false);
    expect(sessionRequiresFullscreen({ focusLevel: 'redirect' })).toBe(false);
    expect(sessionRequiresFullscreen({})).toBe(false);
  });
});

describe('effectivePageProtections', () => {
  it('follows the session when there is no override', () => {
    expect(
      effectivePageProtections({ blockCopyPaste: true, blockPrint: false })
    ).toEqual({ blockClipboard: true, blockPrint: false, fullscreen: false });
  });

  it('keeps a pre-flag copy and paste block from blocking print', () => {
    expect(effectivePageProtections({ blockCopyPaste: true }).blockPrint).toBe(
      false
    );
  });

  it('lets a per-student override block or allow all three', () => {
    expect(
      effectivePageProtections({}, { blockCopyPaste: true })
    ).toMatchObject({ blockClipboard: true, blockPrint: true });
    expect(
      effectivePageProtections(
        { blockCopyPaste: true, blockPrint: true },
        { blockCopyPaste: false }
      )
    ).toMatchObject({ blockClipboard: false, blockPrint: false });
  });

  it('never lets an override change fullscreen', () => {
    expect(
      effectivePageProtections(
        { focusLevel: 'lock' },
        { blockCopyPaste: false }
      ).fullscreen
    ).toBe(true);
  });
});

describe('isFocusLevel', () => {
  it('accepts only the three levels', () => {
    expect(isFocusLevel('lock')).toBe(true);
    expect(isFocusLevel('kiosk')).toBe(false);
    expect(isFocusLevel(undefined)).toBe(false);
  });
});
