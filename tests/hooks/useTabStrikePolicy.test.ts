import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  resolveTabStrikeRules,
  useTabStrikePolicy,
  type UseTabStrikePolicyArgs,
} from '@/hooks/useTabStrikePolicy';
import { resetHandOffForTests } from '@/utils/attemptHandOff';
import { resetPermissionPromptForTests } from '@/utils/permissionPrompt';

let hasFocus = true;
let visibility: DocumentVisibilityState = 'visible';

function leave() {
  hasFocus = false;
  act(() => {
    window.dispatchEvent(new Event('blur'));
  });
}

function comeBack() {
  hasFocus = true;
  visibility = 'visible';
  act(() => {
    vi.advanceTimersByTime(1_250);
  });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function setup(overrides: Partial<UseTabStrikePolicyArgs> = {}) {
  let total = 0;
  const countStrike = vi.fn(() => Promise.resolve(++total));
  const submit = vi.fn(() => Promise.resolve());
  const onSubmitted = vi.fn();
  const base: UseTabStrikePolicyArgs = {
    rules: { threshold: 3, rule: null },
    warn: true,
    serverCount: 0,
    countStrike,
    submit,
    onSubmitted,
    enabled: true,
    sessionActive: true,
    ready: true,
    serverExits: [],
    attempt: 0,
    getPosition: () => ({}),
    saveExits: undefined,
    ...overrides,
  };
  const hook = renderHook(
    (props: UseTabStrikePolicyArgs) => useTabStrikePolicy(props),
    { initialProps: base }
  );
  return { hook, base, countStrike, submit, onSubmitted };
}

describe('resolveTabStrikeRules', () => {
  const settings = {
    tabWarningThreshold: 4,
    tabAwayLimitSeconds: 30,
    tabAwayAutoSubmit: true,
  };

  it('prefers the per-student override, then the session, then 3', () => {
    expect(resolveTabStrikeRules({ settings }).threshold).toBe(4);
    expect(
      resolveTabStrikeRules({
        settings,
        override: { tabWarningThreshold: 'off' },
      }).threshold
    ).toBe('off');
    expect(resolveTabStrikeRules({ settings: {} }).threshold).toBe(3);
  });

  it('never submits in a live session', () => {
    expect(resolveTabStrikeRules({ settings, live: true })).toEqual({
      threshold: 'off',
      rule: { limitMs: 30_000, autoSubmit: false },
    });
  });

  it('has no rules without settings', () => {
    expect(resolveTabStrikeRules({ settings: null })).toEqual({
      threshold: 'off',
      rule: null,
    });
  });
});

describe('useTabStrikePolicy', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'Date',
        'performance',
        'requestAnimationFrame',
        'cancelAnimationFrame',
      ],
    });
    vi.setSystemTime(1_000_000);
    hasFocus = true;
    visibility = 'visible';
    vi.spyOn(document, 'hasFocus').mockImplementation(() => hasFocus);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    });
  });
  afterEach(() => {
    resetHandOffForTests();
    resetPermissionPromptForTests();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('counts an exit and shows the warning', async () => {
    const { hook, countStrike, submit } = setup();
    leave();
    await flush();
    expect(countStrike).toHaveBeenCalledWith(0);
    expect(hook.result.current.warningOpen).toBe(true);
    expect(hook.result.current.warningCount).toBe(1);
    act(() => hook.result.current.dismiss());
    expect(hook.result.current.warningOpen).toBe(false);
    expect(submit).not.toHaveBeenCalled();
  });

  it('submits at the threshold, then shows the notice', async () => {
    const { hook, submit, onSubmitted } = setup({
      rules: { threshold: 1, rule: null },
    });
    leave();
    await flush();
    expect(hook.result.current.warningOpen).toBe(true);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    await flush();
    expect(submit).toHaveBeenCalledWith('strikes');
    expect(onSubmitted).toHaveBeenCalledWith('strikes');
  });

  it('shows no notice when the submit fails', async () => {
    const submit = vi.fn(() => Promise.reject(new Error('offline')));
    const { onSubmitted } = setup({
      rules: { threshold: 1, rule: null },
      submit,
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    leave();
    await flush();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    await flush();
    expect(submit).toHaveBeenCalled();
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it('shows no notice when nothing was submitted', async () => {
    const submit = vi.fn(() => Promise.resolve(false));
    const { onSubmitted } = setup({
      rules: { threshold: 1, rule: null },
      submit,
    });
    leave();
    await flush();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    await flush();
    expect(submit).toHaveBeenCalled();
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it('re-arms detection when a reset closes an open warning', async () => {
    const { hook, base, countStrike } = setup({ resetKey: 0 });
    leave();
    await flush();
    comeBack();
    hook.rerender({ ...base, resetKey: 1 });
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    leave();
    await flush();
    expect(countStrike).toHaveBeenCalledTimes(2);
  });

  it('submits an unlocked attempt on the next exit with no warning', async () => {
    const { hook, submit } = setup({ oneExitLeft: true });
    leave();
    await flush();
    expect(submit).toHaveBeenCalledWith('post-unlock');
    expect(hook.result.current.warningOpen).toBe(false);
  });

  it('still warns when the count fails to save', async () => {
    const countStrike = vi.fn(() => Promise.reject(new Error('denied')));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { hook, submit } = setup({ countStrike });
    leave();
    await flush();
    expect(hook.result.current.warningOpen).toBe(true);
    expect(submit).not.toHaveBeenCalled();
  });

  it('shows the larger of the server and local counts', () => {
    const { hook, base } = setup({ serverCount: 2 });
    expect(hook.result.current.warningCount).toBe(2);
    hook.rerender({ ...base, serverCount: 5 });
    expect(hook.result.current.warningCount).toBe(5);
  });

  it('starts the count over on a reset', async () => {
    const { hook, base } = setup({ resetKey: 0 });
    leave();
    await flush();
    expect(hook.result.current.warningCount).toBe(1);
    hook.rerender({ ...base, resetKey: 1 });
    expect(hook.result.current.warningCount).toBe(0);
    expect(hook.result.current.warningOpen).toBe(false);
  });

  it('submits when away past an auto-submit limit', async () => {
    const { submit, onSubmitted } = setup({
      rules: { threshold: 'off', rule: { limitMs: 5_000, autoSubmit: true } },
    });
    leave();
    await flush();
    act(() => {
      vi.advanceTimersByTime(5_250);
    });
    await flush();
    expect(submit).toHaveBeenCalledWith('away');
    expect(onSubmitted).toHaveBeenCalledWith('away');
  });

  it('only times exits when warnings are off', async () => {
    const onExitClosed = vi.fn();
    const { hook, countStrike } = setup({
      warn: false,
      rules: { threshold: 'off', rule: null },
      onExitClosed,
    });
    leave();
    await flush();
    expect(countStrike).not.toHaveBeenCalled();
    expect(hook.result.current.warningOpen).toBe(false);
    comeBack();
    expect(onExitClosed).toHaveBeenCalledWith('returned', expect.any(Number));
    // Re-armed: the next exit is timed too.
    leave();
    await flush();
    comeBack();
    expect(onExitClosed).toHaveBeenCalledTimes(2);
  });
});
