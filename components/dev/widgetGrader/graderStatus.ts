// window.__widgetGrader: render-settled flag and captured errors for the Playwright measurer.

import type { ProfilerOnRenderCallback } from 'react';

export interface WidgetGraderStatus {
  ready: boolean;
  errors: string[];
  /** React Profiler commits per widget id (R3). */
  commits: Record<string, number>;
  /** Delays of intervals still running, keyed by interval id (R3). */
  intervals: Record<number, number>;
}

declare global {
  interface Window {
    __widgetGrader?: WidgetGraderStatus;
  }
}

const stringify = (value: unknown): string =>
  value instanceof Error
    ? (value.stack ?? value.message)
    : typeof value === 'string'
      ? value
      : JSON.stringify(value);

export function installGraderStatus(): WidgetGraderStatus {
  if (window.__widgetGrader) return window.__widgetGrader;
  const status: WidgetGraderStatus = {
    ready: false,
    errors: [],
    commits: {},
    intervals: {},
  };
  window.__widgetGrader = status;
  const setInterval = window.setInterval.bind(window);
  const clearInterval = window.clearInterval.bind(window);
  window.setInterval = ((
    handler: TimerHandler,
    delay?: number,
    ...rest: unknown[]
  ) => {
    const id = setInterval(handler, delay, ...rest);
    status.intervals[id] = Number(delay) || 0;
    return id;
  }) as typeof window.setInterval;
  window.clearInterval = ((id?: number) => {
    if (id !== undefined) delete status.intervals[id];
    clearInterval(id);
  }) as typeof window.clearInterval;
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    status.errors.push(args.map(stringify).join(' '));
    original(...args);
  };
  window.addEventListener('error', (e) =>
    status.errors.push(stringify(e.error ?? e.message))
  );
  window.addEventListener('unhandledrejection', (e) =>
    status.errors.push(stringify(e.reason))
  );
  return status;
}

export const recordCommit: ProfilerOnRenderCallback = (id) => {
  const status = window.__widgetGrader;
  if (status) status.commits[id] = (status.commits[id] ?? 0) + 1;
};
