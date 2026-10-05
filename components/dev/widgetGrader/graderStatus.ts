// window.__widgetGrader: render-settled flag and captured errors for the Playwright measurer.

export interface WidgetGraderStatus {
  ready: boolean;
  errors: string[];
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
  const status: WidgetGraderStatus = { ready: false, errors: [] };
  window.__widgetGrader = status;
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
